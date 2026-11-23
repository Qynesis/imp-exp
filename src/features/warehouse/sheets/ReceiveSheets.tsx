import { byId, fdate, fmt, foCalc, num, siteStock, todayISO } from '@shared/domain'
import { SitePicker } from '@/components/SitePicker'
import { useBooks } from '@/core/store/context'
import { useReceiveAccess } from '../receiveAccess'
import { ReceiveShipmentSheet } from '@/features/factory-orders/sheets/ReceiveShipmentSheet'
import { Button, DataTable, Field, FormSheet, Pill, Sheet, useForm, useSheetItem, useSheets, useToast, type SheetComponent } from '@/ui'

/** Shown instead of a receiving form to someone the admin has not allowed to receive goods. */
export function NotAllowed({ title, crumb }: { title: string; crumb?: string }) {
  const { who } = useReceiveAccess()
  const { close } = useSheetItem()
  return (
    <Sheet title={title} crumb={crumb} footer={<Button variant="secondary" onClick={close}>Close</Button>}>
      <div className="err" role="alert">Only an admin, or someone the admin gave edit access to Warehouse, can confirm goods received.</div>
      <p className="t-muted">{who.length ? `Ask ${who.slice(0, 4).join(', ')}${who.length > 4 ? ' or another warehouse manager' : ''} to check the goods in.` : 'Ask an admin to give your role edit access to Warehouse under Users, roles and settings.'}</p>
    </Sheet>
  )
}

/**
 * The warehouse counts a supplier's goods in: when, into which warehouse, and anything short or damaged.
 * Only then do the goods go into stock. Waits for the server, so a refusal shows here and not later.
 */
export const ConfirmPurchaseSheet: SheetComponent<{ purchaseId: string }> = ({ purchaseId }) => {
  const { db, act, saveNow } = useBooks()
  const { can, me } = useReceiveAccess()
  const toast = useToast()
  const x = byId(db.purchases, purchaseId)
  const [v, set, bind, nbind] = useForm({ date: todayISO(), siteId: x?.siteId || siteStock(db).mainId, short: '', note: '' })
  if (!x) return <Gone />
  if (!can) return <NotAllowed title={`Receive bill ${x.billNo}`} crumb="Warehouse" />
  const p = byId(db.products, x.productId)
  const sup = byId(db.suppliers, x.supplierId)
  const unit = p?.unit || ''
  if (!x.pending) return (
    <Sheet title={`Bill ${x.billNo}`} crumb="Warehouse"><p className="note">Already received{x.recv ? ` on ${fdate(x.recv.date)} by ${x.recv.by}` : ''}.</p></Sheet>
  )
  const short = num(v.short)
  const into = Math.max(x.qty - short, 0)
  return (
    <FormSheet title={`Confirm: goods received`} crumb={`Warehouse · bill ${x.billNo}`} submit="Confirm received" busyLabel="Saving to the books…"
      note={<>
        <p className="tight"><b>{fmt(x.qty)} {unit} {p?.name || 'goods'}</b> from <b>{sup?.name || 'the supplier'}</b>, billed {fdate(x.date)}{x.by ? ` · entered by ${x.by}` : ''}{x.expected ? ` · due ${fdate(x.expected)}` : ''}.</p>
        <small className="t-muted">Count the goods before you confirm. {fmt(into)} {unit} will go into stock{short ? `; ${fmt(short)} short or damaged stay out and are noted on the bill` : ''}. This cannot be undone here.</small>
      </>}
      onSubmit={async () => {
        if (!v.date) return 'Pick the date the goods came in.'
        if (v.date > todayISO()) return 'The date cannot be in the future.'
        if (v.date < x.date) return `The goods cannot come in before the bill date, ${fdate(x.date)}.`
        if (short < 0) return 'Short or damaged cannot be negative.'
        if (short >= x.qty) return `Short or damaged must be less than ${fmt(x.qty)} ${unit}. If nothing usable came, cancel the bill instead.`
        if (short && !v.note.trim()) return 'Say what was short or damaged in the note.'
        const why = act('confirmPurchase', { purchaseId: x.id, date: v.date, siteId: v.siteId, short: short || undefined, note: v.note, by: me })
        if (why) return why
        const saved = await saveNow()
        if (saved) return saved
        toast(`${fmt(into)} ${unit} of ${p?.name || 'goods'} in stock`)
      }}>
      <Field label="Received on" hint={`Not before ${fdate(x.date)}`}><input type="date" min={x.date} max={todayISO()} {...bind('date')} /></Field>
      <SitePicker db={db} bind={bind('siteId')} />
      <Field label={`Short or damaged${unit ? ` (${unit})` : ''}`} hint="Not put into stock"><input {...nbind('short')} placeholder="0" /></Field>
      <label className="field wide">
        <span className="field-label">Note {short ? <small className="t-warn">needed</small> : <small className="t-muted">optional</small>}</span>
        <textarea className="in" rows={3} maxLength={500} value={v.note} onChange={(e) => set('note', e.target.value)} placeholder="e.g. truck no., cartons counted, seal numbers, what was damaged" />
      </label>
    </FormSheet>
  )
}

function Gone() {
  const { close } = useSheetItem()
  return <Sheet title="Not found" footer={<Button variant="secondary" onClick={close}>Close</Button>}><p className="t-muted">This bill was removed or someone else changed it. Close and look again.</p></Sheet>
}

/** "Receive from factory": pick which open factory order the goods are for, then count them in. */
export const PickFactoryOrderSheet: SheetComponent<object> = () => {
  const { db } = useBooks()
  const { can } = useReceiveAccess()
  const sheets = useSheets()
  const { close } = useSheetItem()
  if (!can) return <NotAllowed title="Receive from factory" crumb="Warehouse" />
  const open = db.factoryOrders.map((o) => ({ o, c: foCalc(db, o) })).filter((r) => r.c.pending > 0)
    .sort((a, b) => ((a.o.expected || '9') < (b.o.expected || '9') ? -1 : 1))
  const today = todayISO()
  return (
    <Sheet title="Receive from factory" crumb="Warehouse" wide footer={<Button variant="secondary" onClick={close}>Close</Button>}>
      <p className="note">Pick the order the goods came for. You confirm the quantity, the warehouse and any damage on the next screen.</p>
      <DataTable rows={open} rowKey={(r) => r.o.id} pageSize={8} empty="No factory order is waiting for goods. Place one under Factory orders."
        onRow={(r) => { close(); sheets.open(ReceiveShipmentSheet, { orderId: r.o.id }) }}
        columns={[
          { label: 'Order', primary: true, render: (r) => <span className="two-line"><b>{r.o.id} · {r.c.product?.name || 'Item'}</b><small className="t-muted">{r.c.factory?.name || 'Factory'}</small></span> },
          { label: 'Still due', align: 'right', render: (r) => <b>{fmt(r.c.pending)} {r.c.unit}</b> },
          { label: 'Expected', align: 'right', render: (r) => (r.o.expected ? <span className={r.o.expected < today ? 't-warn strong nowrap' : 'nowrap'}>{fdate(r.o.expected)}{r.o.expected < today ? ' · late' : ''}</span> : '—') },
          { label: '', align: 'right', render: () => <Pill tone="info">Receive</Pill> },
        ]} />
    </Sheet>
  )
}
