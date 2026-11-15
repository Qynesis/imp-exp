import { useRef, useState } from 'react'
import { todayISO } from '../lib/format.js'
import { BUSINESS_TYPES, ENTITIES, FIELD_TYPES, PAGES } from '../lib/presets.js'
import { roleName } from '../lib/selectors.js'
import { useStore } from '../lib/store.jsx'
import { Button, Card, DataTable, Empty, Field, Icon, cls, useConfirm, useForm, useSheets, useToast } from '../ui.jsx'
import { PageHead } from './common.jsx'

const summary = (role) => {
  if (role.id === 'owner') return 'Everything, including users, roles and settings'
  const of = (lvl) => PAGES.filter(([p]) => role.perms[p] === lvl).map(([, l]) => l)
  const edit = of('edit')
  const view = of('view')
  return [edit.length && `Edit: ${edit.join(', ')}`, view.length && `View: ${view.join(', ')}`].filter(Boolean).join(' · ') || 'No access'
}

export default function Settings() {
  const { db, act, session, users } = useStore()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const [v, , bind] = useForm(db.company)
  const [err, setErr] = useState('')
  const file = useRef(null)

  const backup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `books-backup-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const restore = async (e) => {
    const f = e.target.files[0]
    e.target.value = ''
    if (!f) return
    try {
      const next = JSON.parse(await f.text())
      if (next?.v !== 1 || !Array.isArray(next.products)) throw new Error('bad file')
      const ok = await confirm({ title: 'Restore this backup?', message: 'Everything now in the books will be replaced by the backup file. Users and roles stay as they are.', confirmLabel: 'Replace', destructive: true })
      if (!ok) return
      act('replaceAll', next)
      toast('Backup restored')
    } catch {
      setErr('That file is not a backup from this software.')
    }
  }
  const removeUser = async (u) => {
    const ok = await confirm({ title: `Remove ${u.name}?`, message: 'They will be signed out and can no longer use the software.', confirmLabel: 'Remove', destructive: true })
    if (!ok) return
    try {
      await users('DELETE', null, '?id=' + encodeURIComponent(u.id))
      toast('User removed')
    } catch (ex) {
      toast(ex.message)
    }
  }
  const removeRole = async (r) => {
    if (db.users.some((u) => u.roleId === r.id)) return toast('Move its users to another role first')
    const ok = await confirm({ title: `Delete the ${r.name} role?`, confirmLabel: 'Delete', destructive: true })
    if (ok) act('removeRole', r.id)
  }
  const toggleType = (t) => act('setBusinessTypes', db.businessTypes.includes(t) ? db.businessTypes.filter((x) => x !== t) : [...db.businessTypes, t])

  return (
    <>
      <PageHead title="Users, roles and settings" sub="Who can use the software, what each role may do, and how the forms fit your kind of trade." />
      <div className="grid-side">
        <div className="stack">
          <Card title="Users" action={<Button size="sm" onClick={() => sheets.open('user')}>Add user</Button>}>
            <DataTable
              rows={db.users}
              onRow={(r) => sheets.open('user', { userId: r.id })}
              columns={[
                { label: 'User', primary: true, render: (r) => `${r.name}${r.id === session.userId ? ' (you)' : ''}` },
                { label: 'Email', render: (r) => r.email },
                { label: 'Role', render: (r) => roleName(db, r.roleId) },
                { label: '', align: 'right', render: (r) => (r.id === session.userId ? '' : <button type="button" className="icon-btn" aria-label={`Remove ${r.name}`} onClick={(e) => { e.stopPropagation(); removeUser(r) }}><Icon name="trash" size={18} /></button>) },
              ]}
            />
          </Card>

          <Card title="Roles and permissions" sub="Pick a role to change which screens it can view or edit." action={<Button size="sm" variant="secondary" onClick={() => sheets.open('role')}>Add role</Button>}>
            <DataTable
              rows={db.roles}
              onRow={(r) => (r.system ? toast('The Owner role always has full access') : sheets.open('role', { roleId: r.id }))}
              columns={[
                { label: 'Role', primary: true, render: (r) => r.name },
                { label: 'Users', align: 'right', render: (r) => db.users.filter((u) => u.roleId === r.id).length },
                { label: 'Access', render: (r) => <span className="t-muted">{summary(r)}</span> },
                { label: '', align: 'right', render: (r) => (r.system ? '' : <button type="button" className="icon-btn" aria-label={`Delete ${r.name} role`} onClick={(e) => { e.stopPropagation(); removeRole(r) }}><Icon name="trash" size={18} /></button>) },
              ]}
            />
          </Card>

          <Card title="Type of trade and custom fields" sub="Turning on a type adds its extra fields and its customs documents. Add your own fields for anything else.">
            <div className="card-body pt0">
              <div className="chips">
                {Object.entries(BUSINESS_TYPES).map(([k, t]) => (
                  <button key={k} type="button" className={cls('chip', db.businessTypes.includes(k) && 'on')} aria-pressed={db.businessTypes.includes(k)} onClick={() => toggleType(k)}>{t.label}</button>
                ))}
              </div>
            </div>
            {Object.entries(ENTITIES).map(([entity, label]) => {
              const defs = db.fieldDefs.filter((f) => f.entity === entity)
              if (!defs.length) return null
              return (
                <div key={entity} className="field-group">
                  <h3 className="sub-h">{label}</h3>
                  <div className="tags">
                    {defs.map((f) => (
                      <span key={f.id} className="tag">
                        {f.label} <small>{FIELD_TYPES[f.type]}</small>
                        <button type="button" aria-label={`Remove field ${f.label}`} onClick={() => act('removeField', f.id)}><Icon name="close" size={14} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
            {!db.fieldDefs.length && <Empty>No extra fields yet.</Empty>}
            <div className="card-body">
              <Button variant="dashed" size="sm" onClick={() => sheets.open('field')}>Add custom field</Button>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card title="Company details">
            <form className="card-body pt0" noValidate onSubmit={(e) => {
              e.preventDefault()
              act('saveCompany', v)
              toast('Company details saved')
            }}>
              <div className="form-grid one">
                <Field label="Company name"><input {...bind('name')} placeholder="Your company" /></Field>
                <Field label="Line under the name"><input {...bind('tagline')} placeholder="Import and trading" /></Field>
                <Field label="Phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXX-XXXXXX" /></Field>
                <Field label="Address"><input {...bind('address')} placeholder="Office address" /></Field>
                <Field label="Invoice number starts with"><input {...bind('invoicePrefix')} placeholder="INV-" /></Field>
                <Field label="Note at the bottom of invoices"><input {...bind('invoiceNote')} placeholder="e.g. Goods once sold are not returned" /></Field>
              </div>
              <Button type="submit" block className="mt">Save details</Button>
            </form>
          </Card>
          <Card title="Backup" sub="Your books are saved on the server. A downloaded copy is still worth keeping.">
            <div className="card-body pt0">
              {err && <div className="err" role="alert">{err}</div>}
              <div className="btn-row">
                <Button variant="secondary" onClick={backup}>Download backup</Button>
                <Button variant="secondary" onClick={() => file.current.click()}>Restore from backup</Button>
                <input ref={file} type="file" accept="application/json,.json" hidden onChange={restore} />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
