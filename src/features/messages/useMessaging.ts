import { byId, dealerLedger, fdate, invTotal, tk, todayISO, type Db, type Invoice, type MessageChannel, type MessageKind, type MessagingSettings, type SalesQuote } from '@shared/domain'
import { DEFAULT_TEMPLATES, renderTemplate } from '@shared/messaging'
import { shareOnWhatsApp } from '@/components/share'
import { ApiError } from '@/core/api/client'
import { useBooks } from '@/core/store/context'

export const DEFAULT_MESSAGING: MessagingSettings = {
  whatsapp: 'link', sms: 'off', testMode: true, reminderDays: 3, templates: {},
  auto: { invoice: ['whatsapp'], payment: ['whatsapp'], reminder: [], estimate: [], delivery: [], occasional: [] },
}
export const messagingOf = (db: Db): MessagingSettings => ({ ...DEFAULT_MESSAGING, ...db.company.messaging })
export const templateOf = (db: Db, kind: MessageKind): string => messagingOf(db).templates[kind] || DEFAULT_TEMPLATES[kind]

const items = (lines: { qty: number; unit?: string; name?: string }[]) => lines.map((l) => `${l.qty} ${l.unit || ''} ${l.name || ''}`.replace(/\s+/g, ' ').trim()).join(', ')
const dealerName = (db: Db, id: string) => {
  const d = byId(db.dealers, id)
  return d?.owner || d?.name || 'Sir'
}
const balance = (db: Db, dealerId: string) => (byId(db.dealers, dealerId) ? tk(dealerLedger(db, dealerId).due) : tk(0))

/** The words each template can use, filled from the record it is about. */
export const vars = {
  invoice(db: Db, inv: Invoice, extraDue = 0) {
    const total = invTotal(inv)
    return { dealer: dealerName(db, inv.dealerId), company: db.company.name, ref: inv.id, amount: tk(total), paid: tk(inv.received), due: tk(total - inv.received),
      // a bill made a moment ago is not in the ledger yet
      balance: byId(db.dealers, inv.dealerId) ? tk(dealerLedger(db, inv.dealerId).due + extraDue) : tk(total - inv.received), items: items(inv.lines), date: fdate(inv.date), valid: '', receiver: '' }
  },
  quote(db: Db, q: SalesQuote) {
    const total = q.lines.reduce((s, l) => s + l.qty * l.price, 0) - (q.discount || 0)
    return { dealer: dealerName(db, q.dealerId), company: db.company.name, ref: q.id, amount: tk(total), paid: '', due: '', balance: balance(db, q.dealerId), items: items(q.lines.map((l) => ({ ...l, name: l.name || byId(db.products, l.productId)?.name, unit: l.unit || byId(db.products, l.productId)?.unit }))), date: fdate(q.date), valid: q.validUntil ? fdate(q.validUntil) : 'a week', receiver: '' }
  },
  payment(db: Db, dealerId: string, amount: number, date: string, extraPaid = 0) {
    return { dealer: dealerName(db, dealerId), company: db.company.name, ref: '', amount: tk(amount), paid: tk(amount), due: '', balance: byId(db.dealers, dealerId) ? tk(Math.max(dealerLedger(db, dealerId).due - extraPaid, 0)) : '', items: '', date: fdate(date), valid: '', receiver: '' }
  },
  reminder(db: Db, dealerId: string) {
    const led = dealerLedger(db, dealerId)
    const oldest = led.open[0]
    return { dealer: dealerName(db, dealerId), company: db.company.name, ref: oldest?.label || '', amount: tk(led.due), paid: '', due: tk(led.due), balance: tk(led.due), items: '', date: oldest?.date ? fdate(oldest.date) : '', valid: '', receiver: '' }
  },
  delivery(db: Db, inv: Invoice, lines: { productId: string; qty: number }[], receiver: string) {
    return { dealer: dealerName(db, inv.dealerId), company: db.company.name, ref: inv.id, amount: '', paid: '', due: '', balance: balance(db, inv.dealerId),
      items: items(lines.map((l) => ({ qty: l.qty, unit: byId(db.products, l.productId)?.unit, name: byId(db.products, l.productId)?.name }))), date: fdate(todayISO()), valid: '', receiver: receiver || 'your shop' }
  },
  occasional(db: Db, dealerId: string) {
    return { dealer: dealerName(db, dealerId), company: db.company.name, ref: '', amount: '', paid: '', due: '', balance: balance(db, dealerId), items: '', date: fdate(todayISO()), valid: '', receiver: '' }
  },
}

export interface SendResult {
  ok: boolean
  text: string
}

/** Send WhatsApp and SMS messages and keep a log of each one. */
export function useMessaging() {
  const { db, act, call } = useBooks()
  const s = messagingOf(db)

  /** Which channels are switched on at all. */
  const channels: MessageChannel[] = [...(s.whatsapp !== 'off' ? ['whatsapp' as const] : []), ...(s.sms !== 'off' ? ['sms' as const] : [])]

  async function send(kind: MessageKind, channel: MessageChannel, dealerId: string, text: string, ref = '', phone?: string, name?: string): Promise<SendResult> {
    const to = phone || byId(db.dealers, dealerId)?.phone || ''
    const base = { date: todayISO(), kind, channel, to, dealerId, text, ref, name: name || undefined, test: s.testMode || undefined }
    if (!to) {
      act('logMessage', { ...base, status: 'failed', error: 'No phone number' })
      return { ok: false, text: `${byId(db.dealers, dealerId)?.name || name || 'This contact'} has no phone number` }
    }
    // link mode: WhatsApp opens with the message typed in, a person presses send
    if (channel === 'whatsapp' && s.whatsapp === 'link' && !s.testMode) {
      shareOnWhatsApp(text, to)
      act('logMessage', { ...base, status: 'opened' })
      return { ok: true, text: 'WhatsApp opened, press send' }
    }
    try {
      await call('POST', 'messaging/send', { channel, to, text })
      act('logMessage', { ...base, status: 'sent' })
      return { ok: true, text: `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} sent${s.testMode ? ' (test mode)' : ''}` }
    } catch (e) {
      const error = e instanceof ApiError ? e.message : 'Could not send'
      act('logMessage', { ...base, status: 'failed', error })
      return { ok: false, text: error }
    }
  }

  /** Send on every channel set to go out by itself for this kind. Quietly does nothing when none is. */
  async function auto(kind: MessageKind, dealerId: string, v: Record<string, string>, ref = ''): Promise<SendResult[]> {
    const chans = (s.auto[kind] || []).filter((c) => channels.includes(c))
    const text = renderTemplate(templateOf(db, kind), v)
    const out: SendResult[] = []
    for (const c of chans) out.push(await send(kind, c, dealerId, text, ref))
    return out
  }

  return { settings: s, channels, send, auto, render: (kind: MessageKind, v: Record<string, string>) => renderTemplate(templateOf(db, kind), v) }
}
