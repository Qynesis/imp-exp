import { useState } from 'react'
import { byId, fdate, num, PLACE_KINDS, placeRows, postingOf, tk, todayISO, transferRows, type PlaceKind } from '@shared/domain'
import { PhoneLink } from '@/components/PhoneLink'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, DataTable, Field, FormSheet, Pill, Sheet, useConfirm, useForm, useSheetItem, useSheets, useToast, type SheetComponent } from '@/ui'

/** Add a workplace, or change one. */
export const PlaceSheet: SheetComponent<{ placeId?: string }> = ({ placeId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const cur = byId(db.workplaces || [], placeId)
  const [v, set, bind] = useForm({
    name: cur?.name || '', kind: (cur?.kind || 'office') as PlaceKind, region: cur?.region || '', area: cur?.area || '', address: cur?.address || '',
    headId: cur?.headId || '', headName: cur?.headName || '', phone: cur?.phone || '', hours: cur?.hours || '', note: cur?.note || '', siteId: cur?.siteId || '',
    lat: cur?.lat != null ? String(cur.lat) : '', lng: cur?.lng != null ? String(cur.lng) : '', radius: cur?.radius ? String(cur.radius) : '200', startTime: cur?.startTime || '', graceMin: cur?.graceMin != null ? String(cur.graceMin) : '10',
  })
  const [locating, setLocating] = useState(false)
  const here = () => {
    if (!navigator.geolocation) return toast('This device cannot share its location')
    setLocating(true)
    navigator.geolocation.getCurrentPosition((p) => {
      set('lat', p.coords.latitude.toFixed(6))
      set('lng', p.coords.longitude.toFixed(6))
      setLocating(false)
      toast('Location set from this device')
    }, () => { setLocating(false); toast('Location was not shared') }, { enableHighAccuracy: true, timeout: 10000 })
  }
  const people = db.employees.filter((e) => e.status !== 'left')
  return (
    <FormSheet title={cur ? `Edit ${cur.name}` : 'Add workplace'} crumb="Workplaces" submit={cur ? 'Save changes' : 'Save workplace'} onSubmit={() => {
      const why = act('savePlace', {
        id: cur?.id, name: v.name, kind: v.kind, region: v.region.trim(), area: v.area.trim(), address: v.address.trim(), headId: v.headId || undefined,
        headName: v.headId ? undefined : v.headName.trim() || undefined, phone: v.phone.trim(), hours: v.hours.trim(), note: v.note.trim(), siteId: v.siteId || undefined, archived: cur?.archived,
        lat: v.lat.trim() ? num(v.lat) : undefined, lng: v.lng.trim() ? num(v.lng) : undefined, radius: num(v.radius) || 200,
        startTime: v.startTime || undefined, graceMin: v.graceMin.trim() ? num(v.graceMin) : undefined,
      })
      if (why) return why
      toast(cur ? 'Workplace saved' : 'Workplace added')
    }}>
      <Field label="Name"><input {...bind('name')} placeholder="e.g. Head office, Dhaka North region, Tongi godown" /></Field>
      <Field label="Kind">
        <select {...bind('kind')}>{(Object.keys(PLACE_KINDS) as PlaceKind[]).map((k) => <option key={k} value={k}>{PLACE_KINDS[k]}</option>)}</select>
      </Field>
      <Field label="Region / division"><input {...bind('region')} placeholder="e.g. Dhaka, Chattogram, Rajshahi" /></Field>
      <Field label={v.kind === 'region' ? 'Areas covered' : 'Area'}><input {...bind('area')} placeholder={v.kind === 'region' ? 'e.g. Uttara, Mirpur, Gazipur' : 'e.g. Motijheel'} /></Field>
      <Field label="Address" wide><input {...bind('address')} placeholder="House, road, area, city" /></Field>
      <Field label="In charge">
        <select {...bind('headId')}>
          <option value="">Not on our staff list</option>
          {people.map((e) => <option key={e.id} value={e.id}>{e.name}{e.role ? ` · ${e.role}` : ''}</option>)}
        </select>
      </Field>
      {!v.headId && <Field label="In charge (name)"><input {...bind('headName')} placeholder="Name, if not on the list" /></Field>}
      <Field label="Phone"><input {...bind('phone')} inputMode="tel" placeholder="Office or in-charge phone" /></Field>
      <Field label="Working hours"><input {...bind('hours')} placeholder="e.g. 9am–6pm, Friday off" /></Field>
      {(db.warehouses || []).length > 0 && (
        <Field label="Is this one of our warehouses?">
          <select {...bind('siteId')}>
            <option value="">No</option>
            {(db.warehouses || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Note" wide><input {...bind('note')} placeholder="Anything people moving here should know" /></Field>
      <p className="form-sub">Check-in</p>
      <Field label="Work starts at" hint="Check-ins after this, plus the grace minutes, show as late."><input type="time" {...bind('startTime')} /></Field>
      <Field label="Grace (minutes)"><input {...bind('graceMin')} inputMode="numeric" placeholder="10" /></Field>
      <Field label="Latitude"><input {...bind('lat')} inputMode="decimal" placeholder="23.7330" /></Field>
      <Field label="Longitude"><input {...bind('lng')} inputMode="decimal" placeholder="90.4172" /></Field>
      <Field label="Counts as here within (metres)"><input {...bind('radius')} inputMode="numeric" placeholder="200" /></Field>
      <div className="field">
        <span className="field-label">&nbsp;</span>
        <Button variant="secondary" icon="pin" disabled={locating} onClick={here}>{locating ? 'Finding…' : 'Use this device’s location'}</Button>
      </div>
    </FormSheet>
  )
}

/** Move someone to another workplace from a date, with the office order. */
export const StaffTransferSheet: SheetComponent<{ employeeId?: string; to?: string }> = ({ employeeId, to }) => {
  const { db, act, session } = useBooks()
  const toast = useToast()
  const me = byId(db.users, session.userId)
  const places = (db.workplaces || []).filter((w) => !w.archived)
  const people = db.employees.filter((e) => e.status !== 'left')
  const [v, , bind, nbind] = useForm({ employeeId: employeeId || people[0]?.id || '', to: to || '', date: todayISO(), orderNo: '', reason: '', newRole: '', allowance: '', note: '' })
  const e = byId(db.employees, v.employeeId)
  const now = e ? postingOf(db, e, v.date) : null
  const dest = byId(places, v.to)
  return (
    <FormSheet title="Transfer to another place" crumb="Employees and workers" submit="Order transfer"
      note={e ? `${e.name} works at ${now?.place?.name || 'no place set yet'}${now?.place ? ` since ${fdate(now.since)}` : ''}.${now?.next ? ` A transfer to ${byId(places, now.next.to)?.name} on ${fdate(now.next.date)} is already ordered.` : ''}` : undefined}
      onSubmit={() => {
        if (!places.length) return 'Add workplaces first.'
        if (!v.to) return 'Pick where they go.'
        const why = act('transferStaff', { employeeId: v.employeeId, to: v.to, date: v.date, orderNo: v.orderNo, reason: v.reason, newRole: v.newRole, allowance: num(v.allowance), note: v.note, by: me?.name || '', at: new Date().toISOString() })
        if (why) return why
        toast(`${e?.name} transferred to ${dest?.name}${v.date > todayISO() ? ` from ${fdate(v.date)}` : ''}`)
      }}>
      <Field label="Person">
        <select {...bind('employeeId')}>{people.map((x) => <option key={x.id} value={x.id}>{x.name}{x.role ? ` · ${x.role}` : ''}</option>)}</select>
      </Field>
      <Field label="Move to" hint={dest ? [PLACE_KINDS[dest.kind], dest.region, dest.address].filter(Boolean).join(' · ') : undefined}>
        <select {...bind('to')}>
          <option value="">Pick a workplace</option>
          {places.filter((w) => w.id !== now?.place?.id).map((w) => <option key={w.id} value={w.id}>{w.name}{w.region ? ` · ${w.region}` : ''}</option>)}
        </select>
      </Field>
      <Field label="Starts there on"><input type="date" {...bind('date')} /></Field>
      <Field label="Office order no."><input {...bind('orderNo')} placeholder="e.g. HR/2026/114" /></Field>
      <Field label="Reason" wide><input {...bind('reason')} placeholder="e.g. New depot needs a keeper, promotion, own request" /></Field>
      <Field label="New job title (if it changes)"><input {...bind('newRole')} placeholder={e?.role || 'Same as now'} /></Field>
      <Field label="Transfer allowance (Tk)"><input {...nbind('allowance')} placeholder="0" /></Field>
      <Field label="Note for them" wide><input {...bind('note')} placeholder="e.g. Report to Nurul Amin at 9am; quarters provided" /></Field>
    </FormSheet>
  )
}

/** One workplace: where it is, who runs it, who works there, and who is moving in or out. */
export const PlaceDetailSheet: SheetComponent<{ placeId: string }> = ({ placeId }) => {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const confirm = useConfirm()
  const toast = useToast()
  const { close } = useSheetItem()
  const row = placeRows(db).find((r) => r.place.id === placeId)
  if (!row) return null
  const w = row.place
  const canEdit = !accessGuard.readonly
  const moves = transferRows(db).filter((t) => t.to === w.id || t.from === w.id).slice(0, 15)
  const headPhone = byId(db.employees, w.headId)?.phone || w.phone
  return (
    <Sheet title={w.name} crumb={PLACE_KINDS[w.kind]} wide
      footer={canEdit ? (
        <>
          <Button variant="secondary" icon="trash" onClick={async () => {
            if (!(await confirm({ title: `Remove ${w.name}?`, message: 'Its transfer history is kept.', confirmLabel: 'Remove', destructive: true }))) return
            const why = act('removePlace', w.id)
            if (why) toast(why)
            else { toast('Workplace removed'); close() }
          }}>Remove</Button>
          <Button variant="secondary" icon="route" onClick={() => sheets.open(StaffTransferSheet, { to: w.id })}>Transfer someone here</Button>
          <Button icon="edit" onClick={() => sheets.open(PlaceSheet, { placeId: w.id })}>Edit</Button>
        </>
      ) : undefined}>
      <div className="kv-list boxed">
        <div className="kv"><span>Kind</span><b>{PLACE_KINDS[w.kind]}{w.region ? ` · ${w.region}` : ''}</b></div>
        {w.area && <div className="kv"><span>{w.kind === 'region' ? 'Areas covered' : 'Area'}</span><b>{w.area}</b></div>}
        <div className="kv"><span>Address</span><b>{w.address || '—'}</b></div>
        <div className="kv"><span>In charge</span><b>{row.head || '—'}{headPhone && <> · <PhoneLink phone={headPhone} label={row.head || w.name} /></>}</b></div>
        {w.hours && <div className="kv"><span>Working hours</span><b>{w.hours}</b></div>}
        {w.siteId && <div className="kv"><span>Warehouse</span><b>{byId(db.warehouses || [], w.siteId)?.name || '—'}</b></div>}
        {w.note && <div className="kv"><span>Note</span><b>{w.note}</b></div>}
      </div>
      <div className="mini-stats">
        <div><span>Working here</span><b>{row.people.length}</b></div>
        <div><span>Staff / workers</span><b>{row.people.filter((e) => e.kind !== 'worker').length} / {row.people.filter((e) => e.kind === 'worker').length}</b></div>
        <div><span>Coming in</span><b className={row.comingIn.length ? 't-good' : undefined}>{row.comingIn.length}</b></div>
        <div><span>Moving out</span><b className={row.goingOut.length ? 't-warn' : undefined}>{row.goingOut.length}</b></div>
      </div>
      <h3 className="sheet-h">Who works here</h3>
      <DataTable rows={row.people} rowKey={(e) => e.id} empty="Nobody works here yet."
        columns={[
          { label: 'Name', primary: true, render: (e) => <span className="two-line"><b>{e.name}</b><small className="t-muted">{[e.role, e.department].filter(Boolean).join(' · ')}</small></span> },
          { label: 'Here since', render: (e) => fdate(postingOf(db, e).since) },
          { label: 'Phone', render: (e) => (e.phone ? <PhoneLink phone={e.phone} label={e.name} /> : '—') },
          { label: '', align: 'right', render: (e) => { const nx = postingOf(db, e).next; return nx ? <Pill tone="warn">To {byId(db.workplaces || [], nx.to)?.name} {fdate(nx.date)}</Pill> : null } },
        ]} />
      <h3 className="sheet-h">Transfers in and out</h3>
      <DataTable rows={moves} rowKey={(t) => t.id} empty="No transfers yet."
        columns={[
          { label: 'Person', primary: true, render: (t) => <span className="two-line"><b>{t.employee?.name}</b><small className="t-muted">{t.id}{t.orderNo ? ` · ${t.orderNo}` : ''}</small></span> },
          { label: 'Move', render: (t) => (t.to === w.id ? <Pill tone="good">In from {t.fromPlace?.name || 'first posting'}</Pill> : <Pill tone="warn">Out to {t.toPlace?.name}</Pill>) },
          { label: 'From', render: (t) => <span className={t.upcoming ? 't-warn' : undefined}>{fdate(t.date)}{t.cancelled ? ' · cancelled' : t.upcoming ? ' · coming' : ''}</span> },
          { label: 'Allowance', align: 'right', render: (t) => (t.allowance ? tk(t.allowance) : '') },
        ]} />
    </Sheet>
  )
}
PlaceDetailSheet.readOnlySafe = true
