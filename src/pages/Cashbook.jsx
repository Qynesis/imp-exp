import { useState } from 'react'
import { addDays, flong, tk, todayISO } from '../lib/format.js'
import { cashForDay, payables, receivables } from '../lib/selectors.js'
import { useStore } from '../lib/store.jsx'
import { Button, Card, DataTable, Empty, Icon, Stat, go, useSheets } from '../ui.jsx'
import { DueRow, PageHead } from './common.jsx'

export default function Cashbook() {
  const { db } = useStore()
  const sheets = useSheets()
  const today = todayISO()
  const [date, setDate] = useState(today)
  const cash = cashForDay(db, date)
  const rec = receivables(db)
  const pay = payables(db)
  const isToday = date === today

  return (
    <>
      <PageHead title="Cashbook and dues" sub={flong(date)} actions={
        <>
          <Button variant="secondary" onClick={() => sheets.open('addExpense')}>Add expense</Button>
          <Button variant="secondary" onClick={() => sheets.open('pay', { crumb: 'Cashbook and dues' })}>Make payment</Button>
          <Button onClick={() => sheets.open('collect')}>Collect from dealer</Button>
        </>
      } />
      <div className="day-nav">
        <button type="button" className="icon-btn bordered" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}><Icon name="back" size={18} /></button>
        <input className="in" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Cashbook date" />
        <button type="button" className="icon-btn bordered" aria-label="Next day" disabled={isToday} onClick={() => setDate(addDays(date, 1))}><Icon name="chevron" size={18} /></button>
        {!isToday && <Button variant="ghost" size="sm" onClick={() => setDate(today)}>Back to today</Button>}
      </div>
      <div className="stats" key={date}>
        <Stat label="Opening balance" value={tk(cash.opening)} />
        <Stat label="Cash in" value={tk(cash.in)} />
        <Stat label="Cash out" value={tk(cash.out)} />
        <Stat label="Closing balance" value={tk(cash.closing)} />
      </div>

      <Card title={isToday ? 'Today’s entries' : 'Entries on this day'}>
        <DataTable
          rows={cash.entries}
          rowKey={(r, i) => i}
          empty="No money moved on this day."
          columns={[
            { label: 'Details', primary: true, render: (r) => r.details },
            { label: 'Head', render: (r) => <span className="t-muted">{r.head}</span> },
            { label: 'Paid by', render: (r) => <span className="t-muted">{r.method}</span> },
            { label: 'Cash in', align: 'right', render: (r) => (r.in ? <b className="t-good">{tk(r.in)}</b> : '') },
            { label: 'Cash out', align: 'right', render: (r) => (r.out ? <b className="t-warn">{tk(r.out)}</b> : '') },
            { label: 'Balance', align: 'right', render: (r) => tk(r.balance) },
          ]}
        />
      </Card>

      <div className="grid2">
        <Card title="Dues to collect" action={<b className="t-good">{tk(rec.total)}</b>}>
          <div className="rows">
            {rec.rows.map((r) => (
              <DueRow key={r.dealer.id} name={r.dealer.name} meta={r.statusText} metaTone={r.overdue ? 'warn' : 'muted'} amount={r.due}
                action="Collect" onAction={() => sheets.open('collect', { dealerId: r.dealer.id })}
                onClick={() => sheets.open('dealerStatement', { dealerId: r.dealer.id })} />
            ))}
            {!rec.rows.length && <Empty>No dealer owes anything.</Empty>}
          </div>
        </Card>
        <Card title="Dues to pay" action={<b className="t-warn">{tk(pay.total)}</b>}>
          <div className="rows">
            {pay.rows.map((r) => (
              <DueRow key={r.key} name={r.name} meta={r.meta} metaTone="muted" amount={r.due} action="Pay"
                onAction={() => sheets.open('pay', r.kind === 'supplier' ? { kind: 'supplier', supplierId: r.supplierId, crumb: 'Cashbook and dues' } : { kind: 'factory', orderId: r.orderId, crumb: 'Cashbook and dues' })}
                onClick={() => (r.kind === 'supplier' ? go('suppliers/' + r.supplierId) : go('factory-orders/' + r.orderId))} />
            ))}
            {!pay.rows.length && <Empty>Nothing to pay.</Empty>}
            {pay.advances.length > 0 && (
              <div className="row foot-note">
                <span>Advance lying with factories: <b className="t-good">{tk(pay.advanceTotal)}</b> ({pay.advances.map((a) => `${a.name}, ${a.orderId}`).join('; ')})</span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
