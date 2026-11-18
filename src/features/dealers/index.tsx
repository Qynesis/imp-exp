import { useMemo, useState, type FormEvent } from 'react'
import { byId, dealerLedger, fshort, tk } from '@shared/domain'
import { PageHead } from '@/components/PageHead'
import { useBooks } from '@/core/store/context'
import { Button, Card, DataTable, useForm, useSheets, useToast } from '@/ui'
import { DealerFields } from './DealerForm'
import { dealerInit, dealerPayload } from './dealerFormModel'
import { DealerStatementSheet } from './sheets/DealerStatementSheet'

export default function DealersPage() {
  const { db } = useBooks()
  const sheets = useSheets()
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return db.dealers.map((d) => dealerLedger(db, d.id)).filter((l) => (l.dealer.name + ' ' + l.dealer.area).toLowerCase().includes(needle))
  }, [db, q])
  return (
    <>
      <PageHead title="Dealers" sub="Everyone we sell to, their payment terms and what they still owe." />
      <div className="grid-side">
        <Card title="All dealers" action={<input className="in search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or area" aria-label="Search dealers" />}>
          <DataTable
            pageSize={25}
            rows={rows}
            rowKey={(r) => r.dealer.id}
            onRow={(r) => sheets.open(DealerStatementSheet, { dealerId: r.dealer.id })}
            empty={db.dealers.length ? 'No dealer matches.' : 'No dealers yet. Add the first one with the form.'}
            columns={[
              { label: 'Dealer', primary: true, render: (r) => (
                <span className="two-line">
                  <b>{r.dealer.name}{r.dealer.sample && <span className="test-tag">sample</span>}</b>
                  <small>{byId(db.employees, r.dealer.salesId) ? `Sales: ${byId(db.employees, r.dealer.salesId)?.name}` : 'Office sale'}</small>
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
        <NewDealerCard />
      </div>
    </>
  )
}

function NewDealerCard() {
  // a new key after each save gives a fresh, empty form
  const [round, setRound] = useState(0)
  return (
    <Card title="New dealer" className="edit-only">
      <NewDealerForm key={round} onSaved={() => setRound((r) => r + 1)} />
    </Card>
  )
}

function NewDealerForm({ onSaved }: { onSaved: () => void }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const [v, set, bind, nbind] = useForm(() => dealerInit())
  const [err, setErr] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const p = dealerPayload(v)
    if (typeof p === 'string') return setErr(p)
    act('saveDealer', p)
    toast(`${p.name} added`)
    onSaved()
  }
  return (
    <form className="card-body pt0" onSubmit={submit} noValidate>
      {err && <div className="err" role="alert">{err}</div>}
      <div className="form-grid">
        <DealerFields db={db} v={v} set={set} bind={bind} nbind={nbind} idPrefix="new" />
      </div>
      <Button type="submit" block className="mt">Save dealer</Button>
    </form>
  )
}
