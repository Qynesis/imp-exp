import { useMemo, useState } from 'react'
import { byId, dealerLedger, fdate, fmt, invoiceDue, invTotal, newestFirst, num, tk, todayISO, type Db, type DealerTerms, type Invoice, type InvoiceData } from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { PageHead } from '@/components/PageHead'
import { useBooks } from '@/core/store/context'
import { Button, Card, DataTable, Icon, Segmented, useConfirm, usePrint, useSheets, useToast } from '@/ui'
import { InvoiceDoc } from './InvoiceDoc'
import { InvoiceStatus } from './InvoiceStatus'
import { InvoiceLineSheet } from './sheets/InvoiceLineSheet'
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
}

const blank = (db: Db, dealerId?: string): Draft => {
  const d = byId(db.dealers, dealerId) || db.dealers[0]
  return { draftId: '', dealerId: d?.id || '', soldBy: d?.salesId || '', date: todayISO(), terms: d?.terms === 'cod' ? 'cod' : 'credit', lines: [], discount: '', received: '', method: 'Cash' }
}
const fromInvoice = (inv: Invoice): Draft => ({
  draftId: inv.id, dealerId: inv.dealerId, soldBy: inv.soldBy, date: inv.date, terms: inv.terms, method: inv.method || 'Cash',
  lines: inv.lines.map((l) => ({ productId: l.productId, qty: String(l.qty), price: String(l.price) })),
  discount: String(inv.discount || ''), received: String(inv.received || ''),
})

/** #/sell, and #/sell/new/<dealer id> to start an invoice for one dealer. */
export default function SellPage({ params }: FeatureRouteProps) {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const print = usePrint()
  const [f, setF] = useState<Draft>(() => blank(db, params[0] === 'new' ? params[1] : undefined))
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
  }
  const subtotal = data.lines.reduce((s, l) => s + l.qty * l.price, 0)
  const total = subtotal - data.discount
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
      if (final && l.qty > p.stock) return `Only ${fmt(p.stock)} ${p.unit} of ${p.name} in the warehouse.`
    }
    if (data.discount < 0 || total <= 0) return 'The discount cannot be more than the subtotal.'
    if (data.received < 0 || data.received > total) return 'Received now cannot be more than the invoice total.'
    if (final && f.terms === 'credit' && dealer.terms === 'cod' && due > 0) return `${dealer.name} is cash on delivery only. Take the full amount or change the dealer’s terms.`
    return ''
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
    act('saveInvoice', { id: f.draftId, data, final: true })
    toast(`Invoice ${nextId} saved`)
    print(<InvoiceDoc db={db} inv={preview} />)
    setF(blank(db, f.dealerId))
  }

  const recent = useMemo(
    () => [...db.invoices].sort((a, b) => (a.status !== b.status ? (a.status === 'draft' ? -1 : 1) : newestFirst(a, b))).slice(0, 8),
    [db],
  )
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
          <Button variant="secondary" onClick={saveDraft}>Save draft</Button>
          <Button onClick={() => void finalize()}>Save and print invoice</Button>
        </>
      } />
      <div className="grid-sell edit-only">
        <Card>
          <div className="card-body stack-sm">
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
                const short = num(l.qty) > (p?.stock || 0)
                return (
                  <div className="line" key={l.productId}>
                    <div className="line-name">
                      <b>{p?.name}</b>
                      <small className={short ? 't-warn' : 't-muted'}>{fmt(p?.stock)} {p?.unit} in warehouse</small>
                    </div>
                    <label><span>Qty</span><input className="in" inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} aria-label={`Quantity of ${p?.name}`} /></label>
                    <label><span>Price</span><input className="in" inputMode="decimal" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} aria-label={`Price of ${p?.name}`} /></label>
                    <b className="line-amt">{tk(num(l.qty) * num(l.price))}</b>
                    <button type="button" className="icon-btn" aria-label={`Remove ${p?.name}`} onClick={() => set({ lines: f.lines.filter((_, j) => j !== i) })}><Icon name="trash" size={18} /></button>
                  </div>
                )
              })}
              <div className="lines-foot">
                <Button icon="plus" variant="dashed" size="sm" onClick={() => sheets.open(InvoiceLineSheet, {
                  taken: f.lines.map((l) => l.productId),
                  onAdd: (line) => setF((s) => ({ ...s, lines: [...s.lines, { productId: line.productId, qty: String(line.qty), price: String(line.price) }] })),
                })}>Add product</Button>
              </div>
            </div>

            <div className="totals">
              <div className="kv"><span>Subtotal</span><span>{tk(subtotal)}</span></div>
              <label className="kv"><span>Discount (Tk)</span><input className="in sm" inputMode="decimal" value={f.discount} onChange={(e) => set({ discount: e.target.value })} placeholder="0" /></label>
              <div className="kv total"><span>Invoice total</span><span>{tk(total)}</span></div>
              {f.terms === 'credit' ? (
                <label className="kv"><span>Received now (Tk)</span><input className="in sm" inputMode="decimal" value={f.received} onChange={(e) => set({ received: e.target.value })} placeholder="0" /></label>
              ) : (
                <div className="kv"><span>Received on delivery</span><span>{tk(total)}</span></div>
              )}
              <div className={`kv strong ${due > 0 ? 't-warn' : ''}`}><span>Due on this invoice</span><span>{tk(due)}</span></div>
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

      <Card title="Recent invoices">
        <DataTable
            pageSize={25}
          rows={recent}
          onRow={openInvoice}
          empty="No invoices yet."
          columns={[
            { label: 'Invoice', primary: true, render: (r) => (r.status === 'draft' ? 'Draft' : r.id) },
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
