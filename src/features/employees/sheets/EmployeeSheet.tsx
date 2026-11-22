import { addDays, byId, num, todayISO, type CustomValues, type Employee, type PayType, type StaffKind } from '@shared/domain'
import { CustomFields } from '@/components/CustomFields'
import { useBooks } from '@/core/store/context'
import { Button, Field, FormSheet, Icon, Segmented, useForm, useToast, type SheetComponent } from '@/ui'

const PAY_HELP: Record<PayType, string> = {
  salary: 'A fixed amount every month. Advances come off it.',
  sales: 'Earns a share of what they sell or collect.',
  daily: 'Paid for each day marked present in the daily register. Half days count half.',
  contract: 'A fixed sum for a job with a start and end date, paid in parts.',
}

/** Add an employee or worker, or change one when `employeeId` is given. */
export const EmployeeSheet: SheetComponent<{ employeeId?: string; kind?: StaffKind }> = ({ employeeId, kind }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const cur = byId(db.employees, employeeId)
  const startKind: StaffKind = cur?.kind || kind || 'staff'
  const [v, set, bind, nbind] = useForm(() => ({
    kind: startKind,
    name: cur?.name || '', phone: cur?.phone || '', role: cur?.role || '',
    payType: (cur?.payType || (startKind === 'worker' ? 'daily' : 'salary')) as PayType,
    salary: cur?.salary ? String(cur.salary) : '', rate: cur?.rate ? String(cur.rate) : '',
    dailyRate: cur?.dailyRate ? String(cur.dailyRate) : '',
    cAmount: cur?.contract?.amount ? String(cur.contract.amount) : '', cStart: cur?.contract?.start || todayISO(), cEnd: cur?.contract?.end || addDays(todayISO(), 30), cWork: cur?.contract?.work || '',
    commissionOn: (cur?.commissionOn || 'sales') as Employee['commissionOn'],
    joined: cur?.joined || todayISO(),
    department: cur?.department || '', address: cur?.address || '', nid: cur?.nid || '', emergency: cur?.emergency || '', note: cur?.note || '',
    salesTarget: cur?.salesTarget ? String(cur.salesTarget) : '',
    custom: (cur?.custom || {}) as CustomValues,
    extra: (cur?.extra || []).map((x) => ({ ...x })),
    placeId: cur?.placeId || '',
  }))
  const worker = v.kind === 'worker'
  // once transfers exist, the workplace changes only through a transfer order
  const moved = !!cur && (db.staffTransfers || []).some((t) => t.employeeId === cur.id && !t.cancelled)
  const places = (db.workplaces || []).filter((w) => !w.archived || w.id === v.placeId)
  const pay = v.payType
  const setExtra = (i: number, k: 'label' | 'value', x: string) => set('extra', v.extra.map((r, j) => (j === i ? { ...r, [k]: x } : r)))
  const who = worker ? 'worker' : 'employee'
  return (
    <FormSheet title={cur ? `Edit ${cur.name}` : worker ? 'Add worker' : 'Add employee'} crumb="Employees and workers" submit={`Save ${who}`}
      note={PAY_HELP[pay]}
      onSubmit={() => {
        if (!v.name.trim()) return `Enter the ${who}’s name.`
        if (pay === 'salary' && num(v.salary) <= 0) return 'Enter the monthly salary.'
        if (pay === 'sales' && num(v.rate) <= 0) return 'Enter the commission rate.'
        if (pay === 'daily' && num(v.dailyRate) <= 0) return 'Enter the daily wage.'
        if (pay === 'contract' && num(v.cAmount) <= 0) return 'Enter the contract amount.'
        if (pay === 'contract' && v.cEnd < v.cStart) return 'The contract ends before it starts.'
        const extra = v.extra.map((x) => ({ label: x.label.trim(), value: x.value.trim() })).filter((x) => x.label && x.value)
        const why = act('saveEmployee', {
          id: cur?.id, kind: v.kind, name: v.name.trim(), phone: v.phone.trim(), role: v.role.trim(), payType: pay,
          salary: pay === 'salary' ? num(v.salary) : 0, rate: pay === 'sales' ? num(v.rate) : 0, commissionOn: v.commissionOn,
          salesTarget: pay === 'sales' ? num(v.salesTarget) || undefined : undefined,
          dailyRate: pay === 'daily' ? num(v.dailyRate) : undefined,
          contract: pay === 'contract' ? { amount: num(v.cAmount), start: v.cStart, end: v.cEnd, work: v.cWork.trim() } : undefined,
          joined: v.joined, department: v.department.trim(), address: v.address.trim(), nid: v.nid.trim(), emergency: v.emergency.trim(), note: v.note.trim(),
          custom: v.custom, extra: extra.length ? extra : undefined, placeId: moved ? cur?.placeId : v.placeId || undefined,
        })
        if (why) return why
        toast(cur ? `${v.name.trim()} saved` : `${worker ? 'Worker' : 'Employee'} added`)
      }}>
      <div className="field wide">
        <Segmented<StaffKind> label="Staff or worker" value={v.kind} onChange={(k) => { set('kind', k); if (!cur) set('payType', k === 'worker' ? 'daily' : 'salary') }}
          options={[{ value: 'staff', label: 'Employee (staff)' }, { value: 'worker', label: 'Worker' }]} />
      </div>
      <Field label="Name"><input {...bind('name')} placeholder="Full name" /></Field>
      <Field label="Phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXX-XXXXXX" /></Field>
      <Field label="Job title"><input {...bind('role')} placeholder={worker ? 'e.g. Loader, Packer, Machine helper' : 'e.g. Sales officer, Accountant'} /></Field>
      <Field label="Department"><input {...bind('department')} placeholder="e.g. Sales, Warehouse, Packing" /></Field>
      {places.length > 0 && (
        <Field label="Works at" hint={moved ? 'Changed with a transfer order from their profile.' : 'Their first workplace. Later moves are transfer orders.'}>
          <select {...bind('placeId')} disabled={moved}>
            <option value="">Not set</option>
            {places.map((w) => <option key={w.id} value={w.id}>{w.name}{w.region ? ` · ${w.region}` : ''}</option>)}
          </select>
        </Field>
      )}

      <p className="form-sub">Pay</p>
      <Field label="Paid by">
        <select {...bind('payType')}>
          <option value="salary">Monthly salary</option>
          {!worker && <option value="sales">Sales commission</option>}
          <option value="daily">Daily wage</option>
          <option value="contract">Contract</option>
        </select>
      </Field>
      {pay === 'salary' && <Field label="Monthly salary (Tk)"><input {...nbind('salary')} placeholder="0" /></Field>}
      {pay === 'daily' && <Field label="Wage for one day (Tk)"><input {...nbind('dailyRate')} placeholder="e.g. 650" /></Field>}
      {pay === 'sales' && (
        <>
          <Field label="Commission rate (%)"><input {...nbind('rate')} placeholder="e.g. 2" /></Field>
          <Field label="Commission on">
            <select {...bind('commissionOn')}>
              <option value="sales">Sales amount</option>
              <option value="collection">Money collected</option>
            </select>
          </Field>
          <Field label="Monthly sales target (Tk)"><input {...nbind('salesTarget')} placeholder="Optional" /></Field>
        </>
      )}
      {pay === 'contract' && (
        <>
          <Field label="Contract amount (Tk)"><input {...nbind('cAmount')} placeholder="Total for the job" /></Field>
          <Field label="Work covered" wide><input {...bind('cWork')} placeholder="e.g. Loading 40 containers, godown wiring" /></Field>
          <Field label="Starts"><input type="date" {...bind('cStart')} /></Field>
          <Field label="Ends"><input type="date" {...bind('cEnd')} /></Field>
        </>
      )}
      <Field label="Joining date"><input type="date" {...bind('joined')} /></Field>

      <p className="form-sub">Personal details</p>
      <Field label="NID number"><input {...bind('nid')} placeholder="National ID" /></Field>
      <Field label="Emergency contact"><input {...bind('emergency')} placeholder="Name and phone" /></Field>
      <Field label="Address" wide><input {...bind('address')} placeholder="Present address" /></Field>
      <Field label="Duties and notes" wide><input {...bind('note')} placeholder="Duties, shift, anything to remember" /></Field>
      <CustomFields entity="employee" value={v.custom} onChange={(c) => set('custom', c)} />

      <p className="form-sub">Extra details for this person</p>
      {v.extra.map((x, i) => (
        <div key={i} className="extra-row wide">
          <input className="in" value={x.label} onChange={(e) => setExtra(i, 'label', e.target.value)} placeholder="Name, e.g. Blood group" aria-label="Detail name" />
          <input className="in" value={x.value} onChange={(e) => setExtra(i, 'value', e.target.value)} placeholder="Value, e.g. B+" aria-label="Detail value" />
          <button type="button" className="icon-btn" aria-label="Remove this detail" onClick={() => set('extra', v.extra.filter((_, j) => j !== i))}><Icon name="trash" size={16} /></button>
        </div>
      ))}
      <div className="field wide">
        <Button variant="secondary" icon="plus" onClick={() => set('extra', [...v.extra, { label: '', value: '' }])}>Add a detail</Button>
        <small className="t-muted">For things only this person needs: licence number, blood group, bank account, uniform size… Fields every person needs can be added once in Settings → Custom fields.</small>
      </div>
    </FormSheet>
  )
}
