import { byId, isAdmin } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

/** Add a warehouse or godown, or change one. */
export const WarehouseSiteSheet: SheetComponent<{ siteId?: string }> = ({ siteId }) => {
  const { db, act, session } = useBooks()
  const toast = useToast()
  const cur = byId(db.warehouses || [], siteId)
  const admin = isAdmin(db, session.userId)
  const first = !(db.warehouses || []).length
  const [v, set, bind] = useForm({
    code: cur?.code || '', name: cur?.name || '', address: cur?.address || '', area: cur?.area || '', city: cur?.city || '', manager: cur?.manager || '', phone: cur?.phone || '',
    capacity: cur?.capacity || '', note: cur?.note || '', main: cur ? !!cur.main : first,
  })
  return (
    <FormSheet title={cur ? `Edit ${cur.name}` : 'Add warehouse'} crumb="Warehouse" submit={cur ? 'Save changes' : 'Save warehouse'} onSubmit={() => {
      const why = act('saveWarehouse', {
        id: cur?.id, code: admin ? v.code.trim().toUpperCase() : cur?.code, name: v.name.trim(), address: v.address.trim(), area: v.area.trim(), city: v.city.trim(), manager: v.manager.trim(), phone: v.phone.trim(),
        capacity: v.capacity.trim(), note: v.note.trim(), main: v.main || undefined,
      })
      if (why) return why
      toast(cur ? 'Warehouse saved' : 'Warehouse added')
    }}>
      <Field label="Warehouse code" hint={admin ? '2–12 letters, digits or dashes. Unique; printed on challans and labels.' : 'Only an admin can set or change the code.'}>
        <input {...bind('code')} disabled={!admin} maxLength={12} placeholder="e.g. TNG-01" autoCapitalize="characters" style={{ textTransform: 'uppercase' }} />
      </Field>
      <Field label="Name"><input {...bind('name')} placeholder="e.g. Main godown, Chattogram depot" /></Field>
      <Field label="Holds about"><input {...bind('capacity')} placeholder="e.g. 8,000 cartons or 12,000 sq ft" /></Field>
      <Field label="Address" wide><input {...bind('address')} placeholder="House, road, holding" /></Field>
      <Field label="Area / thana"><input {...bind('area')} placeholder="e.g. Tongi" /></Field>
      <Field label="City / district"><input {...bind('city')} placeholder="e.g. Gazipur" /></Field>
      <Field label="In charge"><input {...bind('manager')} placeholder="Store keeper or manager" /></Field>
      <Field label="Phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXX-XXXXXX" /></Field>
      <Field label="Note" wide><input {...bind('note')} placeholder="Opening hours, truck access, rent…" /></Field>
      <label className="check field wide">
        <input type="checkbox" checked={v.main} disabled={!!cur?.main} onChange={(e) => set('main', e.target.checked)} />
        <span>Main warehouse <small className="t-muted">— shown first; goods are received here unless you say otherwise</small></span>
      </label>
    </FormSheet>
  )
}
