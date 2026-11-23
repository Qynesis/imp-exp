import { useState } from 'react'
import { reportsFor, teamOf, type Employee } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Button, Card, Segmented, useSheets } from '@/ui'
import { ReportTable } from './index'
import { WriteReportSheet } from './ReportSheets'

/** On My work: my reports and their answers; for managers, the team's reports to review too. */
export function MyReports({ e }: { e: Employee }) {
  const { db, session } = useBooks()
  const sheets = useSheets()
  const team = teamOf(db, e.id)
  const mine = reportsFor(db, session.userId, { scope: 'mine' })
  const theirs = reportsFor(db, session.userId, { scope: 'team' })
  const waiting = theirs.filter((r) => r.status === 'submitted').length
  const [view, setView] = useState<'mine' | 'team'>(waiting ? 'team' : 'mine')
  const answered = mine.filter((r) => r.status === 'approved' || r.status === 'changes' || r.status === 'reviewed').length
  return (
    <Card icon="receipt" title="Reports" sub={view === 'team' ? `Reports from the ${team.length} ${team.length === 1 ? 'person' : 'people'} who report to you. Tap one to answer it.` : `Your written reports to ${e.managerId ? 'your manager and ' : ''}the office, and their answers.`}
      action={
        <div className="tools-right">
          {team.length > 0 && <Segmented label="Whose reports" value={view} onChange={setView} options={[{ value: 'mine', label: `Mine (${mine.length})` }, { value: 'team', label: waiting ? `Team (${waiting} new)` : 'Team' }]} />}
          {e.status !== 'left' && <Button icon="plus" onClick={() => sheets.open(WriteReportSheet, {})}>Write report</Button>}
        </div>
      }>
      {view === 'mine' && answered > 0 && <p className="t-muted tight card-body pt0">{answered} of your reports {answered === 1 ? 'has' : 'have'} an answer — tap to read it.</p>}
      <ReportTable rows={view === 'team' ? theirs : mine} mine={view === 'mine'} empty={view === 'team' ? 'Nobody in your team has sent a report yet.' : 'You have not written a report yet. Write your daily or weekly report here, and attach photos or files.'} />
    </Card>
  )
}
