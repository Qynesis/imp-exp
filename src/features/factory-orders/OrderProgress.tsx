import { useSee } from '@/app/useSee'
import { byId, fdate, fmt, foCalc, tk, type Db, type FactoryOrder } from '@shared/domain'
import { Button, cls, Icon, useSheets, type IconName } from '@/ui'
import { PaySheet } from '@/features/payments/PaySheet'
import { FactoryBillSheet } from './sheets/FactoryBillSheet'
import { ReceiveShipmentSheet } from './sheets/ReceiveShipmentSheet'

interface Step {
  key: string
  label: string
  detail: string
  state: 'done' | 'now' | 'todo'
}

/** Where the lot stands, step by step, and the one thing to do next. */
export function OrderProgress({ db, o }: { db: Db; o: FactoryOrder }) {
  // money shows only for roles allowed to see buying prices
  const see = useSee()
  const m = (n: number) => (see.cost ? tk(n) : '•••')
  const sheets = useSheets()
  const c = foCalc(db, o)
  const est = byId(db.estimates || [], o.estimateId)
  const value = o.qty * o.rate
  const receivedValue = c.received * o.rate
  const allIn = c.pending <= 0
  const billedAll = c.billed >= value - 0.5
  const settled = billedAll && Math.abs(c.balance) < 0.5

  const steps: Step[] = [
    ...(est ? [{ key: 'est', label: 'Estimate approved', detail: `${est.id}${est.answeredOn ? ` · ${fdate(est.answeredOn)}` : ''}`, state: 'done' as const }] : []),
    { key: 'placed', label: 'Order placed', detail: `${fmt(c.firstQty)} ${c.unit} · ${fdate(o.placed)}`, state: 'done' },
    { key: 'arriving', label: 'Goods arriving', detail: c.received ? `${fmt(c.received)} of ${fmt(o.qty)} in ${o.receipts.length} shipment${o.receipts.length === 1 ? '' : 's'}` : 'Nothing yet', state: allIn ? 'done' : 'now' },
    { key: 'billed', label: 'Factory billed', detail: c.billed ? `${m(c.billed)} of ${m(value)}` : 'No bill yet', state: billedAll ? 'done' : allIn || c.billed ? 'now' : 'todo' },
    { key: 'paid', label: 'Paid and settled', detail: c.paid ? `${m(c.paid)} paid` : 'Nothing paid yet', state: settled ? 'done' : billedAll ? 'now' : 'todo' },
  ]

  // the most useful next action for where the order is
  let next: { text: string; button: string; icon: IconName; run: () => void } | null = null
  if (!allIn) next = { text: `Waiting for ${fmt(c.pending)} ${c.unit}${o.expected ? `, promised by ${fdate(o.expected)}` : ''}.`, button: 'Receive shipment', icon: 'arrowIn', run: () => sheets.open(ReceiveShipmentSheet, { orderId: o.id }) }
  else if (!billedAll) next = { text: `Everything has arrived. The factory still has ${m(value - c.billed)} to bill.`, button: 'Record factory bill', icon: 'receipt', run: () => sheets.open(FactoryBillSheet, { orderId: o.id }) }
  else if (c.balance < 0) next = { text: `Billed in full. We still owe ${m(-c.balance)}.`, button: 'Pay factory', icon: 'wallet', run: () => sheets.open(PaySheet, { kind: 'factory', orderId: o.id, crumb: 'Factory order' }) }
  else if (c.balance > 0) next = { text: `The factory holds ${m(c.balance)} of ours. Adjust it on the next order or ask for it back.`, button: 'Record factory bill', icon: 'receipt', run: () => sheets.open(FactoryBillSheet, { orderId: o.id }) }

  return (
    <section className="card order-progress">
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s.key} className={cls('step', s.state)}>
            <span className="step-dot">{s.state === 'done' ? <Icon name="check" size={14} /> : i + 1}</span>
            <span className="step-text"><b>{s.label}</b><small>{s.detail}</small></span>
          </li>
        ))}
      </ol>
      <div className="money-row">
        <div><span>Order value</span><b>{m(value)}</b></div>
        <div><span>Received worth</span><b>{m(receivedValue)}</b></div>
        <div><span>Billed</span><b>{m(c.billed)}</b></div>
        <div><span>Paid</span><b>{m(c.paid)}</b></div>
        <div><span>{c.balance > 0 ? 'Factory owes us' : c.balance < 0 ? 'We owe' : 'Balance'}</span><b className={c.balance > 0 ? 't-good' : c.balance < 0 ? 't-warn' : ''}>{m(Math.abs(c.balance))}</b></div>
      </div>
      {next ? (
        <div className="next-step">
          <span><Icon name="arrowRight" size={16} /> {next.text}</span>
          <Button size="sm" icon={next.icon} className="edit-only" onClick={next.run}>{next.button}</Button>
        </div>
      ) : (
        <div className="next-step done"><span><Icon name="check" size={16} /> Received, billed and paid. This lot is closed.</span></div>
      )}
    </section>
  )
}
