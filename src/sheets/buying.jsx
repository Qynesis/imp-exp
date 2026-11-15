import { fmt, num, tk, todayISO } from '../lib/format.js'
import { COST_TYPES, KINDS, METHODS, UNITS, byId, foCalc, supplierLedger } from '../lib/selectors.js'
import { useStore } from '../lib/store.jsx'
import { CustomFields } from '../custom.jsx'
import { Button, Field, FormSheet, Icon, go, useForm, useSheets, useToast } from '../ui.jsx'

export const MethodSelect = (props) => (
  <select {...props}>
    {METHODS.map((m) => <option key={m}>{m}</option>)}
  </select>
)

export function AddFactory() {
  const { act } = useStore()
  const toast = useToast()
  const [v, , bind] = useForm({ name: '', contact: '', phone: '', address: '', makes: '' })
  return (
    <FormSheet title="Add factory" crumb="Factory orders" submit="Save factory" onSubmit={() => {
      if (!v.name.trim()) return 'Enter the factory name.'
      act('addFactory', { ...v, name: v.name.trim() })
      toast('Factory added')
    }}>
      <Field label="Factory name"><input {...bind('name')} placeholder="Business name" /></Field>
      <Field label="Contact person"><input {...bind('contact')} placeholder="Full name" /></Field>
      <Field label="Phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXX-XXXXXX" /></Field>
      <Field label="What they make"><input {...bind('makes')} placeholder="e.g. Mosquito coil" /></Field>
      <Field label="Address" wide><input {...bind('address')} placeholder="Factory address" /></Field>
    </FormSheet>
  )
}

export function NewFactoryOrder() {
  const { db, act } = useStore()
  const toast = useToast()
  const sheets = useSheets()
  const [v, set, bind, nbind] = useForm({
    factoryId: db.factories[0]?.id || '', type: '1', productId: db.products.find((p) => p.kind === 'finished')?.id || db.products[0]?.id || '',
    qty: '', rate: '', expected: '', advance: '', method: 'Cash', materials: [], custom: {},
  })
  const product = byId(db.products, v.productId)
  const stockables = db.products.filter((p) => p.kind !== 'finished')
  const setMat = (i, patch) => set('materials', v.materials.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  const total = num(v.qty) * num(v.rate)

  const submit = () => {
    if (!v.factoryId) return 'Add a factory first.'
    if (!v.productId) return 'Add the product first, under Products and stock.'
    if (num(v.qty) <= 0) return 'Enter how many you are ordering.'
    if (num(v.rate) <= 0) return 'Enter the rate per unit.'
    const materials = []
    if (v.type === '1') {
      for (const m of v.materials) {
        const p = byId(db.products, m.productId)
        const given = num(m.given)
        if (!p || given <= 0) continue
        const already = materials.filter((x) => x.productId === p.id).reduce((s, x) => s + x.given, 0)
        if (given + already > p.stock) return `Only ${fmt(p.stock)} ${p.unit} of ${p.name} in the warehouse.`
        materials.push({ productId: p.id, given })
      }
    }
    const id = 'FO-' + db.seq.fo
    act('newFactoryOrder', {
      factoryId: v.factoryId, type: Number(v.type), productId: v.productId, qty: num(v.qty), rate: num(v.rate),
      placed: todayISO(), expected: v.expected, advance: num(v.advance), method: v.method, materials, custom: v.custom,
    })
    toast(`Order ${id} placed`)
    go('factory-orders/' + id)
  }

  return (
    <FormSheet title="New factory order" crumb="Factory orders" submit="Place order" onSubmit={submit}
      note="Type 1: we hand over raw materials and pay only a making charge. Type 2: the factory uses its own materials and bills the full price.">
      <Field label="Factory" hint={<button type="button" className="link" onClick={() => sheets.open('addFactory')}>Add a new factory</button>}>
        <select {...bind('factoryId')}>
          {!db.factories.length && <option value="">No factories yet</option>}
          {db.factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </Field>
      <Field label="Order type">
        <select {...bind('type')}>
          <option value="1">Type 1 · Raw material supplied</option>
          <option value="2">Type 2 · Direct order</option>
        </select>
      </Field>
      <Field label="Product">
        <select {...bind('productId')}>
          {db.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label={`Quantity${product ? ` (${product.unit})` : ''}`}><input {...nbind('qty')} placeholder="e.g. 50" /></Field>
      <Field label={v.type === '1' ? 'Making charge per unit (Tk)' : 'Price per unit (Tk)'} hint={total > 0 ? `Order value ${tk(total)}` : undefined}>
        <input {...nbind('rate')} placeholder="0" />
      </Field>
      <Field label="Expected delivery date"><input type="date" {...bind('expected')} /></Field>
      <Field label="Advance paid now (Tk)"><input {...nbind('advance')} placeholder="0" /></Field>
      <Field label="Advance paid by"><MethodSelect {...bind('method')} /></Field>
      <CustomFields entity="factoryOrder" v={v} set={set} />

      {v.type === '1' && (
        <div className="field wide">
          <span className="field-label">Raw materials handed over</span>
          {v.materials.map((m, i) => {
            const p = byId(db.products, m.productId)
            return (
              <div className="mat-row" key={i}>
                <select className="in" value={m.productId} onChange={(e) => setMat(i, { productId: e.target.value })} aria-label="Material">
                  {stockables.map((s) => <option key={s.id} value={s.id}>{s.name} · {fmt(s.stock)} {s.unit} in warehouse</option>)}
                </select>
                <input className="in" inputMode="decimal" value={m.given} onChange={(e) => setMat(i, { given: e.target.value })} placeholder={p ? p.unit : 'Qty'} aria-label="Quantity handed over" />
                <button type="button" className="icon-btn" aria-label="Remove material" onClick={() => set('materials', v.materials.filter((_, j) => j !== i))}><Icon name="trash" size={18} /></button>
              </div>
            )
          })}
          {stockables.length ? (
            <Button variant="dashed" size="sm" onClick={() => set('materials', [...v.materials, { productId: stockables[0].id, given: '' }])}>Add material</Button>
          ) : <small>No raw materials or packaging in Products and stock yet.</small>}
          <small>Handed-over materials leave the warehouse and are tracked at the factory.</small>
        </div>
      )}
    </FormSheet>
  )
}

export function ReceiveShipment({ orderId }) {
  const { db, act } = useStore()
  const toast = useToast()
  const o = byId(db.factoryOrders, orderId)
  const c = foCalc(db, o)
  const [v, , bind, nbind] = useForm({ date: todayISO(), challan: '', qty: '', damaged: '', note: '' })
  return (
    <FormSheet title={`Receive shipment · ${o.id}`} crumb="Factory order" submit="Receive goods"
      note={`Still due from ${c.factory?.name}: ${fmt(c.pending)} of ${fmt(o.qty)} ${c.unit}. Whatever is not received now stays pending on this order.`}
      onSubmit={() => {
        const qty = num(v.qty)
        if (qty <= 0) return 'Enter the quantity received.'
        if (qty > c.pending) return `Only ${fmt(c.pending)} ${c.unit} are still pending on this order.`
        act('receiveShipment', { orderId, date: v.date, challan: v.challan.trim(), qty, damaged: num(v.damaged), note: v.note.trim() })
        toast(`${fmt(qty)} ${c.unit} added to stock`)
      }}>
      <Field label="Date received"><input type="date" {...bind('date')} /></Field>
      <Field label="Challan number"><input {...bind('challan')} placeholder="e.g. CH-320" /></Field>
      <Field label={`Good quantity received (${c.unit})`}><input {...nbind('qty')} placeholder={`Up to ${fmt(c.pending)}`} /></Field>
      <Field label="Damaged or rejected" hint="Recorded on the challan, not added to stock."><input {...nbind('damaged')} placeholder="0" /></Field>
      <Field label="Note" wide><input {...bind('note')} placeholder="Optional" /></Field>
    </FormSheet>
  )
}

export function FactoryBill({ orderId }) {
  const { db, act } = useStore()
  const toast = useToast()
  const o = byId(db.factoryOrders, orderId)
  const c = foCalc(db, o)
  const unbilled = o.receipts.filter((r) => !o.bills.some((b) => b.receiptId === r.id))
  const first = unbilled[0]
  const [v, set, bind, nbind] = useForm({ billNo: '', date: todayISO(), receiptId: first?.id || '', amount: first ? String(first.qty * o.rate) : '' })
  return (
    <FormSheet title={`Record factory bill · ${o.id}`} crumb="Factory order" submit="Save bill"
      note={c.balance > 0 ? `Balance now: factory owes us ${tk(c.balance)}. This bill will be taken off that advance first.` : c.balance < 0 ? `Balance now: we owe ${tk(-c.balance)}. This bill adds to it.` : 'Nothing is owed either way right now.'}
      onSubmit={() => {
        if (num(v.amount) <= 0) return 'Enter the bill amount.'
        act('factoryBill', { orderId, billNo: v.billNo.trim() || 'Bill', date: v.date, receiptId: v.receiptId, amount: num(v.amount) })
        toast('Factory bill recorded')
      }}>
      <Field label="Bill number"><input {...bind('billNo')} placeholder="e.g. INV-F-215" /></Field>
      <Field label="Bill date"><input type="date" {...bind('date')} /></Field>
      <Field label="Against shipment">
        <select className="in" value={v.receiptId} onChange={(e) => {
          const r = o.receipts.find((x) => x.id === e.target.value)
          set('receiptId', e.target.value)
          if (r) set('amount', String(r.qty * o.rate))
        }}>
          <option value="">Not tied to a shipment</option>
          {o.receipts.map((r) => <option key={r.id} value={r.id}>{r.challan || 'Shipment'} · {fmt(r.qty)} {c.unit}</option>)}
        </select>
      </Field>
      <Field label="Bill amount (Tk)" hint={`Rate ${tk(o.rate)} per unit`}><input {...nbind('amount')} placeholder="0" /></Field>
    </FormSheet>
  )
}

/** One payment form for both suppliers and factories. */
export function Pay({ kind = 'supplier', supplierId, purchaseId, orderId, crumb }) {
  const { db, act } = useStore()
  const toast = useToast()
  const [v, , bind, nbind] = useForm({
    kind, supplierId: supplierId || db.suppliers[0]?.id || '', purchaseId: purchaseId || '', orderId: orderId || db.factoryOrders[0]?.id || '',
    amount: '', method: 'Cash', date: todayISO(), note: '',
  })
  const led = v.kind === 'supplier' && v.supplierId ? supplierLedger(db, v.supplierId) : null
  const order = v.kind === 'factory' ? byId(db.factoryOrders, v.orderId) : null
  const oc = order && foCalc(db, order)
  const note = led
    ? led.due > 0 ? `We owe ${led.supplier.name} ${tk(led.due)}.` : `${led.supplier.name} is settled. Nothing is due.`
    : oc ? `${oc.factory?.name} · ${order.id}: ${oc.balanceText}. Paying more than is billed is kept as an advance.` : null
  return (
    <FormSheet title={v.kind === 'supplier' ? 'Pay supplier' : 'Pay factory'} crumb={crumb || 'Make payment'} submit="Save payment" note={note}
      onSubmit={() => {
        const amount = num(v.amount)
        if (amount <= 0) return 'Enter the amount paid.'
        if (v.kind === 'supplier') {
          if (!led) return 'Choose a supplier.'
          if (amount > led.due) return `That is more than the ${tk(led.due)} we owe this supplier.`
          act('paySupplier', { supplierId: v.supplierId, purchaseId: v.purchaseId, amount, method: v.method, date: v.date, note: v.note.trim() })
        } else {
          if (!order) return 'Choose a factory order.'
          act('payFactory', { orderId: v.orderId, amount, method: v.method, date: v.date, note: v.note.trim() || `Payment for ${order.id}` })
        }
        toast(`${tk(amount)} payment saved`)
      }}>
      <Field label="Pay to">
        <select {...bind('kind')}>
          <option value="supplier">Supplier</option>
          <option value="factory">Factory</option>
        </select>
      </Field>
      {v.kind === 'supplier' ? (
        <>
          <Field label="Supplier">
            <select {...bind('supplierId')}>
              {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Against bill">
            <select {...bind('purchaseId')}>
              <option value="">Oldest bill first</option>
              {led?.bills.filter((b) => b.amount - b.paid > 0 && b.id !== 'opening').map((b) => <option key={b.id} value={b.id}>{b.billNo} · due {tk(b.amount - b.paid)}</option>)}
            </select>
          </Field>
        </>
      ) : (
        <Field label="Against order">
          <select {...bind('orderId')}>
            {db.factoryOrders.map((o) => <option key={o.id} value={o.id}>{o.id} · {byId(db.factories, o.factoryId)?.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Amount (Tk)"><input {...nbind('amount')} placeholder="0" /></Field>
      <Field label="Paid by"><MethodSelect {...bind('method')} /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Note" wide={v.kind === 'factory'}><input {...bind('note')} placeholder="Optional" /></Field>
    </FormSheet>
  )
}

export function AddSupplier() {
  const { act } = useStore()
  const toast = useToast()
  const [v, set, bind, nbind] = useForm({ name: '', contact: '', phone: '', address: '', goods: '', terms: 'credit', days: '30', opening: '', custom: {} })
  return (
    <FormSheet title="Add supplier" crumb="Suppliers" submit="Save supplier" onSubmit={() => {
      if (!v.name.trim()) return 'Enter the supplier name.'
      act('addSupplier', { ...v, name: v.name.trim(), days: v.terms === 'credit' ? num(v.days) : 0, opening: num(v.opening) })
      toast('Supplier added')
    }}>
      <Field label="Supplier name"><input {...bind('name')} placeholder="Business name" /></Field>
      <Field label="Contact person"><input {...bind('contact')} placeholder="Full name" /></Field>
      <Field label="Phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXX-XXXXXX" /></Field>
      <Field label="Address"><input {...bind('address')} placeholder="Shop or office address" /></Field>
      <Field label="Goods supplied"><input {...bind('goods')} placeholder="e.g. Coil powder" /></Field>
      <Field label="Payment terms">
        <select {...bind('terms')}>
          <option value="credit">Credit</option>
          <option value="cash">Cash</option>
        </select>
      </Field>
      {v.terms === 'credit' && <Field label="Credit days"><input {...nbind('days')} placeholder="30" /></Field>}
      <Field label="Opening balance we owe (Tk)"><input {...nbind('opening')} placeholder="0" /></Field>
      <CustomFields entity="supplier" v={v} set={set} />
    </FormSheet>
  )
}

export function NewPurchase({ supplierId }) {
  const { db, act } = useStore()
  const toast = useToast()
  const sup = byId(db.suppliers, supplierId) || db.suppliers[0]
  const items = db.products.filter((p) => p.kind !== 'finished')
  const pool = items.length ? items : db.products
  const [v, set, bind, nbind] = useForm({
    supplierId: sup?.id || '', billNo: 'PB-' + db.seq.pb, date: todayISO(), productId: pool[0]?.id || '', qty: '', rate: pool[0]?.cost ? String(pool[0].cost) : '',
    terms: sup?.terms || 'credit', paid: '', method: 'Cash',
  })
  const product = byId(db.products, v.productId)
  const amount = num(v.qty) * num(v.rate)
  return (
    <FormSheet title="New purchase" crumb="Suppliers" submit="Save purchase"
      note="Goods go straight into warehouse stock. On credit, the unpaid part is added to what we owe this supplier."
      onSubmit={() => {
        if (!v.supplierId) return 'Add a supplier first.'
        if (!product) return 'Add the item first, under Products and stock.'
        if (num(v.qty) <= 0 || num(v.rate) <= 0) return 'Enter the quantity and the rate.'
        const paid = v.terms === 'cash' ? amount : num(v.paid)
        if (paid > amount) return `Paid now cannot be more than the bill of ${tk(amount)}.`
        act('newPurchase', { supplierId: v.supplierId, billNo: v.billNo.trim() || 'PB-' + db.seq.pb, date: v.date, productId: v.productId, qty: num(v.qty), rate: num(v.rate), terms: v.terms, paid, method: v.method })
        toast(`${fmt(num(v.qty))} ${product.unit} added to stock`)
      }}>
      <Field label="Supplier">
        <select {...bind('supplierId')}>
          {db.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Bill number"><input {...bind('billNo')} placeholder="e.g. PB-222" /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Item">
        <select className="in" value={v.productId} onChange={(e) => {
          set('productId', e.target.value)
          const p = byId(db.products, e.target.value)
          if (p?.cost) set('rate', String(p.cost))
        }}>
          {pool.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label={`Quantity${product ? ` (${product.unit})` : ''}`}><input {...nbind('qty')} placeholder="e.g. 500" /></Field>
      <Field label="Rate per unit (Tk)" hint={amount > 0 ? `Bill amount ${tk(amount)}` : undefined}><input {...nbind('rate')} placeholder="0" /></Field>
      <Field label="Terms">
        <select {...bind('terms')}>
          <option value="credit">Credit</option>
          <option value="cash">Cash, paid in full now</option>
        </select>
      </Field>
      {v.terms === 'credit' && <Field label="Paid now (Tk)"><input {...nbind('paid')} placeholder="0" /></Field>}
      <Field label="Paid by"><MethodSelect {...bind('method')} /></Field>
    </FormSheet>
  )
}

export function NewImport() {
  const { db, act } = useStore()
  const toast = useToast()
  const [v, set, bind, nbind] = useForm({ direction: 'import', supplier: '', country: '', productId: db.products[0]?.id || '', productName: '', qty: '', unit: 'pcs', lcNo: '', bank: '', usd: '', rate: '', startDate: todayISO(), expected: '', hsCode: '', custom: {} })
  const product = byId(db.products, v.productId)
  const exp = v.direction === 'export'
  return (
    <FormSheet title="New shipment" crumb="Shipments" submit="Save shipment" wide
      note={exp
        ? 'For goods you sell abroad. Stock leaves the warehouse when the shipment is marked shipped, and the proceeds reach the cashbook when payment is realised.'
        : 'For goods you buy from abroad. The LC invoice value is taken out of the cashbook on the LC date. Add freight, duty and other costs as they come.'}
      onSubmit={() => {
        if (!product && !v.productName.trim()) return 'Say what is being shipped.'
        if (num(v.qty) <= 0) return 'Enter the quantity.'
        if (num(v.usd) <= 0 || num(v.rate) <= 0) return 'Enter the invoice value in USD and the exchange rate.'
        const id = (exp ? 'EXP-' : 'IMP-') + String(exp ? db.seq.exp : db.seq.imp).padStart(3, '0')
        act('newImport', {
          direction: v.direction, supplier: v.supplier.trim(), country: v.country.trim(), productId: product?.id || '', productName: product?.name || v.productName.trim(),
          qty: num(v.qty), unit: product?.unit || v.unit, lcNo: v.lcNo.trim(), bank: v.bank.trim(), usd: num(v.usd), rate: num(v.rate), startDate: v.startDate, expected: v.expected,
          custom: v.custom, customs: { hsCode: v.hsCode.trim(), port: 'Chattogram port', stages: {}, docs: {}, rates: {} },
        })
        toast(`Shipment ${id} saved`)
        go('imports/' + id)
      }}>
      <Field label="Import or export">
        <select {...bind('direction')}>
          <option value="import">Import (we buy from abroad)</option>
          <option value="export">Export (we sell abroad)</option>
        </select>
      </Field>
      <Field label={exp ? 'Buyer abroad' : 'Supplier abroad'}><input {...bind('supplier')} placeholder="Company name" /></Field>
      <Field label="Country"><input {...bind('country')} placeholder={exp ? 'e.g. Nepal' : 'e.g. Malaysia'} /></Field>
      <Field label="Product">
        <select {...bind('productId')}>
          {db.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="">Something not in the product list</option>
        </select>
      </Field>
      {!product && <Field label="Goods description"><input {...bind('productName')} placeholder="e.g. CNC lathe machine" /></Field>}
      <Field label={`Quantity${product ? ` (${product.unit})` : ''}`}><input {...nbind('qty')} placeholder="e.g. 200" /></Field>
      {!product && (
        <Field label="Unit">
          <select {...bind('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
        </Field>
      )}
      <Field label="HS code"><input {...bind('hsCode')} placeholder="e.g. 8479.89.00" /></Field>
      <Field label={exp ? 'Export LC or contract number' : 'LC number'}><input {...bind('lcNo')} placeholder="e.g. LC-2026-0480" /></Field>
      <Field label="Bank"><input {...bind('bank')} placeholder="Bank name" /></Field>
      <Field label="Invoice value (USD)"><input {...nbind('usd')} placeholder="0" /></Field>
      <Field label="Exchange rate (Tk per USD)" hint={num(v.usd) * num(v.rate) > 0 ? `= ${tk(num(v.usd) * num(v.rate))}` : undefined}><input {...nbind('rate')} placeholder="0" /></Field>
      <Field label={exp ? 'Contract received on' : 'LC opened on'}><input type="date" {...bind('startDate')} /></Field>
      <Field label={exp ? 'Expected shipping date' : 'Expected arrival at port'}><input type="date" {...bind('expected')} /></Field>
      <CustomFields entity="shipment" v={v} set={set} />
    </FormSheet>
  )
}

export function AddCost({ importId }) {
  const { act } = useStore()
  const toast = useToast()
  const [v, , bind, nbind] = useForm({ type: COST_TYPES[2], amount: '', method: 'Cash', date: todayISO() })
  return (
    <FormSheet title={`Add cost · ${importId}`} crumb="Shipments" submit="Add cost" note="Every cost added here counts towards the landed cost of an import, or comes off the margin of an export."
      onSubmit={() => {
        if (num(v.amount) <= 0) return 'Enter the amount.'
        act('addImportCost', { importId, type: v.type, amount: num(v.amount), method: v.method, date: v.date })
        toast('Cost added to landed cost')
      }}>
      <Field label="Cost type">
        <select {...bind('type')}>{COST_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
      </Field>
      <Field label="Amount (Tk)"><input {...nbind('amount')} placeholder="0" /></Field>
      <Field label="Paid by"><MethodSelect {...bind('method')} /></Field>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
    </FormSheet>
  )
}

export function AddCategory() {
  const { db, act } = useStore()
  const toast = useToast()
  const [v, , bind] = useForm({ name: '', parentId: '' })
  return (
    <FormSheet title="Add category" crumb="Products and stock" submit="Save category" note="Pick a parent to make this a sub category."
      onSubmit={() => {
        if (!v.name.trim()) return 'Enter the category name.'
        act('addCategory', { name: v.name.trim(), parentId: v.parentId })
        toast('Category added')
      }}>
      <Field label="Category name"><input {...bind('name')} placeholder="e.g. Detergent" /></Field>
      <Field label="Parent category">
        <select {...bind('parentId')}>
          <option value="">None (top level)</option>
          {db.categories.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
    </FormSheet>
  )
}

export function ProductSheet({ productId }) {
  const { db, act } = useStore()
  const toast = useToast()
  const cur = productId && byId(db.products, productId)
  const tops = db.categories.filter((c) => !c.parentId)
  const curCat = cur && byId(db.categories, cur.categoryId)
  const [v, set, bind, nbind] = useForm(cur ? {
    name: cur.name, code: cur.code, top: curCat?.parentId || curCat?.id || '', sub: curCat?.parentId ? curCat.id : '', kind: cur.kind, unit: cur.unit, pack: cur.pack || '',
    cost: String(cur.cost || ''), price: String(cur.price || ''), stock: String(cur.stock), lowAt: String(cur.lowAt || ''), custom: cur.custom || {},
  } : { name: '', code: '', top: tops[0]?.id || '', sub: '', kind: 'finished', unit: 'cartons', pack: '', cost: '', price: '', stock: '', lowAt: '', custom: {} })
  const subs = db.categories.filter((c) => c.parentId === v.top)
  return (
    <FormSheet title={cur ? 'Edit product' : 'Add product'} crumb="Products and stock" submit="Save product"
      note={cur ? 'Changing the stock figure here is a manual correction. Normal movements come from purchases, factory receipts and sales.' : undefined}
      onSubmit={() => {
        if (!v.name.trim()) return 'Enter the product name.'
        act('saveProduct', {
          id: cur?.id, name: v.name.trim(), code: v.code.trim(), categoryId: v.sub || v.top, kind: v.kind, unit: v.unit, pack: v.pack.trim(),
          cost: num(v.cost), price: num(v.price), stock: num(v.stock), lowAt: num(v.lowAt), custom: v.custom,
        })
        toast(cur ? 'Product updated' : 'Product added')
      }}>
      <Field label="Product name"><input {...bind('name')} placeholder="e.g. Mustard oil 1 L" /></Field>
      <Field label="Product code"><input {...bind('code')} placeholder="e.g. MO-1L" /></Field>
      <Field label="Category">
        <select className="in" value={v.top} onChange={(e) => { set('top', e.target.value); set('sub', '') }}>
          {!tops.length && <option value="">No categories yet</option>}
          {tops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Sub category">
        <select {...bind('sub')}>
          <option value="">None</option>
          {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Kind">
        <select {...bind('kind')}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      <Field label="Unit">
        <select {...bind('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
      </Field>
      <Field label="Cost per unit (Tk)"><input {...nbind('cost')} placeholder="0" /></Field>
      <Field label="Dealer price (Tk)"><input {...nbind('price')} placeholder="0" /></Field>
      <Field label={cur ? 'Stock in warehouse' : 'Opening stock'}><input {...nbind('stock')} placeholder="0" /></Field>
      <Field label="Low stock alert at"><input {...nbind('lowAt')} placeholder="e.g. 10" /></Field>
      <Field label="Pack note" wide><input {...bind('pack')} placeholder="e.g. carton of 60 boxes" /></Field>
      <CustomFields entity="product" v={v} set={set} />
    </FormSheet>
  )
}
