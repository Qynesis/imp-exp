import { fmonth, payrollFor, plural, SALARY_ADVANCE, thisMonth, tk, type Employee } from '@shared/domain'
import { PageHead } from '@/components/PageHead'
import { useBooks } from '@/core/store/context'
import { AddExpenseSheet } from '@/features/cashbook/sheets/AddExpenseSheet'
import { Button, Card, DataTable, Stat, useSheets } from '@/ui'
import { EmployeeSheet } from './sheets/EmployeeSheet'
import { PayrollSheet } from './sheets/PayrollSheet'

export default function EmployeesPage() {
  const { db } = useBooks()
  const sheets = useSheets()
  const month = thisMonth()
  const pr = payrollFor(db, month)
  const edit = (r: { e: Employee }) => sheets.open(EmployeeSheet, { employeeId: r.e.id })
  return (
    <>
      <PageHead title="Employees" sub={`${fmonth(month)} · salary staff are paid a fixed amount, sales staff earn commission on what they sell.`} actions={
        <>
          <Button icon="plus" variant="secondary" onClick={() => sheets.open(EmployeeSheet)}>Add employee</Button>
          <Button variant="secondary" onClick={() => sheets.open(AddExpenseSheet, { head: SALARY_ADVANCE })}>Give advance</Button>
          <Button icon="wallet" onClick={() => sheets.open(PayrollSheet, { month })}>Pay salaries and commission</Button>
        </>
      } />
      <div className="stats three">
        <Stat icon="badge" label="Salary still to pay this month" value={tk(pr.salaryToPay)} />
        <Stat icon="tag" label="Commission still to pay" value={tk(pr.commissionToPay)} sub={`${tk(pr.commission)} earned this month`} />
        <Stat icon="wallet" label="Advances already given" value={tk(pr.advances)} />
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
