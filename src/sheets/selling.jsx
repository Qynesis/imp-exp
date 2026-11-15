/* eslint-disable react-refresh/only-export-components */
import InvoiceDoc from '../InvoiceDoc.jsx'
import { CustomFields, CustomView } from '../custom.jsx'
import { fdate, fmt, fshort, num, tk, todayISO } from '../lib/format.js'
import { byId, dealerLedger } from '../lib/selectors.js'
import { useStore } from '../lib/store.jsx'
import { Button, Field, FormSheet, Pill, Sheet, go, useForm, usePrint, useSheetItem, useSheets, useToast } from '../ui.jsx'
import { MethodSelect } from './buying.jsx'

/* ---------- dealer form (used on the Dealers page and in the edit sheet) ---------- */
export const dealerInit = (db, cur) => cur
  ? { ...cur, opening: String(cur.opening || ''), limit: String(cur.limit || ''), days: String(cur.days || '') }
  : { name: '', owner: '', phone: '', area: '', address: '', opening: '', terms: 'credit', limit: '', days: '30', salesId: '', custom: {} }
export const dealerPayload = (v) => {
  if (!v.name.trim()) return 'Enter the shop or business name.'
  const credit = v.terms === 'credit'
  return { ...v, name: v.name.trim(), opening: num(v.opening), limit: credit ? num(v.limit) : 0, days: credit ? num(v.days) : 0 }
}
export function DealerFields({ db, v, set, bind, nbind, idp = 'd' }) {
  return (
    <>
      <Field label="Shop or business name" wide><input {...bind('name')} placeholder="e.g. Rahman Traders" /></Field>
      <Field label="Owner name"><input {...bind('owner')} placeholder="Full name" /></Field>
      <Field label="Phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXX-XXXXXX" /></Field>
      <Field label="Area"><input {...bind('area')} placeholder="Market or thana" /></Field>
      <Field label="Opening due (Tk)"><input {...nbind('opening')} placeholder="Amount already owed, if any" /></Field>
      <Field label="Address" wide><input {...bind('address')} placeholder="Shop address" /></Field>
      <fieldset className="field wide radio-set">
        <legend className="field-label">Payment terms</legend>
        <label><input type="radio" name={idp + 'terms'} checked={v.terms === 'cod'} onChange={() => set('terms', 'cod')} /> Cash on delivery only</label>
        <label><input type="radio" name={idp + 'terms'} checked={v.terms === 'credit'} onChange={() => set('terms', 'credit')} /> Credit allowed</label>
      </fieldset>
      {v.terms === 'credit' && (
        <>
          <Field label="Credit limit (Tk)"><input {...nbind('limit')} placeholder="1,00,000" /></Field>
          <Field label="Credit days"><input {...nbind('days')} placeholder="30" /></Field>
        </>
      )}
      <Field label="Assigned sales employee" wide>
        <select {...bind('salesId')}>
          <option value="">Office sale (no one assigned)</option>
          {db.employees.filter((e) => e.payType === 'sales').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </Field>
      <CustomFields entity="dealer" v={v} set={set} />
    </>
  )
}

export function DealerSheet({ dealerId }) {
  const { db, act } = useStore()
  const toast = useToast()
  const cur = byId(db.dealers, dealerId)
  const [v, set, bind, nbind] = useForm(dealerInit(db, cur))
  return (
    <FormSheet title="Edit dealer" crumb="Dealers" submit="Save dealer" onSubmit={() => {
      const p = dealerPayload(v)
      if (typeof p === 'string') return p
      act('saveDealer', p)
      toast('Dealer updated')
    }}>
      <DealerFields db={db} v={v} set={set} bind={bind} nbind={nbind} idp="edit" />
    </FormSheet>
  )
}

export function DealerStatement({ dealerId }) {
  const { db } = useStore()
  const sheets = useSheets()
  const { close } = useSheetItem()
  const led = dealerLedger(db, dealerId)
  const d = led.dealer
  const sales = byId(db.employees, d.salesId)
  return (
    <Sheet title={d.name} crumb="Dealer statement" wide
      footer={
        <>
          <Button variant="secondary" onClick={() => sheets.open('dealer', { dealerId })}>Edit</Button>
          <Button variant="secondary" onClick={() => { close(); go('sell/new/' + dealerId) }}>New sale</Button>
          <Button disabled={led.due <= 0} onClick={() => sheets.open('collect', { dealerId })}>Collect</Button>
        </>
      }>
      <p className="t-muted tight">
        {[d.owner, d.phone, d.area].filter(Boolean).join(' · ') || 'No contact details yet'}
        <br />
        {d.terms === 'credit' ? `Credit · ${d.days} days · limit ${tk(d.limit)}` : 'Cash on delivery only'} · {sales ? `Sales: ${sales.name}` : 'Office sale'}
      </p>
      <div className="mini-stats">
        <div><span>Due now</span><b className={led.due > 0 ? 't-warn' : ''}>{tk(led.due)}</b></div>
        <div><span>Status</span><b className={led.overdue ? 't-warn' : ''}>{led.statusText}</b></div>
        {d.terms === 'credit' && <div><span>Credit left</span><b>{tk(Math.max(d.limit - led.due, 0))}</b></div>}
      </div>
      <div className="boxed-view"><CustomView entity="dealer" record={d} /></div>
      <h3 className="sheet-h">Unpaid invoices</h3>
      <div className="rows flush">
        {led.open.map((x) => (
          <button key={x.id} type="button" className="row click" disabled={x.id === 'opening'} onClick={() => sheets.open('viewInvoice', { invoiceId: x.id })}>
            <span className="name">{x.label}</span>
            <span className="meta">{x.date ? fdate(x.date) : 'Before these books'}</span>
            <span className="amt">{tk(x.out)}</span>
          </button>
        ))}
        {!led.open.length && <div className="row"><span className="meta">Nothing unpaid.</span></div>}
      </div>
      <h3 className="sheet-h">Recent payments</h3>
      <div className="rows flush">
        {led.payments.slice(0, 6).map((p, i) => (
          <div key={i} className="row">
            <span className="name normal">{p.label}</span>
            <span className="meta">{fshort(p.date)}</span>
            <span className="amt t-good">{tk(p.amount)}</span>
          </div>
        ))}
        {!led.payments.length && <div className="row"><span className="meta">No payments yet.</span></div>}
      </div>
    </Sheet>
  )
}

export function Collect({ dealerId }) {
  const { db, act } = useStore()
  const toast = useToast()
  const withDue = db.dealers.map((d) => dealerLedger(db, d.id)).filter((l) => l.due > 0)
  const start = dealerId || withDue[0]?.dealer.id || db.dealers[0]?.id || ''
  const [v, set, bind, nbind] = useForm({ dealerId: start, invoiceId: '', amount: '', method: 'Cash', collectedBy: byId(db.dealers, start)?.salesId || '', date: todayISO() })
  const led = v.dealerId ? dealerLedger(db, v.dealerId) : null
  return (
    <FormSheet title="Collect from dealer" crumb="Cashbook and dues" submit="Save collection"
      note={led ? `${led.dealer.name} owes ${tk(led.due)}. The amount is taken off the oldest invoice first unless you pick one.` : 'Add a dealer first.'}
      onSubmit={() => {
        const amount = num(v.amount)
        if (!led) return 'Choose a dealer.'
        if (amount <= 0) return 'Enter the amount collected.'
        if (amount > led.due) return `That is more than the ${tk(led.due)} this dealer owes.`
        act('collect', { dealerId: v.dealerId, invoiceId: v.invoiceId, amount, method: v.method, collectedBy: v.collectedBy, date: v.date })
        toast(`${tk(amount)} collected from ${led.dealer.name}`)
      }}>
      <Field label="Dealer">
        <select className="in" value={v.dealerId} onChange={(e) => {
          set('dealerId', e.target.value)
          set('invoiceId', '')
          set('collectedBy', byId(db.dealers, e.target.value)?.salesId || '')
        }}>
          {db.dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="Against invoice">
        <select {...bind('invoiceId')}>
          <option value="">Oldest due first</option>
          {led?.open.filter((x) => x.id !== 'opening').map((x) => <option key={x.id} value={x.id}>{x.label} · due {tk(x.out)}</option>)}
        </select>
      </Field>
      <Field label="Amount (Tk)" hint={led && led.due > 0 ? <button type="button" className="link" onClick={() => set('amount', String(led.due))}>Full due {tk(led.due)}</button> : undefined}>
        <input {...nbind('amount')} placeholder="0" />
      </Field>
      <Field label="Received by"><MethodSelect {...bind('method')} /></Field>
      <Field label="Collected by">
        <select {...bind('collectedBy')}>
          <option value="">Office</option>
          {db.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
    </FormSheet>
  )
}

export function InvoiceLine({ onAdd, taken = [] }) {
  const { db } = useStore()
  const pool = db.products.filter((p) => p.kind === 'finished' && !taken.includes(p.id))
  const [v, set, , nbind] = useForm({ productId: pool[0]?.id || '', qty: '', price: pool[0] ? String(pool[0].price) : '' })
  const p = byId(db.products, v.productId)
  return (
    <FormSheet title="Add product to invoice" crumb="Sell to dealer" submit="Add to invoice"
      note={p ? `${fmt(p.stock)} ${p.unit} in warehouse.` : 'No more finished goods to add.'}
      onSubmit={() => {
        if (!p) return 'Choose a product.'
        if (num(v.qty) <= 0) return 'Enter the quantity.'
        if (num(v.qty) > p.stock) return `Only ${fmt(p.stock)} ${p.unit} in the warehouse.`
        if (num(v.price) <= 0) return 'Enter the dealer price.'
        onAdd({ productId: p.id, qty: num(v.qty), price: num(v.price) })
      }}>
      <Field label="Product" wide>
        <select className="in" value={v.productId} onChange={(e) => {
          set('productId', e.target.value)
          set('price', String(byId(db.products, e.target.value)?.price || ''))
        }}>
          {pool.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <Field label={`Quantity${p ? ` (${p.unit})` : ''}`}><input {...nbind('qty')} placeholder="e.g. 5" /></Field>
      <Field label="Dealer price (Tk)"><input {...nbind('price')} placeholder="Filled from product" /></Field>
    </FormSheet>
  )
}

export function ViewInvoice({ invoiceId }) {
  const { db } = useStore()
  const print = usePrint()
  const { close } = useSheetItem()
  const inv = byId(db.invoices, invoiceId)
  if (!inv) return null
  return (
    <Sheet title={inv.id} crumb="Invoice" wide
      footer={
        <>
          <Button variant="secondary" onClick={close}>Close</Button>
          <Button onClick={() => print(<InvoiceDoc db={db} inv={inv} />)}>Print invoice</Button>
        </>
      }>
      <div className="invoice-wrap"><InvoiceDoc db={db} inv={inv} /></div>
    </Sheet>
  )
}

export const InvoiceStatus = ({ inv, due }) => inv.status === 'draft'
  ? <Pill tone="info">Draft</Pill>
  : due > 0 ? <Pill tone="warn">Due {tk(due)}</Pill> : <Pill tone="good">Paid</Pill>
