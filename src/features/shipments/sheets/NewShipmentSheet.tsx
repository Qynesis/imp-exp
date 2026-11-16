import { activeProducts, byId, DEFAULT_PORT, num, tk, todayISO, UNITS, type CustomValues, type Direction } from '@shared/domain'
import { CustomFields } from '@/components/CustomFields'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

/** A new import or export. `productId` starts an import of that item. */
export function NewShipmentSheet({ productId }: { productId?: string } = {}) {
  const { db, act } = useBooks()
  const toast = useToast()
  const [v, set, bind, nbind] = useForm({
    direction: 'import' as Direction, supplier: '', country: '', productId: productId || activeProducts(db)[0]?.id || '', productName: '', qty: '', unit: 'pcs',
    lcNo: '', bank: '', usd: '', rate: '', startDate: todayISO(), expected: '', hsCode: '', custom: {} as CustomValues,
  })
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
          custom: v.custom, customs: { hsCode: v.hsCode.trim(), port: DEFAULT_PORT, stages: {}, docs: {}, rates: {} },
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
          {activeProducts(db).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
      <CustomFields entity="shipment" value={v.custom} onChange={(c) => set('custom', c)} />
    </FormSheet>
  )
}
