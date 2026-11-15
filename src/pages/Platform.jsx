import { useCallback, useEffect, useState } from 'react'
import { fdate, plural } from '../lib/format.js'
import { BUSINESS_TYPES } from '../lib/presets.js'
import { useStore } from '../lib/store.jsx'
import { BRAND, Button, Card, DataTable, Empty, Logo, Stat, useToast } from '../ui.jsx'

/** The operator's view: every company on the platform, with a way into each one. */
export default function Platform() {
  const { platform, openCompany, platformSignOut } = useStore()
  const toast = useToast()
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  const [reset, setReset] = useState(null) // { email, password }

  const load = useCallback(() => platform('GET', 'companies').then((r) => setList(r.companies)).catch((e) => (e.status === 401 ? platformSignOut() : toast(e.message))), [platform, platformSignOut, toast])
  useEffect(() => {
    load()
  }, [load])

  const open = (id) => openCompany(id).catch((e) => toast(e.message))
  const saveReset = async (e) => {
    e.preventDefault()
    try {
      await platform('POST', 'password', reset)
      toast(`New password set for ${reset.email}`)
      setReset(null)
    } catch (ex) {
      toast(ex.message)
    }
  }

  const needle = q.trim().toLowerCase()
  const shown = (list || []).filter((c) => (c.name + ' ' + c.users.map((u) => u.email + ' ' + u.name).join(' ')).toLowerCase().includes(needle))
  const userCount = (list || []).reduce((s, c) => s + c.users.length, 0)

  return (
    <div className="platform">
      <div className="platform-bar">
        <Logo height={56} />
        <Button variant="secondary" onClick={platformSignOut}>Sign out</Button>
      </div>
      <header className="page-head">
        <div className="page-title">
          <h1>All companies</h1>
          <p>You are signed in as the {BRAND} platform owner. Opening a company gives you full access to its books; each time is written to the audit log.</p>
        </div>
      </header>
      <div className="stats three">
        <Stat label="Companies" value={list ? list.length : '…'} />
        <Stat label="Users" value={list ? userCount : '…'} />
        <Stat label="Passwords" value="Hashed" sub="Never readable. Reset one instead." />
      </div>
      <input className="in" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, user or email" aria-label="Search companies" />
      {list && !shown.length && <Card><Empty>{list.length ? 'No company matches.' : 'No company has signed up yet.'}</Empty></Card>}
      {shown.map((c) => (
        <Card key={c.id} className="co-card" title={c.name}
          sub={`Joined ${fdate(c.createdAt.slice(0, 10))} · ${plural(c.counts.products, 'product')}, ${plural(c.counts.invoices, 'invoice')}, ${plural(c.counts.shipments, 'shipment')}${c.trades.length ? ' · ' + c.trades.map((t) => BUSINESS_TYPES[t]?.label).filter(Boolean).join(', ') : ''}`}
          action={<Button size="sm" onClick={() => open(c.id)}>Open books</Button>}>
          <DataTable
            rows={c.users}
            columns={[
              { label: 'User', primary: true, render: (u) => u.name },
              { label: 'Sign-in email', render: (u) => u.email },
              { label: 'Role', render: (u) => u.role },
              { label: '', align: 'right', render: (u) => <Button variant="secondary" size="sm" onClick={() => setReset({ email: u.email, password: '' })}>Reset password</Button> },
            ]}
          />
          {reset && c.users.some((u) => u.email === reset.email) && (
            <form className="card-body" onSubmit={saveReset} noValidate>
              <label className="field">
                <span className="field-label">New password for {reset.email}</span>
                <input className="in" type="text" autoComplete="off" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} placeholder="At least 8 characters" />
                <small>The user is signed out everywhere and must use this password from now on.</small>
              </label>
              <div className="btn-row">
                <Button type="submit">Set password</Button>
                <Button variant="secondary" onClick={() => setReset(null)}>Cancel</Button>
              </div>
            </form>
          )}
        </Card>
      ))}
    </div>
  )
}
