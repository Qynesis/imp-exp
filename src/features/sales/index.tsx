import { useMemo, useState } from 'react'
import { addDays, availableQty, invTaxLines, moneySymbol, taxSettings, byId, dealerLedger, fdate, fmt, invoiceDue, invTotal, newestFirst, num, reservedQty, tk, todayISO, type Db, type DealerTerms, type Invoice, type InvoiceData, type SalesQuote } from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { PageHead } from '@/components/PageHead'
import { ScanBox } from '@/components/barcode/ScanBox'
import { useBooks } from '@/core/store/context'
import { Button, Card, cls, DataTable, Field, Icon, Pill, Segmented, useConfirm, usePrint, useSheets, useToast, SearchBox } from '@/ui'
import { parcelDefaults, useCourier } from '@/features/courier/useCourier'
import { InvoiceDoc } from './InvoiceDoc'
import { InvoiceStatus } from './InvoiceStatus'
import { InvoiceLineSheet } from './sheets/InvoiceLineSheet'
import { useMessaging, vars } from '@/features/messages/useMessaging'
import { QUOTE_TEXT, QUOTE_TONE } from './quoteStatus'
import { QuoteSheet } from './sheets/QuoteSheet'
import { ViewInvoiceSheet } from './sheets/ViewInvoiceSheet'

interface LineDraft {
  productId: string
  qty: string
  price: string
}
interface Draft {
  draftId: string
  dealerId: string
  soldBy: string
  date: string
  terms: DealerTerms
  lines: LineDraft[]
  discount: string
  received: string
  method: string
  /** Billing or editing this dealer estimate. */
  quoteId?: string
  validUntil?: string
  note?: string
  /** Tax rates ticked for this bill, and whether the prices already include them. */
  taxIds: string[]
  taxInclusive: boolean
}

/** The company's default sales taxes for a new bill. */
const defaultTaxes = (db: Db) => {
  const t = db.company.tax
  const live = new Set((db.taxRates || []).filter((r) => r.active && r.appliesTo !== 'purchases').map((r) => r.id))
  return { taxIds: (t?.salesDefault || []).filter((id) => live.has(id)), taxInclusive: !!t?.pricesIncludeTax }
}

const blank = (db: Db, dealerId?: string): Draft => {
  const d = byId(db.dealers, dealerId) || db.dealers[0]
  return { ...defaultTaxes(db), draftId: '', dealerId: d?.id || '', soldBy: d?.salesId || '', date: todayISO(), terms: d?.terms === 'cod' ? 'cod' : 'credit', lines: [], discount: '', received: '', method: 'Cash' }
}
const fromInvoice = (inv: Invoice): Draft => ({
  taxIds: (inv.taxes || []).map((t) => t.rateId || '').filter(Boolean), taxInclusive: !!inv.taxes?.some((t) => t.inclusive),
  draftId: inv.id, dealerId: inv.dealerId, soldBy: inv.soldBy, date: inv.date, terms: inv.terms, method: inv.method || 'Cash',
  lines: inv.lines.map((l) => ({ productId: l.productId, qty: String(l.qty), price: String(l.price) })),
  discount: String(inv.discount || ''), received: String(inv.received || ''),
})

const fromQuote = (db: Db, q: SalesQuote): Draft => ({
  ...defaultTaxes(db),
  draftId: '', dealerId: q.dealerId, soldBy: q.soldBy, date: todayISO(), terms: q.terms, method: 'Cash', quoteId: q.id, validUntil: q.validUntil, note: q.note,
  lines: q.lines.map((l) => ({ productId: l.productId, qty: String(l.qty), price: String(l.price) })), discount: String(q.discount || ''), received: '',
})

/** #/sell, #/sell/new/<dealer id> to start an invoice for one dealer, #/sell/quote/<estimate id> to bill an estimate. */
export default function SellPage({ params }: FeatureRouteProps) {
  const { db, act } = useBooks()
  const courier = useCourier()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const print = usePrint()
  const msg = useMessaging()
  const [f, setF] = useState<Draft>(() => {
    const q = params[0] === 'quote' ? byId(db.quotes || [], params[1]) : undefined
    return q && q.status !== 'invoiced' ? fromQuote(db, q) : blank(db, params[0] === 'new' ? params[1] : undefined)
  })
  const [deliverNow, setDeliverNow] = useState(false)
  const [err, setErr] = useState('')
  const set = (patch: Partial<Draft>) => {
    setF((s) => ({ ...s, ...patch }))
    setErr('')
  }

  const dealer = byId(db.dealers, f.dealerId)
  const led = dealer ? dealerLedger(db, dealer.id) : null
  const data: InvoiceData = {
    dealerId: f.dealerId, soldBy: f.soldBy, date: f.date, terms: f.terms, method: f.method,
    discount: num(f.discount),
    received: 0,
    lines: f.lines.map((l) => ({ productId: l.productId, qty: num(l.qty), price: num(l.price) })),
    taxes: f.taxIds.map((id) => byId(db.taxRates || [], id)).filter((r) => !!r).map((r) => ({ rateId: r.id, name: r.name, kind: r.kind, rate: r.rate, inclusive: f.taxInclusive })),
  }
  if (!data.taxes?.length) delete data.taxes
  const subtotal = data.lines.reduce((s, l) => s + l.qty * l.price, 0)
  const taxLines = invTaxLines(data)
  const total = invTotal(data)
  const salesRates = (db.taxRates || []).filter((r) => r.active && r.appliesTo !== 'purchases')
  data.received = f.terms === 'cod' ? total : num(f.received)
  const due = total - data.received
  const after = (led?.due || 0) + due
  const overLimit = f.terms === 'credit' && !!dealer && after > dealer.limit
  const nextId = (db.company.invoicePrefix || '') + db.seq.inv
  const preview = { ...data, id: nextId, status: 'final' as const }

  const pickDealer = (id: string) => {
    const d = byId(db.dealers, id)
    set({ dealerId: id, soldBy: d?.salesId || '', terms: d?.terms === 'cod' ? 'cod' : f.terms })
  }
  const setLine = (i: number, patch: Partial<LineDraft>) => set({ lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })

  const check = (final: boolean): string => {
    if (!dealer) return 'Choose a dealer first. You can add one under Dealers.'
    if (!data.lines.length) return 'Add at least one product.'
    for (const l of data.lines) {
      const p = byId(db.products, l.productId)
      if (!p) return 'One of the products no longer exists. Remove it from the invoice.'
      if (l.qty <= 0 || l.price <= 0) return `Enter a quantity and price for ${p.name}.`
      // stock already billed to others is spoken for until it is delivered
      if (final && l.qty > availableQty(db, p)) return `Only ${fmt(Math.max(availableQty(db, p), 0))} ${p.unit} of ${p.name} is free to sell (${fmt(p.stock)} in the warehouse, ${fmt(reservedQty(db, p.id))} waiting for delivery).`
    }
    if (data.discount < 0 || subtotal - data.discount <= 0) return 'The discount cannot be more than the subtotal.'
    if (data.received < 0 || data.received > total) return 'Received now cannot be more than the invoice total.'
    if (final && f.terms === 'credit' && dealer.terms === 'cod' && due > 0) return `${dealer.name} is cash on delivery only. Take the full amount or change the dealer’s terms.`
    return ''
  }

  /** Keep this as an estimate for the dealer to approve; nothing is billed or taken from stock. */
  const saveEstimate = () => {
    const problem = check(false)
    if (problem) return setErr(problem)
    const lines = data.lines.map((l) => ({ ...l, name: byId(db.products, l.productId)?.name, unit: byId(db.products, l.productId)?.unit }))
    const id = f.quoteId || 'QT-' + (db.seq.qt ?? 101)
    act('saveQuote', { id: f.quoteId, date: f.date, dealerId: f.dealerId, soldBy: f.soldBy, terms: f.terms, lines, discount: data.discount, validUntil: f.validUntil || addDays(f.date, 7), note: f.note || '' })
    toast(`Estimate ${id} saved. Send it from Estimates below.`)
    const q = { id, ts: 0, date: f.date, dealerId: f.dealerId, soldBy: f.soldBy, terms: f.terms, lines, discount: data.discount, validUntil: f.validUntil || addDays(f.date, 7), note: f.note || '', status: 'draft' as const }
    void msg.auto('estimate', f.dealerId, vars.quote(db, q), id)
    setF(blank(db, f.dealerId))
  }

  const saveDraft = () => {
    const problem = check(false)
    if (problem) return setErr(problem)
    act('saveInvoice', { id: f.draftId, data, final: false })
    toast('Draft saved')
    setF(blank(db, f.dealerId))
  }
  const finalize = async () => {
    const problem = check(true)
    if (problem) return setErr(problem)
    if (overLimit && dealer) {
      const ok = await confirm({
        title: 'Over the credit limit',
        message: `${dealer.name} would owe ${tk(after)} after this sale. Their limit is ${tk(dealer.limit)}.`,
        confirmLabel: 'Sell anyway', destructive: true,
      })
      if (!ok) return
    }
    act('saveInvoice', { id: f.draftId, data, final: true, deliverNow, quoteId: f.quoteId })
    toast(deliverNow ? `Invoice ${nextId} saved and delivered` : `Invoice ${nextId} saved · waiting in Delivery`)
    // the bill message, when set to go by itself; the new bill's due is not in the ledger yet
    void msg.auto('invoice', data.dealerId, vars.invoice(db, { ...preview, ts: 0 }, total - data.received), nextId)
    setDeliverNow(false)
    print(<InvoiceDoc db={db} inv={preview} />)
    setF(blank(db, f.dealerId))
    // dealers who take courier delivery get their parcel booked straight away
    const saved = { ...preview, id: nextId, status: 'final' as const, ts: 0 }
    if (db.company.courier?.autoBook && dealer?.courier && db.company.courier.provider !== 'manual') {
      const req = parcelDefaults(db, saved)
      if (!req.phone || !req.address) return toast(`Courier not booked: ${dealer.name} has no phone or address`)
      courier.book(req, { invoice: saved }).then(
        (id) => toast(`Courier booked for ${nextId} · ${id}`),
        (e: unknown) => toast(`Courier not booked: ${e instanceof Error ? e.message : 'try again from the invoice'}`),
      )
    }
  }

  const [invQ, setInvQ] = useState('')
  // the latest few, or every bill that matches the search
  const recent = useMemo(() => {
    const n = invQ.trim().toLowerCase()
    const all = [...db.invoices].sort((a, b) => (a.status !== b.status ? (a.status === 'draft' ? -1 : 1) : newestFirst(a, b)))
    if (!n) return all.slice(0, 8)
    return all.filter((i) => `${i.id} ${byId(db.dealers, i.dealerId)?.name || ''} ${i.status} ${i.date}`.toLowerCase().includes(n))
  }, [db, invQ])
  const openInvoice = (inv: Invoice) => {
    if (inv.status !== 'draft') return sheets.open(ViewInvoiceSheet, { invoiceId: inv.id })
    setF(fromInvoice(inv))
    setErr('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <PageHead title="Sell to dealer" sub="Pick the dealer and goods, choose cash on delivery or credit, and the invoice is made for you." actions={
        <>
          <Button variant="secondary" icon="receipt" onClick={saveEstimate}>{f.quoteId ? 'Update estimate' : 'Save as estimate'}</Button>
          <Button variant="secondary" onClick={saveDraft}>Save draft</Button>
          <Button onClick={() => void finalize()}>{f.quoteId ? 'Bill this estimate' : 'Save and print invoice'}</Button>
        </>
      } />
      <div className="grid-sell edit-only">
        <Card>
          <div className="card-body stack-sm">
            {f.quoteId && <div className="note">Working on estimate <b>{f.quoteId}</b>. Update it and send it again, or bill it once the dealer approves. <button type="button" className="link" onClick={() => setF(blank(db, f.dealerId))}>Start fresh</button></div>}
            {f.draftId && <div className="note">Continuing a saved draft. <button type="button" className="link" onClick={() => setF(blank(db, f.dealerId))}>Start a new invoice instead</button></div>}
            {err && <div className="err" role="alert">{err}</div>}
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Dealer</span>
                <select className="in" value={f.dealerId} onChange={(e) => pickDealer(e.target.value)}>
                  {!db.dealers.length && <option value="">No dealers yet</option>}
                  {db.dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Sold by</span>
                <select className="in" value={f.soldBy} onChange={(e) => set({ soldBy: e.target.value })}>
                  <option value="">Office sale</option>
                  {db.employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.payType === 'sales' ? ' (sales basis)' : ''}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Invoice date</span>
                <input className="in" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
              </label>
              <div className="field">
                <span className="field-label">Payment type</span>
                <Segmented<DealerTerms> label="Payment type" value={f.terms} onChange={(terms) => set({ terms })} options={[
                  { value: 'cod', label: 'Cash on delivery' },
                  { value: 'credit', label: 'Credit', disabled: dealer?.terms === 'cod' },
                ]} />
              </div>
            </div>
            <p className="t-muted small tight">
              {f.terms === 'cod' ? 'The full amount is taken on delivery and goes into today’s cashbook.' : 'Any unpaid amount is added to the dealer due and shows up in Cashbook and dues.'}
            </p>

            <div className="lines">
              <div className="lines-head"><span>Product</span><span>Quantity</span><span>Dealer price</span><span>Amount</span><span /></div>
              {f.lines.map((l, i) => {
                const p = byId(db.products, l.productId)
                const short = !!p && num(l.qty) > availableQty(db, p)
                return (
                  <div className="line" key={l.productId}>
                    <div className="line-name">
                      <b>{p?.name}</b>
                      <small className={short ? 't-warn' : 't-muted'}>{fmt(p ? availableQty(db, p) : 0)} {p?.unit} free to sell{p && reservedQty(db, p.id) ? ` · ${fmt(reservedQty(db, p.id))} held for delivery` : ''}</small>
                    </div>
                    <label><span>Qty</span><input className="in" inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} aria-label={`Quantity of ${p?.name}`} /></label>
                    <label><span>Price</span><input className="in" inputMode="decimal" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} aria-label={`Price of ${p?.name}`} /></label>
                    <b className="line-amt">{tk(num(l.qty) * num(l.price))}</b>
                    <button type="button" className="icon-btn" aria-label={`Remove ${p?.name}`} onClick={() => set({ lines: f.lines.filter((_, j) => j !== i) })}><Icon name="trash" size={18} /></button>
                  </div>
                )
              })}
              <div className="lines-foot">
                <ScanBox hint="Scan to add a product" onScan={(hit) => {
                  const at = f.lines.findIndex((l) => l.productId === hit.product.id)
                  if (hit.product.kind !== 'finished') return `${hit.product.name} is not for sale`
                  if (at >= 0) setLine(at, { qty: String(num(f.lines[at].qty) + hit.qty) })
                  else setF((s) => ({ ...s, lines: [...s.lines, { productId: hit.product.id, qty: String(hit.qty), price: String(hit.product.price || '') }] }))
                }} />
                <Button icon="plus" variant="dashed" size="sm" onClick={() => sheets.open(InvoiceLineSheet, {
                  taken: f.lines.map((l) => l.productId),
                  onAdd: (line) => setF((s) => ({ ...s, lines: [...s.lines, { productId: line.productId, qty: String(line.qty), price: String(line.price) }] })),
                })}>Add product</Button>
              </div>
            </div>

            <div className="totals">
              <div className="kv"><span>Subtotal</span><span>{tk(subtotal)}</span></div>
              <label className="kv"><span>Discount ({moneySymbol()})</span><input className="in sm" inputMode="decimal" value={f.discount} onChange={(e) => set({ discount: e.target.value })} placeholder="0" /></label>
              {salesRates.length > 0 && (
                <div className="kv tax-pick">
                  <span>{taxSettings(db).taxName}</span>
                  <span className="chips">
                    {salesRates.map((r) => (
                      <button key={r.id} type="button" className={cls('chip sm', f.taxIds.includes(r.id) && 'on')} aria-pressed={f.taxIds.includes(r.id)}
                        onClick={() => set({ taxIds: f.taxIds.includes(r.id) ? f.taxIds.filter((x) => x !== r.id) : [...f.taxIds, r.id] })}>{r.name}</button>
                    ))}
                  </span>
                </div>
              )}
              {taxLines.length > 0 && (
                <label className="kv check-row"><span>Prices already include {taxSettings(db).taxName}</span><input type="checkbox" checked={f.taxInclusive} onChange={(e) => set({ taxInclusive: e.target.checked })} /></label>
              )}
              {taxLines.map((t) => (
                <div className="kv" key={t.name}><span>{t.name}{t.inclusive ? ' (included in price)' : ''}</span><span>{tk(t.amount)}</span></div>
              ))}
              <div className="kv total"><span>Invoice total</span><span>{tk(total)}</span></div>
              {f.terms === 'credit' ? (
                <label className="kv"><span>Received now ({moneySymbol()})</span><input className="in sm" inputMode="decimal" value={f.received} onChange={(e) => set({ received: e.target.value })} placeholder="0" /></label>
              ) : (
                <div className="kv"><span>Received on delivery</span><span>{tk(total)}</span></div>
              )}
              <div className={`kv strong ${due > 0 ? 't-warn' : ''}`}><span>Due on this invoice</span><span>{tk(due)}</span></div>
            </div>

            <label className="check"><input type="checkbox" checked={deliverNow} onChange={(e) => setDeliverNow(e.target.checked)} /> Goods handed over now (counter sale). Otherwise the bill waits in Delivery and stock moves when the goods go.</label>
            <div className="form-grid">
              <Field label="Estimate valid until" hint="Used when saved as an estimate"><input className="in" type="date" value={f.validUntil || ''} onChange={(e) => set({ validUntil: e.target.value })} /></Field>
              <Field label="Note on the estimate"><input className="in" value={f.note || ''} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. price includes delivery to Agrabad" /></Field>
            </div>
            {dealer && led && dealer.terms === 'credit' && (
              <div className={`credit-box ${overLimit ? 'over' : ''}`}>
                <span>Credit limit <b>{tk(dealer.limit)}</b></span>
                <span>Previous due <b>{tk(led.due)}</b></span>
                <span>Total due after this sale <b>{tk(after)}</b></span>
                {overLimit && <span className="t-warn strong">Over the limit by {tk(after - dealer.limit)}</span>}
              </div>
            )}
          </div>
        </Card>

        <div className="stack">
          <div className="invoice-wrap paper"><InvoiceDoc db={db} inv={preview} /></div>
        </div>
      </div>

      <Card icon="receipt" title="Estimates for dealers" sub="Prices sent for approval. Once a dealer agrees, open the estimate and make the bill.">
        <DataTable pageSize={10} rows={db.quotes || []} rowKey={(q) => q.id} onRow={(q) => sheets.open(QuoteSheet, { quoteId: q.id })}
          empty="No estimates yet. Fill the form above and press Save as estimate."
          columns={[
            { label: 'Estimate', primary: true, render: (q) => <span className="two-line"><b>{q.id}</b><small>{fdate(q.date)}{q.validUntil ? ` · valid until ${fdate(q.validUntil)}` : ''}</small></span> },
            { label: 'Dealer', render: (q) => byId(db.dealers, q.dealerId)?.name },
            { label: 'Goods', render: (q) => <span className="t-muted">{q.lines.map((l) => `${fmt(l.qty)} ${l.unit || ''}`).join(', ')}</span> },
            { label: 'Total', align: 'right', render: (q) => tk(q.lines.reduce((s, l) => s + l.qty * l.price, 0) - q.discount) },
            { label: 'Status', render: (q) => <span className="two-line"><Pill tone={QUOTE_TONE[q.status]}>{QUOTE_TEXT[q.status]}</Pill>{q.invoiceId && <small className="t-muted">{q.invoiceId}</small>}</span> },
          ]} />
      </Card>

      <Card title={invQ.trim() ? `Invoices matching “${invQ.trim()}” (${recent.length})` : 'Recent invoices'} action={<SearchBox value={invQ} onChange={setInvQ} placeholder="Bill no. or dealer" label="Search invoices" />}>
        <DataTable
            pageSize={25}
          rows={recent}
          onRow={openInvoice}
          empty="No invoices yet."
          columns={[
            { label: 'Invoice', primary: true, render: (r) => (r.status === 'draft' ? 'Draft' : <>{r.id}{r.sample && <span className="test-tag">sample</span>}</>) },
            { label: 'Dealer', render: (r) => byId(db.dealers, r.dealerId)?.name },
            { label: 'Date', render: (r) => fdate(r.date) },
            { label: 'Sold by', render: (r) => byId(db.employees, r.soldBy)?.name || 'Office sale' },
            { label: 'Total', align: 'right', render: (r) => tk(invTotal(r)) },
            { label: 'Status', render: (r) => <InvoiceStatus inv={r} due={invoiceDue(db, r)} /> },
          ]}
        />
      </Card>
    </>
  )
}
