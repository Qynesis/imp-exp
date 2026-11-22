import { useState, type FormEvent } from 'react'
import { byId } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Button, Field, Sheet, useForm, useSheetItem, useToast } from '@/ui'

/**
 * Add a sign-in for someone, or change a user's role, password or linked employee.
 * Opened from an employee's profile with `employeeId`, it makes that person's own login.
 */
export function UserSheet({ userId, employeeId }: { userId?: string; employeeId?: string }) {
  const { db, users } = useBooks()
  const toast = useToast()
  const { close } = useSheetItem()
  const cur = byId(db.users, userId)
  const emp = byId(db.employees, employeeId)
  // someone made from an employee gets the role that only shows their own work, when the books have it
  const staffRole = db.roles.find((r) => r.id === 'staff')?.id
  const [v, , bind] = useForm({
    name: emp?.name || '', email: '', password: '',
    roleId: cur?.roleId || (emp && staffRole) || db.roles.find((r) => !r.system)?.id || 'owner',
    employeeId: cur ? cur.employeeId : emp?.id || '',
  })
  // each employee has at most one login
  const free = db.employees.filter((e) => e.status !== 'left' && !db.users.some((u) => u.employeeId === e.id && u.id !== cur?.id))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (cur) await users('PATCH', { id: cur.id, roleId: v.roleId, password: v.password || undefined, employeeId: v.employeeId })
      else await users('POST', v)
      toast(cur ? 'User updated' : 'User added')
      close()
    } catch (ex) {
      setErr((ex as Error).message)
      setBusy(false)
    }
  }
  return (
    <Sheet title={cur ? `Edit user · ${cur.name}` : emp ? `Login for ${emp.name}` : 'Add user'} crumb="Users, roles and settings" onSubmit={(e) => void submit(e)}
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
        <Field label="Linked employee" hint="Linked people see My work: their own sales, attendance, pay and job history.">
          <select {...bind('employeeId')}>
            <option value="">None</option>
            {free.map((e) => <option key={e.id} value={e.id}>{e.name}{e.role ? ` · ${e.role}` : ''}</option>)}
          </select>
        </Field>
      </div>
    </Sheet>
  )
}
