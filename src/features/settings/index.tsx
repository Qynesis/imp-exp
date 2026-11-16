import { useRef, useState, type ChangeEvent } from 'react'
import { BUSINESS_TYPES, CUSTOM_ENTITIES, FIELD_TYPES, isDb, PAGES, roleLevel, roleName, todayISO, type BusinessTypeId, type CustomEntity, type Role, type User } from '@shared/domain'
import { PageHead } from '@/components/PageHead'
import { BACKEND } from '@/core/api/client'
import { useBooks } from '@/core/store/context'
import { Button, Card, cls, DataTable, Empty, Field, Icon, Logo, useConfirm, useForm, useSheets, useToast } from '@/ui'
import { downloadJson, shrinkLogo } from './logo'
import { CustomFieldSheet } from './sheets/CustomFieldSheet'
import { RoleSheet } from './sheets/RoleSheet'
import { UserSheet } from './sheets/UserSheet'

const accessSummary = (role: Role) => {
  if (role.system) return 'Everything, including users, roles and settings'
  const of = (lvl: 'edit' | 'view') => PAGES.filter(([p]) => roleLevel(role, p) === lvl).map(([, l]) => l)
  const edit = of('edit')
  const view = of('view')
  return [edit.length && `Edit: ${edit.join(', ')}`, view.length && `View: ${view.join(', ')}`].filter(Boolean).join(' · ') || 'No access'
}

export default function SettingsPage() {
  return (
    <>
      <PageHead title="Users, roles and settings" sub="Who can use the software, what each role may do, and how the forms fit your kind of trade." />
      <div className="grid-side">
        <div className="stack">
          <UsersCard />
          <RolesCard />
          <TradeCard />
        </div>
        <div className="stack">
          <LogoCard />
          <CompanyCard />
          <BackupCard />
        </div>
      </div>
    </>
  )
}

function UsersCard() {
  const { db, session, users } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const remove = async (u: User) => {
    const ok = await confirm({ title: `Remove ${u.name}?`, message: 'They will be signed out and can no longer use the software.', confirmLabel: 'Remove', destructive: true })
    if (!ok) return
    try {
      await users('DELETE', undefined, '?id=' + encodeURIComponent(u.id))
      toast('User removed')
    } catch (ex) {
      toast((ex as Error).message)
    }
  }
  return (
    <Card title="Users" action={<Button icon="plus" size="sm" onClick={() => sheets.open(UserSheet)}>Add user</Button>}>
      <DataTable
        rows={db.users}
        onRow={(r) => sheets.open(UserSheet, { userId: r.id })}
        columns={[
          { label: 'User', primary: true, render: (r) => `${r.name}${r.id === session.userId ? ' (you)' : ''}` },
          { label: 'Email', render: (r) => r.email },
          { label: 'Role', render: (r) => roleName(db, r.roleId) },
          { label: '', align: 'right', render: (r) => (r.id === session.userId ? '' : (
            <button type="button" className="icon-btn" aria-label={`Remove ${r.name}`} onClick={(e) => { e.stopPropagation(); void remove(r) }}><Icon name="trash" size={18} /></button>
          )) },
        ]}
      />
    </Card>
  )
}

function RolesCard() {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const remove = async (r: Role) => {
    if (db.users.some((u) => u.roleId === r.id)) return toast('Move its users to another role first')
    if (await confirm({ title: `Delete the ${r.name} role?`, confirmLabel: 'Delete', destructive: true })) act('removeRole', r.id)
  }
  return (
    <Card title="Roles and permissions" sub="Pick a role to change which screens it can view or edit." action={<Button icon="plus" size="sm" variant="secondary" onClick={() => sheets.open(RoleSheet)}>Add role</Button>}>
      <DataTable
        rows={db.roles}
        onRow={(r) => (r.system ? toast('The Owner role always has full access') : sheets.open(RoleSheet, { roleId: r.id }))}
        columns={[
          { label: 'Role', primary: true, render: (r) => r.name },
          { label: 'Users', align: 'right', render: (r) => db.users.filter((u) => u.roleId === r.id).length },
          { label: 'Access', render: (r) => <span className="t-muted">{accessSummary(r)}</span> },
          { label: '', align: 'right', render: (r) => (r.system ? '' : (
            <button type="button" className="icon-btn" aria-label={`Delete ${r.name} role`} onClick={(e) => { e.stopPropagation(); void remove(r) }}><Icon name="trash" size={18} /></button>
          )) },
        ]}
      />
    </Card>
  )
}

function TradeCard() {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toggle = (t: BusinessTypeId) => act('setBusinessTypes', db.businessTypes.includes(t) ? db.businessTypes.filter((x) => x !== t) : [...db.businessTypes, t])
  return (
    <Card title="Type of trade and custom fields" sub="Turning on a type adds its extra fields and its customs documents. Add your own fields for anything else.">
      <div className="card-body pt0">
        <div className="chips">
          {(Object.keys(BUSINESS_TYPES) as BusinessTypeId[]).map((k) => (
            <button key={k} type="button" className={cls('chip', db.businessTypes.includes(k) && 'on')} aria-pressed={db.businessTypes.includes(k)} onClick={() => toggle(k)}>{BUSINESS_TYPES[k].label}</button>
          ))}
        </div>
      </div>
      {(Object.keys(CUSTOM_ENTITIES) as CustomEntity[]).map((entity) => {
        const defs = db.fieldDefs.filter((f) => f.entity === entity)
        if (!defs.length) return null
        return (
          <div key={entity} className="field-group">
            <h3 className="sub-h">{CUSTOM_ENTITIES[entity]}</h3>
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
        <Button icon="plus" variant="dashed" size="sm" onClick={() => sheets.open(CustomFieldSheet)}>Add custom field</Button>
      </div>
    </Card>
  )
}

function LogoCard() {
  const { db, act } = useBooks()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      act('saveCompany', { logo: await shrinkLogo(file) })
      toast('Logo saved')
    } catch (ex) {
      toast((ex as Error).message)
    }
  }
  return (
    <Card title="Company logo" sub="Shown in the menu and printed at the top of every invoice.">
      <div className="card-body pt0">
        <div className="logo-pick">
          <div className={cls('logo-preview', !db.company.logo && 'empty')}>
            {db.company.logo ? <Logo height={72} src={db.company.logo} /> : <span className="t-muted">No logo yet</span>}
          </div>
          <div className="btn-row">
            <Button variant="secondary" onClick={() => input.current?.click()}>{db.company.logo ? 'Change logo' : 'Upload logo'}</Button>
            {db.company.logo && <Button variant="ghost" onClick={() => act('saveCompany', { logo: '' })}>Remove</Button>}
            <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e)} />
          </div>
        </div>
      </div>
    </Card>
  )
}

function CompanyCard() {
  const { db, act } = useBooks()
  const toast = useToast()
  const { name, tagline, phone, address, invoicePrefix, invoiceNote } = db.company
  const [v, , bind] = useForm({ name, tagline, phone, address, invoicePrefix, invoiceNote })
  return (
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
  )
}

function BackupCard() {
  const { db, act } = useBooks()
  const toast = useToast()
  const confirm = useConfirm()
  const [err, setErr] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const restore = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const next: unknown = JSON.parse(await file.text())
      if (!isDb(next)) throw new Error('bad file')
      const ok = await confirm({ title: 'Restore this backup?', message: 'Everything now in the books will be replaced by the backup file. Users and roles stay as they are.', confirmLabel: 'Replace', destructive: true })
      if (!ok) return
      act('replaceAll', next)
      toast('Backup restored')
      setErr('')
    } catch {
      setErr('That file is not a backup from this software.')
    }
  }
  return (
    <Card title="Backup" sub={BACKEND === 'local' ? 'Your books are kept in this browser only. Download a backup regularly.' : 'Your books are saved on the server. A downloaded copy is still worth keeping.'}>
      <div className="card-body pt0">
        {err && <div className="err" role="alert">{err}</div>}
        <div className="btn-row">
          <Button icon="download" variant="secondary" onClick={() => downloadJson(db, `books-backup-${todayISO()}.json`)}>Download backup</Button>
          <Button icon="restore" variant="secondary" onClick={() => input.current?.click()}>Restore from backup</Button>
          <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => void restore(e)} />
        </div>
      </div>
    </Card>
  )
}
