/**
 * Alerts worked out from the books: nothing is stored, so they can never disagree with the screens.
 * Each has a stable `id` for the situation it describes, so "read" stays read until something changes
 * (a new overdue bill, a different month, a new low-stock product).
 */
import { PAPERS } from '../catalog'
import { addDays, addMonths, daysBetween, fdate, fmonth, fmt, thisMonth, tk, todayISO } from '../format'
import type { Db, ISODate, PageId } from '../types'
import { depreciationDue } from './assets'
import { memo, sum } from './common'
import { receivables } from './dealers'
import { availableQty, pendingDeliveries } from './delivery'
import { foCalc } from './factory'
import { investorRows } from './investors'
import { isLowStock } from './products'
import { supplierLedger } from './suppliers'
import { tradeOverview } from './trade'
import { tradeAlerts } from './tradeTerms'
import { paperAlerts, servicesDue } from './transport'

export type NoticeTone = 'warn' | 'info' | 'good'
export type NoticeKind = 'money' | 'stock' | 'delivery' | 'trade' | 'factory' | 'transport' | 'sales' | 'accounts' | 'messages' | 'people'
export interface Notice {
  id: string
  kind: NoticeKind
  tone: NoticeTone
  title: string
  body: string
  /** The screen it belongs to: only people who can open it see the alert. */
  page: PageId
  /** Where tapping it goes, e.g. 'dealers' or 'factory-orders/FO-1042'. */
  to: string
  date: ISODate
  /** Higher comes first. */
  rank: number
  /** Only for the person linked to this employee (e.g. the answer to their leave request). */
  forEmployee?: string
}

export const NOTICE_KINDS: Record<NoticeKind, string> = {
  money: 'Dues and payments', stock: 'Stock', delivery: 'Delivery', trade: 'Imports and exports', factory: 'Factory orders',
  transport: 'Transport', sales: 'Sales', accounts: 'Accounts', messages: 'Messages', people: 'Staff and leave',
}

export const notifications = (db: Db, today: ISODate = todayISO()): Notice[] =>
  memo(db, 'notices:' + today, () => {
    const out: Notice[] = []
    const add = (n: Omit<Notice, 'date'> & { date?: ISODate }) => out.push({ date: today, ...n })

    // money owed to us
    for (const r of receivables(db).rows) {
      const oldest = r.open[0]
      if (r.overdue && oldest) {
        add({ id: `overdue:${r.dealer.id}:${oldest.id}`, kind: 'money', tone: 'warn', rank: 80 + Math.min(-(r.days || 0), 60) / 10, page: 'dealers', to: 'dealers',
          title: `${r.dealer.name}: ${tk(r.due)} overdue`, body: `${r.statusText}. Oldest unpaid bill ${oldest.label}.` })
      }
      if (r.dealer.terms === 'credit' && r.dealer.limit > 0 && r.due > r.dealer.limit) {
        add({ id: `limit:${r.dealer.id}:${Math.floor(r.due / 10000)}`, kind: 'money', tone: 'warn', rank: 70, page: 'dealers', to: 'dealers',
          title: `${r.dealer.name} is over the credit limit`, body: `Owes ${tk(r.due)} against a limit of ${tk(r.dealer.limit)}.` })
      }
    }
    // money we owe suppliers, by bill age
    for (const s of db.suppliers) {
      const l = supplierLedger(db, s.id)
      if (l.due <= 0 || s.terms !== 'credit') continue
      const late = l.bills.filter((b) => b.date && b.amount - b.paid > 0 && daysBetween(addDays(b.date, s.days || 0), today) > 0)
      if (!late.length) continue
      const oldest = late[late.length - 1]
      add({ id: `supplier:${s.id}:${oldest.id}`, kind: 'money', tone: 'warn', rank: 60, page: 'suppliers', to: 'suppliers/' + s.id,
        title: `Pay ${s.name}: ${tk(l.due)}`, body: `${late.length} bill${late.length === 1 ? '' : 's'} past the ${s.days}-day credit, oldest ${oldest.billNo || 'bill'} of ${fdate(oldest.date)}.` })
    }

    // stock
    const low = db.products.filter(isLowStock)
    for (const p of low) {
      add({ id: `low:${p.id}`, kind: 'stock', tone: p.stock <= 0 ? 'warn' : 'info', rank: p.stock <= 0 ? 65 : 45, page: p.kind === 'finished' ? 'products' : 'raw-materials', to: p.kind === 'finished' ? 'products' : 'raw-materials',
        title: p.stock <= 0 ? `${p.name} is out of stock` : `${p.name} is running low`, body: `${fmt(p.stock)} ${p.unit} left; reorder level ${fmt(p.lowAt)} ${p.unit}.` })
    }
    for (const p of db.products) {
      const avail = availableQty(db, p)
      if (!p.archived && avail < 0) {
        add({ id: `short:${p.id}`, kind: 'delivery', tone: 'warn', rank: 75, page: 'deliveries', to: 'deliveries',
          title: `Not enough ${p.name} for billed orders`, body: `Bills waiting for delivery need ${fmt(-avail)} ${p.unit} more than the warehouse holds.` })
      }
    }

    // deliveries waiting too long
    const waiting = pendingDeliveries(db).filter((x) => !x.inv.sample && daysBetween(x.inv.date, today) >= 3)
    if (waiting.length) {
      const oldest = waiting.reduce((a, b) => (a.inv.date < b.inv.date ? a : b))
      add({ id: `deliver:${oldest.inv.id}:${waiting.length}`, kind: 'delivery', tone: 'warn', rank: 68, page: 'deliveries', to: 'deliveries',
        title: `${waiting.length} bill${waiting.length === 1 ? '' : 's'} waiting 3+ days for delivery`, body: `Oldest ${oldest.inv.id} from ${fdate(oldest.inv.date)}.` })
    }

    // imports and exports
    const trade = tradeOverview(db)
    for (const r of trade.arriving) {
      const late = (r.daysTo ?? 0) < 0
      add({ id: `ship:${r.s.id}:${r.next}`, kind: 'trade', tone: late ? 'warn' : 'info', rank: late ? 62 : 40, page: 'imports', to: 'imports/' + r.s.id,
        title: `${r.s.id}: ${r.next} ${late ? `${-(r.daysTo ?? 0)} days late` : r.daysTo === 0 ? 'today' : `in ${r.daysTo} day${r.daysTo === 1 ? '' : 's'}`}`, body: `${r.name}${r.expected ? `, expected ${fdate(r.expected)}` : ''}.` })
    }
    if (trade.demurrage > 0) {
      add({ id: `demurrage:${today.slice(0, 7)}`, kind: 'trade', tone: 'warn', rank: 66, page: 'customs', to: 'customs',
        title: `Port demurrage is running: ${tk(trade.demurrage)}`, body: 'Goods are past their free time at the port. Clear them to stop the charge.' })
    }
    if (trade.docsMissing > 0) {
      add({ id: `docs:${trade.docsMissing}`, kind: 'trade', tone: 'info', rank: 35, page: 'customs', to: 'customs',
        title: `${trade.docsMissing} customs document${trade.docsMissing === 1 ? '' : 's'} missing`, body: 'Collect them before the bill of entry is assessed.' })
    }

    // factory orders past their date
    for (const o of db.factoryOrders) {
      const c = foCalc(db, o)
      if (c.pending > 0 && o.expected && o.expected < today) {
        add({ id: `fo:${o.id}:${o.expected}`, kind: 'factory', tone: 'warn', rank: 58, page: 'factory-orders', to: 'factory-orders/' + o.id,
          title: `${o.id} is late from ${c.factory?.name || 'the factory'}`, body: `${fmt(c.pending)} ${c.unit} of ${c.product?.name || 'goods'} still due; expected ${fdate(o.expected)}.` })
      }
    }
    for (const e of db.estimates || []) {
      if (e.status === 'sent' && e.sentOn && daysBetween(e.sentOn, today) >= 3) {
        add({ id: `est:${e.id}`, kind: 'factory', tone: 'info', rank: 30, page: 'factory-orders', to: 'factory-orders',
          title: `No answer on estimate ${e.id}`, body: `Sent ${daysBetween(e.sentOn, today)} days ago. Follow up with the factory.` })
      }
    }

    // transport
    for (const a of paperAlerts(db)) {
      add({ id: `paper:${a.vehicle.id}:${a.paper}:${a.date}`, kind: 'transport', tone: a.state === 'expired' ? 'warn' : 'info', rank: a.state === 'expired' ? 64 : 38, page: 'transport', to: 'transport',
        title: `${a.vehicle.name}: ${PAPERS[a.paper]} ${a.state === 'expired' ? 'has expired' : `expires in ${a.days} days`}`, body: `${a.vehicle.regNo || ''} · due ${fdate(a.date)}.` })
    }
    for (const s of servicesDue(db)) {
      if (s.state === 'ok') continue
      add({ id: `service:${s.vehicle.id}:${s.dueDate || s.dueKm}`, kind: 'transport', tone: s.state === 'late' ? 'warn' : 'info', rank: s.state === 'late' ? 50 : 32, page: 'transport', to: 'transport',
        title: `${s.vehicle.name} ${s.state === 'late' ? 'is overdue for servicing' : 'needs servicing soon'}`, body: [s.dueDate && `By ${fdate(s.dueDate)}`, s.dueKm != null && `at ${fmt(s.dueKm)} km`].filter(Boolean).join(', ') + '.' })
    }

    // sales follow-ups
    for (const q of db.quotes || []) {
      if (q.status === 'sent' && q.sentOn && daysBetween(q.sentOn, today) >= 3) {
        const dealer = db.dealers.find((d) => d.id === q.dealerId)
        add({ id: `quote:${q.id}`, kind: 'sales', tone: 'info', rank: 28, page: 'sell', to: 'sell',
          title: `Estimate ${q.id} has no answer`, body: `${dealer?.name || 'Dealer'} got it ${daysBetween(q.sentOn, today)} days ago${q.validUntil ? `; valid until ${fdate(q.validUntil)}` : ''}.` })
      }
      if (q.status === 'approved' && !q.invoiceId) {
        add({ id: `quote-ok:${q.id}`, kind: 'sales', tone: 'good', rank: 42, page: 'sell', to: 'sell',
          title: `Estimate ${q.id} approved: make the bill`, body: 'The dealer agreed. Turn it into an invoice.' })
      }
    }

    // accounts
    const last = addMonths(thisMonth(), -1)
    const dep = depreciationDue(db, last)
    if (dep.length) {
      add({ id: `dep:${last}`, kind: 'accounts', tone: 'info', rank: 36, page: 'fixed-assets', to: 'fixed-assets',
        title: `Book ${fmonth(last)} depreciation`, body: `${dep.length} asset${dep.length === 1 ? '' : 's'}, ${tk(sum(dep, (x) => x.amount))}. Profit and loss is not complete without it.` })
    }
    const owed = investorRows(db).filter((r) => r.available > 0.5)
    if (owed.length) {
      add({ id: `investors:${(db.distributions || []).length}:${owed.length}`, kind: 'accounts', tone: 'info', rank: 26, page: 'investors', to: 'investors',
        title: `${tk(sum(owed, (r) => r.available))} profit waiting for investors`, body: owed.map((r) => r.investor.name).join(', ') + '.' })
    }

    // messages that did not go
    const failed = (db.messages || []).filter((m) => m.status === 'failed' && daysBetween(m.date, today) <= 2)
    if (failed.length) {
      add({ id: `msgfail:${failed[0].id}:${failed.length}`, kind: 'messages', tone: 'warn', rank: 34, page: 'messages', to: 'messages/log',
        title: `${failed.length} message${failed.length === 1 ? '' : 's'} failed to send`, body: failed[0].error || 'Check the number or the SMS/WhatsApp settings.' })
    }

    // import and export: LC expiry, last shipment dates, late vessels, usance payments, export proceeds
    for (const x of tradeAlerts(db, today)) {
      add({ id: 'trade:' + x.id, kind: 'trade', tone: x.tone, rank: x.tone === 'warn' ? 75 : 45, page: 'trade', to: 'trade/' + x.shipmentId, title: `${x.shipmentId}: ${x.text}`, body: 'Open the shipment to act on it.' })
    }
    // written reports: new ones for the office and the line manager, answers for the writer
    for (const r of db.workReports || []) {
      const who = db.employees.find((e) => e.id === r.employeeId)?.name || 'Someone'
      if (r.status === 'submitted') {
        const body = `${r.title}${r.attachments.length ? ` · ${r.attachments.length} file${r.attachments.length === 1 ? '' : 's'}` : ''}`
        add({ id: `report:new:${r.id}:${r.version}`, kind: 'people', tone: r.kind === 'incident' ? 'warn' : 'info', rank: r.kind === 'incident' ? 70 : 50, page: 'staff-reports', to: 'staff-reports', date: r.submittedAt.slice(0, 10), title: `${who} sent a ${r.kind === 'other' ? 'report' : r.kind + ' report'}`, body })
        const mgr = db.employees.find((e) => e.id === r.employeeId)?.managerId
        if (mgr) add({ id: `report:team:${r.id}:${r.version}`, kind: 'people', tone: 'info', rank: 52, page: 'my-work', to: 'my-work', date: r.submittedAt.slice(0, 10), forEmployee: mgr, title: `${who} sent you a report`, body })
      }
      const last = r.replies[r.replies.length - 1]
      if (last && last.byEmployee !== r.employeeId && daysBetween(last.at.slice(0, 10), today) <= 14) {
        const verb = last.status === 'approved' ? 'was approved' : last.status === 'changes' ? 'needs changes' : last.status === 'reviewed' ? 'was seen by your manager' : `has a reply from ${last.by}`
        add({ id: `report:answer:${r.id}:${last.id}`, kind: 'people', tone: last.status === 'changes' ? 'warn' : last.status === 'approved' ? 'good' : 'info', rank: 56, page: 'my-work', to: 'my-work', date: last.at.slice(0, 10), forEmployee: r.employeeId, title: `Your report ${verb}`, body: `${r.title}${last.text ? ` · “${last.text.slice(0, 80)}”` : ''}` })
      }
    }
    // leave: requests waiting for the admin, and answers for the person who asked
    const name = (id: string) => db.employees.find((e) => e.id === id)?.name || 'Someone'
    const span = (r: { from: string; to: string; half?: boolean }) => (r.half ? `half day on ${fdate(r.from)}` : r.from === r.to ? fdate(r.from) : `${fdate(r.from)} to ${fdate(r.to)}`)
    for (const r of db.leaveRequests || []) {
      if (r.status === 'pending') {
        add({ id: 'leave:ask:' + r.id, kind: 'people', tone: r.from <= addDays(today, 2) ? 'warn' : 'info', rank: 60, page: 'employees', to: 'employees/leave', date: r.askedAt.slice(0, 10),
          title: `${name(r.employeeId)} asks for leave`, body: `${span(r)} · ${r.reason}` })
      } else if ((r.status === 'approved' || r.status === 'declined') && r.decidedAt && daysBetween(r.decidedAt.slice(0, 10), today) <= 14) {
        add({ id: `leave:${r.status}:${r.id}`, kind: 'people', tone: r.status === 'approved' ? 'good' : 'warn', rank: 55, page: 'my-work', to: 'my-work', date: r.decidedAt.slice(0, 10), forEmployee: r.employeeId,
          title: r.status === 'approved' ? 'Your leave is approved' : 'Your leave was declined', body: `${span(r)}${r.answer ? ` · ${r.answer}` : ''}` })
      }
    }
    // transfers: the person hears of their move; the office is reminded as the day comes
    for (const t of db.staffTransfers || []) {
      if (t.cancelled) continue
      const to = (db.workplaces || []).find((w) => w.id === t.to)?.name || 'a new place'
      if (t.date >= today || daysBetween(t.at.slice(0, 10), today) <= 7) {
        add({ id: 'transfer:me:' + t.id, kind: 'people', tone: 'info', rank: 58, page: 'my-work', to: 'my-work', date: t.at.slice(0, 10), forEmployee: t.employeeId,
          title: t.date > today ? `You are transferred to ${to}` : `You now work at ${to}`, body: `From ${fdate(t.date)}${t.orderNo ? ` · order ${t.orderNo}` : ''} · ${t.reason}` })
      }
      if (t.date >= today && daysBetween(today, t.date) <= 3) {
        add({ id: 'transfer:due:' + t.id, kind: 'people', tone: 'info', rank: 40, page: 'employees', to: 'employees/places', date: today,
          title: `${name(t.employeeId)} moves to ${to}`, body: t.date === today ? 'Starts there today' : `Starts there on ${fdate(t.date)}` })
      }
    }
    return out.sort((a, b) => b.rank - a.rank)
  })
