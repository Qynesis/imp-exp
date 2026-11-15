import { useState } from 'react'
import { num, todayISO } from '../lib/format.js'
import { ENTITIES, FIELD_TYPES, PAGES } from '../lib/presets.js'
import { DUTIES, byId, customsCalc } from '../lib/selectors.js'
import { useStore } from '../lib/store.jsx'
import { Button, Field, FormSheet, Segmented, Sheet, useForm, useSheetItem, useToast } from '../ui.jsx'

const LEVELS = [{ value: 'none', label: 'None' }, { value: 'view', label: 'View' }, { value: 'edit', label: 'Edit' }]

export function RoleSheet({ roleId }) {
  const { db, act } = useStore()
  const toast = useToast()
  const cur = roleId && byId(db.roles, roleId)
  const [name, setName] = useState(cur?.name || '')
  const [perms, setPerms] = useState(cur?.perms || {})
  return (
    <FormSheet title={cur ? `Edit role · ${cur.name}` : 'Add role'} crumb="Users, roles and settings" submit="Save role" wide
      note="View lets the role open a screen and read it. Edit also lets them add and change things there."
      onSubmit={() => {
        if (!name.trim()) return 'Give the role a name.'
        if (!Object.values(perms).some((l) => l && l !== 'none')) return 'Give the role access to at least one screen.'
        act('saveRole', { id: cur?.id, name: name.trim(), perms })
        toast('Role saved')
      }}>
      <Field label="Role name" wide><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Customs officer" /></Field>
      <div className="field wide">
        <span className="field-label">Access to each screen</span>
        <div className="perm-list">
          {PAGES.map(([page, label]) => (
            <div className="perm" key={page}>
              <span>{label}</span>
              <Segmented label={label} value={perms[page] || 'none'} onChange={(l) => setPerms((cur) => ({ ...cur, [page]: l }))} options={LEVELS} />
            </div>
          ))}
        </div>
      </div>
    </FormSheet>
  )
}

export function FieldSheet() {
  const { act } = useStore()
  const toast = useToast()
  const [v, , bind] = useForm({ entity: 'product', label: '', type: 'text', options: '' })
  return (
    <FormSheet title="Add custom field" crumb="Users, roles and settings" submit="Add field"
      note="The field appears in the add and edit forms for that kind of record straight away."
      onSubmit={() => {
        if (!v.label.trim()) return 'Give the field a name.'
        const options = v.options.split(',').map((o) => o.trim()).filter(Boolean)
        if (v.type === 'select' && options.length < 2) return 'List at least two choices, separated by commas.'
        act('addField', { entity: v.entity, label: v.label.trim(), type: v.type, options: v.type === 'select' ? options : [] })
        toast('Field added')
      }}>
      <Field label="Show on">
        <select {...bind('entity')}>{Object.entries(ENTITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      <Field label="Kind of field">
        <select {...bind('type')}>{Object.entries(FIELD_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      <Field label="Field name" wide><input {...bind('label')} placeholder="e.g. Voltage, Shelf life, Colour" /></Field>
      {v.type === 'select' && <Field label="Choices, separated by commas" wide><input {...bind('options')} placeholder="e.g. Red, Blue, Green" /></Field>}
    </FormSheet>
  )
}

export function UserSheet({ userId }) {
  const { db, users } = useStore()
  const toast = useToast()
  const { close } = useSheetItem()
  const cur = userId && byId(db.users, userId)
  const [v, , bind] = useForm({ name: '', email: '', password: '', roleId: cur?.roleId || db.roles.find((r) => !r.system)?.id || 'owner', employeeId: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (cur) await users('PATCH', { id: cur.id, roleId: v.roleId, password: v.password || undefined })
      else await users('POST', v)
      toast(cur ? 'User updated' : 'User added')
      close()
    } catch (ex) {
      setErr(ex.message)
      setBusy(false)
    }
  }
  return (
    <Sheet title={cur ? `Edit user · ${cur.name}` : 'Add user'} crumb="Users, roles and settings" onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button type="submit" disabled={busy}>Save user</Button>
        </>
      }>
      {err && <div className="err" role="alert">{err}</div>}
      <div className="form-grid">
        {!cur && (
          <>
            <Field label="Name"><input {...bind('name')} placeholder="Full name" /></Field>
            <Field label="Email (used to sign in)"><input {...bind('email')} type="email" placeholder="name@company.com" /></Field>
          </>
        )}
        <Field label="Role">
          <select {...bind('roleId')}>{db.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </Field>
        <Field label={cur ? 'New password (leave empty to keep)' : 'Password'} hint="At least 8 characters. Give it to the user yourself.">
          <input {...bind('password')} type="password" autoComplete="new-password" />
        </Field>
        {!cur && (
          <Field label="Linked employee">
            <select {...bind('employeeId')}>
              <option value="">None</option>
              {db.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
        )}
      </div>
    </Sheet>
  )
}

export function CustomsSheet({ importId }) {
  const { db, act } = useStore()
  const toast = useToast()
  const imp = byId(db.imports, importId)
  const c = customsCalc(db, imp)
  const cu = c.cu
  const exp = imp.direction === 'export'
  const [v, , bind, nbind] = useForm({
    hsCode: cu.hsCode || '', port: cu.port || 'Chattogram port', cnf: cu.cnf || '', boeNo: cu.boeNo || '', boeDate: cu.boeDate || '', container: cu.container || '',
    av: cu.av ? String(cu.av) : '', freeUntil: cu.freeUntil || '', demurragePerDay: cu.demurragePerDay ? String(cu.demurragePerDay) : '',
    ...Object.fromEntries(DUTIES.map(([k]) => [k, cu.rates?.[k] ? String(cu.rates[k]) : ''])),
  })
  return (
    <FormSheet title={`Customs details · ${imp.id}`} crumb="Customs clearance" submit="Save details" wide
      note="Duty rates depend on the HS code. Enter the rates your C&F agent or the customs tariff gives you; the figures here are an estimate until customs assesses the goods."
      onSubmit={() => {
        act('saveCustoms', { importId, data: {
          hsCode: v.hsCode.trim(), port: v.port.trim(), cnf: v.cnf.trim(), boeNo: v.boeNo.trim(), boeDate: v.boeDate, container: v.container.trim(),
          av: num(v.av), freeUntil: v.freeUntil, demurragePerDay: num(v.demurragePerDay), rates: Object.fromEntries(DUTIES.map(([k]) => [k, num(v[k])])),
        } })
        toast('Customs details saved')
      }}>
      <Field label="HS code"><input {...bind('hsCode')} placeholder="e.g. 8479.89.00" /></Field>
      <Field label="Port or customs station"><input {...bind('port')} placeholder="e.g. Chattogram port" /></Field>
      <Field label="C&F agent"><input {...bind('cnf')} placeholder="Agent name" /></Field>
      <Field label="Container or AWB number"><input {...bind('container')} placeholder="e.g. MSKU 482915-3" /></Field>
      <Field label={exp ? 'Bill of Export number' : 'Bill of Entry number'}><input {...bind('boeNo')} placeholder="e.g. C-184532" /></Field>
      <Field label={exp ? 'Bill of Export date' : 'Bill of Entry date'}><input type="date" {...bind('boeDate')} max={todayISO()} /></Field>
      <Field label="Assessable value (Tk)" hint="Leave empty to use invoice value plus freight and insurance." wide><input {...nbind('av')} placeholder="Worked out automatically" /></Field>
      {DUTIES.map(([k, label]) => <Field key={k} label={`${label} %`}><input {...nbind(k)} placeholder="0" /></Field>)}
      <Field label="Free time at port ends on"><input type="date" {...bind('freeUntil')} /></Field>
      <Field label="Demurrage per day after that (Tk)"><input {...nbind('demurragePerDay')} placeholder="0" /></Field>
    </FormSheet>
  )
}
