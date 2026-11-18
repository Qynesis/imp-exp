import { useMemo, useState } from 'react'
import { fshort, type MessageChannel, type MessageKind } from '@shared/domain'
import { intlPhone, renderTemplate } from '@shared/messaging'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Button, cls, Field, Icon, Pill } from '@/ui'
import { contactsOf, isMobile, type Contact } from './contacts'
import { templateOf, useMessaging, vars, type SendResult } from './useMessaging'

const CH: Record<MessageChannel, string> = { whatsapp: 'WhatsApp', sms: 'SMS' }
type Starter = 'custom' | 'reminder' | 'payment' | 'occasional'

/**
 * One message to one person: pick them from everyone in the books or type a number, choose WhatsApp
 * and/or SMS, and send. Each channel follows its own mode under Settings: WhatsApp either opens the
 * chat for you to press send or sends by itself through the Business API; SMS goes through the gateway.
 */
export function SendOne({ presetKey, onDone }: { presetKey?: string; onDone?: () => void }) {
  const { db } = useBooks()
  const msg = useMessaging()
  const all = useMemo(() => contactsOf(db), [db])
  const [picked, setPicked] = useState<Contact | null>(() => all.find((c) => c.key === presetKey) || null)
  const [q, setQ] = useState('')
  const [newName, setNewName] = useState('')
  const [starter, setStarter] = useState<Starter>(picked?.dealerId ? 'reminder' : 'custom')
  const [text, setText] = useState(() => (picked?.dealerId ? msg.render('reminder', vars.reminder(db, picked.dealerId)) : ''))
  const [busy, setBusy] = useState<MessageChannel | ''>('')
  const [result, setResult] = useState<(SendResult & { channel: MessageChannel }) | null>(null)

  const needle = q.trim().toLowerCase()
  const digits = q.replace(/\D/g, '')
  const matches = needle ? all.filter((c) => `${c.name} ${c.sub || ''} ${c.kind}`.toLowerCase().includes(needle) || (digits.length >= 3 && intlPhone(c.phone).includes(digits.replace(/^0/, '')))).slice(0, 8) : []
  const typedNumber = digits.length >= 10 && isMobile(q) && !all.some((c) => intlPhone(c.phone) === intlPhone(q))
  const history = picked ? (db.messages || []).filter((m) => intlPhone(m.to) === intlPhone(picked.phone)).slice(0, 5) : []

  const choose = (c: Contact) => {
    setPicked(c)
    setQ('')
    setResult(null)
    const s: Starter = c.dealerId ? 'reminder' : 'custom'
    setStarter(s)
    setText(fill(s, c))
  }
  const fill = (s: Starter, c: Contact | null): string => {
    if (s === 'custom' || !c) return s === 'occasional' ? renderTemplate(templateOf(db, 'occasional'), { dealer: c?.name || '', company: db.company.name }) : ''
    if (!c.dealerId) return renderTemplate(templateOf(db, s === 'reminder' ? 'occasional' : s), { dealer: c.name, company: db.company.name })
    if (s === 'reminder') return msg.render('reminder', vars.reminder(db, c.dealerId))
    if (s === 'payment') return renderTemplate(`Dear {dealer}, thank you for your payment. Your due with {company} is now {balance}.`, vars.reminder(db, c.dealerId))
    return msg.render('occasional', vars.occasional(db, c.dealerId))
  }
  const pickStarter = (s: Starter) => {
    setStarter(s)
    setText(fill(s, picked))
  }
  /** One press, one message, on the channel pressed. */
  const send = async (channel: MessageChannel) => {
    if (!picked || !text.trim()) return
    setBusy(channel)
    const kind: MessageKind = starter === 'reminder' && picked.dealerId ? 'reminder' : 'occasional'
    const r = await msg.send(kind, channel, picked.dealerId || '', text.trim(), '', picked.phone, picked.dealerId ? undefined : picked.name)
    setResult({ channel, ...r })
    setBusy('')
    if (r.ok) onDone?.()
  }
  const modeText = (c: MessageChannel) =>
    msg.settings.testMode ? 'test mode, nothing really sent' : c === 'whatsapp' ? (msg.settings.whatsapp === 'cloud' ? 'sends by itself' : 'opens WhatsApp, you press send') : 'sends by itself through the gateway'

  return (
    <div className="form-grid send-one">
      <div className="field wide">
        <span className="field-label">To</span>
        {picked ? (
          <div className="picked-contact">
            <span className="contact-avatar">{picked.name.slice(0, 1).toUpperCase()}</span>
            <span className="two-line"><b>{picked.name}</b><small className="t-muted">{picked.phone} · {picked.kind}{picked.sub ? ` · ${picked.sub}` : ''}</small></span>
            <button type="button" className="link" onClick={() => { setPicked(null); setResult(null) }}>Change</button>
          </div>
        ) : (
          <>
            <input className="in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name, or type a mobile number (01XXXXXXXXX)" aria-label="Recipient" autoComplete="off" />
            {(matches.length > 0 || typedNumber) && (
              <div className="contact-list" role="listbox" aria-label="Contacts">
                {typedNumber && (
                  <div className="contact-new">
                    <Icon name="phone" size={16} />
                    <span>New number <b>{q.trim()}</b></span>
                    <input className="in" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name (optional)" aria-label="Name for the new number" />
                    <Button size="sm" onClick={() => choose({ key: 'n:' + intlPhone(q), name: newName.trim() || q.trim(), phone: q.trim(), kind: 'Recent', sub: 'New number' })}>Use</Button>
                  </div>
                )}
                {matches.map((c) => (
                  <button key={c.key} type="button" role="option" aria-selected={false} className="contact-row" onClick={() => choose(c)}>
                    <span className="contact-avatar">{c.name.slice(0, 1).toUpperCase()}</span>
                    <span className="two-line"><b>{c.name}</b><small className="t-muted">{c.phone}{c.sub ? ` · ${c.sub}` : ''}</small></span>
                    <Pill tone="neutral">{c.kind}</Pill>
                  </button>
                ))}
              </div>
            )}
            {needle && !matches.length && !typedNumber && <small>No one matches. Type a full mobile number to message someone new; it is remembered for next time.</small>}
            {!needle && <small>{all.length} people with a phone number: dealers, suppliers, factories, staff, drivers, courier customers and numbers messaged before.</small>}
          </>
        )}
      </div>

      {picked && (
        <div className="field wide">
          <span className="field-label">Start from</span>
          <div className="chips">
            {picked.dealerId && <button type="button" className={cls('chip', starter === 'reminder' && 'on')} onClick={() => pickStarter('reminder')}>Due reminder</button>}
            {picked.dealerId && <button type="button" className={cls('chip', starter === 'payment' && 'on')} onClick={() => pickStarter('payment')}>Thanks for payment</button>}
            <button type="button" className={cls('chip', starter === 'occasional' && 'on')} onClick={() => pickStarter('occasional')}>Greeting</button>
            <button type="button" className={cls('chip', starter === 'custom' && 'on')} onClick={() => pickStarter('custom')}>Write my own</button>
          </div>
        </div>
      )}
      <Field label="Message" wide hint={`${text.length} characters${text.length > 160 ? ' · more than one SMS' : ''}`}>
        <textarea className="in" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type the message" />
      </Field>
      <div className="field wide send-buttons">
        <Button icon="send" className="btn-wa" disabled={busy !== '' || !picked || !text.trim() || !msg.channels.includes('whatsapp')} onClick={() => void send('whatsapp')}>
          {busy === 'whatsapp' ? 'Sending…' : 'WhatsApp'}
        </Button>
        <Button icon="phone" variant="secondary" disabled={busy !== '' || !picked || !text.trim() || !msg.channels.includes('sms')} onClick={() => void send('sms')}>
          {busy === 'sms' ? 'Sending…' : 'SMS'}
        </Button>
        <small className="t-muted">
          WhatsApp: {msg.channels.includes('whatsapp') ? modeText('whatsapp') : 'off'} · SMS: {msg.channels.includes('sms') ? modeText('sms') : 'off'}
          {msg.channels.length < 2 && <> · <button type="button" className="link" onClick={() => go('messages/settings')}>Switch on in Settings</button></>}
        </small>
      </div>
      {result && <p className={result.ok ? 't-good send-result' : 't-warn send-result'}><Icon name={result.ok ? 'check' : 'alert'} size={14} /> {CH[result.channel]}: {result.text}</p>}
      {history.length > 0 && (
        <div className="field wide">
          <span className="field-label">Earlier messages to {picked?.name}</span>
          <div className="rows flush">
            {history.map((m) => <div key={m.id} className="row"><span className="name normal msg-cell">{m.text}</span><span className="meta">{fshort(m.date)} · {CH[m.channel]}</span><span className="amt"><Pill tone={m.status === 'failed' ? 'warn' : 'good'}>{m.status === 'failed' ? 'Failed' : m.status === 'opened' ? 'Opened' : 'Sent'}</Pill></span></div>)}
          </div>
        </div>
      )}
    </div>
  )
}
