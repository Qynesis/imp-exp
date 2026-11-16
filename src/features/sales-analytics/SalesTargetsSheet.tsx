import { useState } from 'react'
import { num, tk } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useToast } from '@/ui'

/** Monthly sales targets for the company and for each salesperson. */
export function SalesTargetsSheet() {
  const { db, act } = useBooks()
  const toast = useToast()
  const staff = db.employees.filter((e) => e.payType === 'sales' || e.salesTarget)
  const [company, setCompany] = useState(String(db.company.salesTarget || ''))
  const [each, setEach] = useState<Record<string, string>>(() => Object.fromEntries(staff.map((e) => [e.id, String(e.salesTarget || '')])))
  const staffTotal = Object.values(each).reduce((s, v) => s + num(v), 0)
  return (
    <FormSheet title="Monthly sales targets" crumb="Sales analytics" submit="Save targets"
      note="Targets are per month. The yearly view multiplies them by twelve. Leave a box empty for no target."
      onSubmit={() => {
        act('setSalesTargets', { company: num(company), staff: Object.fromEntries(Object.entries(each).map(([id, v]) => [id, num(v)])) })
        toast('Targets saved')
      }}>
      <Field label="Company target per month (Tk)" wide hint={staffTotal > 0 ? `Salespeople's targets add up to ${tk(staffTotal)}.` : undefined}>
        <input className="in" inputMode="decimal" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. 3000000" />
      </Field>
      {staff.map((e) => (
        <Field key={e.id} label={`${e.name} (Tk)`}>
          <input className="in" inputMode="decimal" value={each[e.id] ?? ''} onChange={(ev) => setEach((m) => ({ ...m, [e.id]: ev.target.value }))} placeholder="No target" />
        </Field>
      ))}
      {!staff.length && <p className="t-muted field wide">No salespeople yet. Add employees paid on sales under Employees.</p>}
    </FormSheet>
  )
}
