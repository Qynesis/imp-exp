import { byId, num, todayISO, type Employee, type PayType } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

/** Add an employee, or edit one when `employeeId` is given. */
export function EmployeeSheet({ employeeId }: { employeeId?: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const cur = byId(db.employees, employeeId)
  const [v, , bind, nbind] = useForm(() => ({
    name: cur?.name || '', phone: cur?.phone || '', role: cur?.role || '',
    payType: (cur?.payType || 'salary') as PayType,
    salary: cur?.salary ? String(cur.salary) : '', rate: cur?.rate ? String(cur.rate) : '',
    commissionOn: (cur?.commissionOn || 'sales') as Employee['commissionOn'],
    joined: cur?.joined || todayISO(),
  }))
  const sales = v.payType === 'sales'
  return (
    <FormSheet title={cur ? 'Edit employee' : 'Add employee'} crumb="Employees" submit="Save employee"
      note="Salary basis gets a fixed monthly salary. Sales basis earns commission on sales."
      onSubmit={() => {
        if (!v.name.trim()) return 'Enter the employee name.'
        if (!sales && num(v.salary) <= 0) return 'Enter the monthly salary.'
        if (sales && num(v.rate) <= 0) return 'Enter the commission rate.'
        act('saveEmployee', { ...v, id: cur?.id, name: v.name.trim(), salary: sales ? 0 : num(v.salary), rate: sales ? num(v.rate) : 0 })
        toast(cur ? 'Employee updated' : 'Employee added')
      }}>
      <Field label="Name"><input {...bind('name')} placeholder="Full name" /></Field>
      <Field label="Phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXX-XXXXXX" /></Field>
      <Field label="Role"><input {...bind('role')} placeholder="e.g. Driver" /></Field>
      <Field label="Pay type">
        <select {...bind('payType')}>
          <option value="salary">Salary basis</option>
          <option value="sales">Sales basis</option>
        </select>
      </Field>
      {sales ? (
        <>
          <Field label="Commission rate (%)"><input {...nbind('rate')} placeholder="e.g. 2" /></Field>
          <Field label="Commission on">
            <select {...bind('commissionOn')}>
              <option value="sales">Sales amount</option>
              <option value="collection">Money collected</option>
            </select>
          </Field>
        </>
      ) : (
        <Field label="Monthly salary (Tk)"><input {...nbind('salary')} placeholder="0" /></Field>
      )}
      <Field label="Joining date"><input type="date" {...bind('joined')} /></Field>
    </FormSheet>
  )
}
