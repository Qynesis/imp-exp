import { useState } from 'react'
import { fshort, tk } from '../lib/format.js'
import { byId, dealerLedger } from '../lib/selectors.js'
import { useStore } from '../lib/store.jsx'
import { DealerFields, dealerInit, dealerPayload } from '../sheets/selling.jsx'
import { Button, Card, DataTable, useForm, useSheets, useToast } from '../ui.jsx'
import { PageHead } from './common.jsx'

function NewDealer() {
  const { db, act } = useStore()
  const toast = useToast()
  const [v, set, bind, nbind] = useForm(dealerInit(db))
  const [err, setErr] = useState('')
  const [round, setRound] = useState(0)
  const submit = (e) => {
    e.preventDefault()
    const p = dealerPayload(v)
    if (typeof p === 'string') return setErr(p)
    act('saveDealer', p)
    toast(`${p.name} added`)
    setErr('')
    Object.entries(dealerInit(db)).forEach(([k, val]) => set(k, val))
    setRound((r) => r + 1)
  }
  return (
    <Card title="New dealer" className="edit-only">
      <form className="card-body pt0" onSubmit={submit} noValidate key={round}>
        {err && <div className="err" role="alert">{err}</div>}
        <div className="form-grid">
          <DealerFields db={db} v={v} set={set} bind={bind} nbind={nbind} idp="new" />
        </div>
        <Button type="submit" block className="mt">Save dealer</Button>
      </form>
    </Card>
  )
}

export default function Dealers() {
  const { db } = useStore()
  const sheets = useSheets()
  const [q, setQ] = useState('')
  const rows = db.dealers.map((d) => dealerLedger(db, d.id))
    .filter((l) => (l.dealer.name + ' ' + l.dealer.area).toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      <PageHead title="Dealers" sub="Everyone we sell to, their payment terms and what they still owe." />
      <div className="grid-side">
        <Card title="All dealers" action={<input className="in search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or area" aria-label="Search dealers" />}>
          <DataTable
            rows={rows}
            rowKey={(r) => r.dealer.id}
            onRow={(r) => sheets.open('dealerStatement', { dealerId: r.dealer.id })}
            empty={db.dealers.length ? 'No dealer matches.' : 'No dealers yet. Add the first one with the form.'}
            columns={[
              { label: 'Dealer', primary: true, render: (r) => (
                <span className="two-line">
                  <b>{r.dealer.name}</b>
                  <small>{byId(db.employees, r.dealer.salesId) ? `Sales: ${byId(db.employees, r.dealer.salesId).name}` : 'Office sale'}</small>
                </span>
              ) },
              { label: 'Area', render: (r) => r.dealer.area },
              { label: 'Terms', render: (r) => (r.dealer.terms === 'credit' ? `Credit · ${r.dealer.days} days` : 'Cash on delivery') },
              { label: 'Credit limit', align: 'right', render: (r) => (r.dealer.terms === 'credit' ? tk(r.dealer.limit) : 'No credit') },
              { label: 'Due now', align: 'right', render: (r) => (
                <span className="two-line right">
                  <b className={r.overdue ? 't-warn' : ''}>{tk(r.due)}</b>
                  {r.due > 0 && <small className={r.overdue ? 't-warn' : ''}>{r.statusText}</small>}
                </span>
              ) },
              { label: 'Last payment', align: 'right', render: (r) => (r.lastPayment ? <span className="t-muted">{tk(r.lastPayment.amount)} · {fshort(r.lastPayment.date)}</span> : '') },
            ]}
          />
        </Card>
        <NewDealer />
      </div>
    </>
  )
}
