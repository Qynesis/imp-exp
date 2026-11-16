import { useState, type FormEvent } from 'react'
import { byId } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Button, Field, Sheet, useForm, useSheetItem, useToast } from '@/ui'

/** Add a sign-in for someone, or change a user's role or password. */
export function UserSheet({ userId }: { userId?: string }) {
  const { db, users } = useBooks()
  const toast = useToast()
  const { close } = useSheetItem()
  const cur = byId(db.users, userId)
  const [v, , bind] = useForm({ name: '', email: '', password: '', roleId: cur?.roleId || db.roles.find((r) => !r.system)?.id || 'owner', employeeId: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (cur) await users('PATCH', { id: cur.id, roleId: v.roleId, password: v.password || undefined })
      else await users('POST', v)
      toast(cur ? 'User updated' : 'User added')
      close()
    } catch (ex) {
      setErr((ex as Error).message)
      setBusy(false)
    }
  }
  return (
    <Sheet title={cur ? `Edit user · ${cur.name}` : 'Add user'} crumb="Users, roles and settings" onSubmit={(e) => void submit(e)}
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
