import { useAccess } from '@/app/useAccess'
import { accessGuard, useBooks } from '@/core/store/context'
import { UserSheet } from '@/features/settings/sheets/UserSheet'
import { Button, Sheet, useConfirm, useSheets, useToast, type SheetComponent } from '@/ui'
import { EmployeeProfileView } from '../EmployeeProfileView'
import { EmployeeSheet } from './EmployeeSheet'
import { JobEventSheet, PayContractSheet, StatusSheet } from './PeopleSheets'
import { LeaveRequestSheet } from './LeaveSheets'
import { StaffTransferSheet } from './PlaceSheets'

/** One employee or worker, as the admin sees them: the profile, and everything that can be done to it. */
export const EmployeeProfileSheet: SheetComponent<{ employeeId: string }> = ({ employeeId }) => {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const confirm = useConfirm()
  const toast = useToast()
  const { level } = useAccess()
  const e = db.employees.find((x) => x.id === employeeId)
  if (!e) return null
  const canEdit = !accessGuard.readonly
  const admin = level('settings') === 'edit'
  const login = db.users.find((u) => u.employeeId === e.id)
  const owed = e.payType === 'contract' && (e.contract?.amount || 0) > 0
  return (
    <Sheet title={e.name} crumb={e.kind === 'worker' ? 'Worker' : 'Employee'} wide
      footer={canEdit ? (
        <>
          <Button variant="secondary" onClick={() => sheets.open(StatusSheet, { employeeId: e.id })}>{e.status === 'left' ? 'Back at work' : 'Mark as left'}</Button>
          <Button variant="secondary" icon="plus" onClick={() => sheets.open(JobEventSheet, { employeeId: e.id })}>History note</Button>
          {e.status !== 'left' && <Button variant="secondary" icon="calendar" onClick={() => sheets.open(LeaveRequestSheet, { employeeId: e.id })}>Record leave</Button>}
          {e.status !== 'left' && (db.workplaces || []).length > 0 && <Button variant="secondary" icon="route" onClick={() => sheets.open(StaffTransferSheet, { employeeId: e.id })}>Transfer</Button>}
          {admin && <Button variant="secondary" icon="users" onClick={() => sheets.open(UserSheet, login ? { userId: login.id } : { employeeId: e.id })}>{login ? 'Login' : 'Create login'}</Button>}
          {owed && <Button variant="secondary" icon="wallet" onClick={() => sheets.open(PayContractSheet, { employeeId: e.id })}>Pay contract</Button>}
          <Button icon="edit" onClick={() => sheets.open(EmployeeSheet, { employeeId: e.id })}>Edit</Button>
        </>
      ) : undefined}>
      <EmployeeProfileView employeeId={e.id} onRemoveEvent={canEdit ? async (id) => {
        if (await confirm({ title: 'Remove this from the job history?', confirmLabel: 'Remove', destructive: true })) {
          if (!act('removeJobEvent', { employeeId: e.id, eventId: id })) toast('Removed')
        }
      } : undefined} />
    </Sheet>
  )
}
EmployeeProfileSheet.readOnlySafe = true
