import { byId, fdate, fmt, foCalc, tk, type Db, type FactoryEstimate, type FactoryOrder } from '@shared/domain'

/** The estimate as a WhatsApp message. */
export function estimateText(db: Db, e: FactoryEstimate): string {
  const p = byId(db.products, e.productId)
  const lines = [
    `*${db.company.name || 'Order estimate'}*`,
    `Estimate ${e.id} · ${fdate(e.date)}`,
    '',
    `${p?.name}: ${fmt(e.qty)} ${p?.unit} × ${tk(e.rate)} = *${tk(e.qty * e.rate)}*`,
    e.type === 1 ? 'We supply the raw materials; rate is the making charge.' : 'Factory supplies all materials.',
    e.wanted ? `Wanted by ${fdate(e.wanted)}` : '',
    e.validUntil ? `Price valid until ${fdate(e.validUntil)}` : '',
    ...e.materials.map((m) => `• ${byId(db.products, m.productId)?.name}: ${fmt(m.given)} ${byId(db.products, m.productId)?.unit}`),
    e.note,
    '',
    'Please confirm quantity, rate and delivery date.',
  ]
  return lines.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n')
}

/** One lot's payments, bills and deliveries as a WhatsApp message. */
export function orderStatementText(db: Db, o: FactoryOrder): string {
  const c = foCalc(db, o)
  const pays = o.payments.map((p) => `• ${fdate(p.date)}  ${tk(p.amount)}  ${p.method}${p.note ? ` · ${p.note}` : ''}`)
  const bills = o.bills.map((b) => `• ${fdate(b.date)}  Bill ${b.billNo}  ${tk(b.amount)}`)
  return [
    `*${db.company.name || 'Payment history'}*`,
    `Order ${o.id} · ${c.factory?.name}`,
    `${c.product?.name}: ${fmt(o.qty)} ${c.unit} at ${tk(o.rate)}`,
    `Received ${fmt(c.received)} of ${fmt(o.qty)} ${c.unit}`,
    '',
    '*Payments*', ...(pays.length ? pays : ['None yet']),
    '', '*Bills*', ...(bills.length ? bills : ['None yet']),
    '',
    `Paid ${tk(c.paid)} · Billed ${tk(c.billed)}`,
    `*${c.balance > 0 ? `Factory owes us ${tk(c.balance)}` : c.balance < 0 ? `We owe ${tk(-c.balance)}` : 'Settled'}*`,
  ].join('\n')
}
