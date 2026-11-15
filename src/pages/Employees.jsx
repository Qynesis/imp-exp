import { fmonth, plural, tk, todayISO } from '../lib/format.js'
import { payrollFor } from '../lib/selectors.js'
import { useStore } from '../lib/store.jsx'
import { Button, Card, DataTable, Stat, useSheets } from '../ui.jsx'
import { PageHead } from './common.jsx'

export default function Employees() {
  const { db } = useStore()
  const sheets = useSheets()
  const month = todayISO().slice(0, 7)
  const pr = payrollFor(db, month)
  const edit = (r) => sheets.open('employee', { employeeId: r.e.id })
  return (
    <>
      <PageHead title="Employees" sub={`${fmonth(month)} · salary staff are paid a fixed amount, sales staff earn commission on what they sell.`} actions={
        <>
          <Button variant="secondary" onClick={() => sheets.open('employee')}>Add employee</Button>
          <Button variant="secondary" onClick={() => sheets.open('addExpense', { head: 'Salary advance' })}>Give advance</Button>
          <Button onClick={() => sheets.open('payroll', { month })}>Pay salaries and commission</Button>
        </>
      } />
      <div className="stats three">
        <Stat label="Salary still to pay this month" value={tk(pr.salaryToPay)} />
        <Stat label="Commission still to pay" value={tk(pr.commissionToPay)} sub={`${tk(pr.commission)} earned this month`} />
        <Stat label="Advances already given" value={tk(pr.advances)} />
      </div>
      <Card title="Salary basis" sub="Fixed monthly salary. Advances are taken off automatically.">
        <DataTable
          rows={pr.salary}
          rowKey={(r) => r.e.id}
          onRow={edit}
          empty="No salary-basis employees yet."
          columns={[
            { label: 'Employee', primary: true, render: (r) => r.e.name },
            { label: 'Role', render: (r) => r.e.role },
            { label: 'Monthly salary', align: 'right', render: (r) => tk(r.salary) },
            { label: 'Advance taken', align: 'right', render: (r) => tk(r.advance) },
            { label: 'Already paid', align: 'right', render: (r) => tk(r.paid) },
            { label: 'To pay', align: 'right', render: (r) => <b>{tk(r.toPay)}</b> },
          ]}
        />
      </Card>
      <Card title="Sales basis" sub="Commission is worked out from the invoices each person sold.">
        <DataTable
          rows={pr.sales}
          rowKey={(r) => r.e.id}
          onRow={edit}
          empty="No sales-basis employees yet."
          columns={[
            { label: 'Employee', primary: true, render: (r) => r.e.name },
            { label: 'Dealers handled', render: (r) => plural(r.dealers, 'dealer') },
            { label: 'Sales this month', align: 'right', render: (r) => tk(r.sold) },
            { label: 'Money collected', align: 'right', render: (r) => tk(r.collected) },
            { label: 'Rate', align: 'right', render: (r) => `${r.e.rate}% of ${r.e.commissionOn === 'collection' ? 'collection' : 'sales'}` },
            { label: 'Commission', align: 'right', render: (r) => <b>{tk(r.commission)}</b> },
            { label: 'To pay', align: 'right', render: (r) => <b>{tk(r.toPay)}</b> },
          ]}
        />
      </Card>
    </>
  )
}
