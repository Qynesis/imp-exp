import { byId, fmt, foCalc, num, todayISO, tk, tripCalc, trips, siteStock } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { ScanBox } from '@/components/barcode/ScanBox'
import { useBooks } from '@/core/store/context'
import { LabelsSheet } from '@/features/products/sheets/LabelsSheet'
import { SitePicker } from '@/components/SitePicker'
import { Field, FormSheet, Segmented, useForm, useSheets, useToast } from '@/ui'
import { useReceiveAccess } from '@/features/warehouse/receiveAccess'
import { NotAllowed } from '@/features/warehouse/sheets/ReceiveSheets'

type FreightMode = 'none' | 'in' | 'out'

/**
 * One shipment from the factory into our warehouse. Several shipments can arrive against the same
 * order; payment is separate and never required here. Freight from factory to warehouse can be
 * added to the product cost (included) or kept as a transport expense only (excluded).
 */
export function ReceiveShipmentSheet({ orderId }: { orderId: string }) {
  const { db, act, saveNow } = useBooks()
  const { can, me } = useReceiveAccess()
  const sheets = useSheets()
  const toast = useToast()
  const [v, set, bind, nbind] = useForm({ siteId: siteStock(db).mainId, date: todayISO(), challan: '', qty: '', damaged: '', note: '', freightMode: 'none' as FreightMode, freight: '', method: 'Cash', labels: '' })
  const o = byId(db.factoryOrders, orderId)
  if (!o) return null
  if (!can) return <NotAllowed title={`Receive shipment · ${o.id}`} crumb="Factory order" />
  const c = foCalc(db, o)
  const qty = num(v.qty)
  const freight = v.freightMode === 'none' ? 0 : num(v.freight)
  // a pickup trip already booked for this order carries its own costs
  const booked = trips(db).filter((t) => t.orderId === o.id && t.status !== 'cancelled')
  const bookedCost = booked.reduce((s, t) => s + tripCalc(db, t).cost, 0)
  const prod = c.product
  const unitIn = qty > 0 && v.freightMode === 'in' ? o.rate + freight / qty : 0
  const newCost = prod && unitIn ? (Math.max(prod.stock, 0) * prod.cost + qty * unitIn) / (Math.max(prod.stock, 0) + qty) : 0
  return (
    <FormSheet title={`Confirm: goods received · ${o.id}`} crumb="Factory order" submit="Confirm received" busyLabel="Saving to the books…" wide
      note={`Still due from ${c.factory?.name}: ${fmt(c.pending)} of ${fmt(o.qty)} ${c.unit}. Whatever is not received now stays pending on this order. Payment is recorded separately, whenever you pay.`}
      onSubmit={async () => {
        if (!v.date) return 'Pick the date the goods came in.'
        if (v.date > todayISO()) return 'The date cannot be in the future.'
        if (v.date < o.placed) return 'The goods cannot come in before the order was placed.'
        if (qty <= 0) return 'Enter the quantity received.'
        if (num(v.damaged) < 0) return 'Damaged cannot be negative.'
        if (qty > c.pending) return `Only ${fmt(c.pending)} ${c.unit} are still pending on this order. Change the order first if the factory sent more.`
        if (v.freightMode !== 'none' && freight <= 0) return 'Enter the freight paid, or choose No freight.'
        const why = act('receiveShipment', { orderId, date: v.date, challan: v.challan.trim(), qty, damaged: num(v.damaged), note: v.note.trim(), freight, freightInCost: v.freightMode === 'in', method: v.method, siteId: v.siteId || undefined, by: me })
        if (why) return why
        const saved = await saveNow()
        if (saved) return saved
        if (v.labels === 'yes') {
          const p = db.products.find((x) => x.id === o.productId)
          const cartons = p?.perCarton ? Math.ceil(qty / p.perCarton) : 0
          sheets.open(LabelsSheet, { preset: [{ productId: o.productId, count: cartons || Math.ceil(qty), kind: cartons ? 'carton' : 'unit' }] })
        }
        toast(`${fmt(qty)} ${c.unit} added to stock${freight ? ` · freight ${tk(freight)} saved` : ''}`)
      }}>
      <div className="wide-note">
        <ScanBox hint="Scan each pack or carton as it comes off the truck" onScan={(hit) => {
          if (hit.product.id !== o.productId) return `${hit.product.name} is not on this order`
          const next = num(v.qty) + hit.qty
          if (next > c.pending) return `Only ${fmt(c.pending)} ${c.unit} are pending on this order`
          set('qty', String(next))
        }} />
      </div>
      <Field label="Date received"><input type="date" min={o.placed} max={todayISO()} {...bind('date')} /></Field>
      <SitePicker db={db} bind={bind('siteId')} />
      <Field label="Challan number"><input {...bind('challan')} placeholder="e.g. CH-320" /></Field>
      <Field label={`Good quantity received (${c.unit})`}><input {...nbind('qty')} placeholder={`Up to ${fmt(c.pending)}`} /></Field>
      <Field label="Damaged or rejected" hint="Recorded on the challan, not added to stock."><input {...nbind('damaged')} placeholder="0" /></Field>

      <div className="field wide">
        <span className="field-label">Freight from factory to warehouse</span>
        <Segmented<FreightMode> label="Freight" value={v.freightMode} onChange={(m) => set('freightMode', m)} options={[
          { value: 'none', label: 'No freight' },
          { value: 'in', label: 'Include in product cost' },
          { value: 'out', label: 'Exclude (expense only)' },
        ]} />
        <small>
          {v.freightMode === 'in' ? 'The freight is spread over this shipment and goes into the cost per unit, so profit on sales reflects it.'
            : v.freightMode === 'out' ? 'The freight goes into the cashbook as a transport expense; the product cost stays as it is.'
            : booked.length ? `Pickup ${booked.map((t) => t.id).join(', ')} is booked for this order (${tk(bookedCost)} so far). Its costs are already recorded.` : 'Choose No freight when the factory delivers free or the trip is booked under Transport.'}
        </small>
      </div>
      {v.freightMode !== 'none' && (
        <>
          <Field label="Freight paid (Tk)" hint={unitIn ? `Cost per ${c.unit.replace(/s$/, '')} on this shipment ${tk(unitIn)}; product cost becomes about ${tk(newCost)}` : undefined}><input {...nbind('freight')} placeholder="0" /></Field>
          <Field label="Freight paid by"><MethodSelect {...bind('method')} /></Field>
        </>
      )}
      <Field label="Note" wide><input {...bind('note')} placeholder="Optional" /></Field>
      <label className="check wide-note"><input type="checkbox" checked={v.labels === 'yes'} onChange={(e) => set('labels', e.target.checked ? 'yes' : '')} /> Print barcode labels for these goods after saving</label>
    </FormSheet>
  )
}
