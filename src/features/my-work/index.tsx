import { byId, fdate, leaveList, postingOf, todayISO } from '@shared/domain'
import { PageHead } from '@/components/PageHead'
import { useBooks } from '@/core/store/context'
import { EmployeeProfileView } from '@/features/employees/EmployeeProfileView'
import { CheckInCard } from './CheckInCard'
import { MyReports } from '@/features/staff-reports/MyReports'
import { LeaveRequestSheet } from '@/features/employees/sheets/LeaveSheets'
import { Button, Card, Empty, useSheets } from '@/ui'

/** #/my-work: the signed-in person's own sales or work, attendance, pay and job history. Read-only. */
export default function MyWorkPage() {
  const { db, session } = useBooks()
  const sheets = useSheets()
  const me = byId(db.users, session.userId)
  const e = byId(db.employees, me?.employeeId)
  if (!e) return <Empty>Your login is not linked to an employee yet. Ask the admin to link it in Settings → Users.</Empty>
  const waiting = leaveList(db, { employeeId: e.id, pending: true })
  const post = postingOf(db, e)
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return (
    <>
      <PageHead title={`${hello}, ${e.name.split(' ')[0]}`} sub={`${post.place ? `${post.place.name} · ` : ''}Your work, attendance, leave, pay and job history at ${db.company.name || 'the company'} · ${fdate(todayISO())}`}
        actions={e.status !== 'left' && <Button icon="calendar" onClick={() => sheets.open(LeaveRequestSheet, {})}>Apply for leave</Button>} />
      {post.next && <p className="move-note">{`You are transferred to ${byId(db.workplaces || [], post.next.to)?.name || 'a new place'} from ${fdate(post.next.date)}. See the Workplace tab for the address and who to report to.`}</p>}
      {waiting.length > 0 && <div className="next-step"><span>{waiting.length} leave request{waiting.length === 1 ? ' is' : 's are'} waiting for the office to answer.</span></div>}
      {e.status !== 'left' && <CheckInCard e={e} />}
      <MyReports e={e} />
      <Card>
        <div className="card-body">
          <EmployeeProfileView employeeId={e.id} self />
        </div>
      </Card>
      <p className="t-muted tight">Something not right? Talk to your manager; only the office can change these records.</p>
    </>
  )
}
