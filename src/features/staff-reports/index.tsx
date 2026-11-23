import { useMemo, useState } from 'react'
import { addDays, byId, fdate, fmt, REPORT_KINDS, REPORT_STATUS, REPORT_TONE, reportsFor, todayISO, type ReportKind, type ReportStatus, type WorkReport } from '@shared/domain'
import { PageHead } from '@/components/PageHead'
import { useBooks } from '@/core/store/context'
import { Card, cls, DataTable, Icon, Pill, SearchBox, Segmented, Stat, useSheets } from '@/ui'
import { ReportSheet } from './ReportSheets'

type Show = 'waiting' | 'changes' | 'done' | 'all'

/** #/staff-reports: the office reads and answers employees' reports. */
export default function StaffReportsPage() {
  const { db, session } = useBooks()
  const [show, setShow] = useState<Show>('waiting')
  const [kind, setKind] = useState<'' | ReportKind>('')
  const [who, setWho] = useState('')
  const [q, setQ] = useState('')
  const all = reportsFor(db, session.userId)
  const today = todayISO()
  const weekAgo = addDays(today, -6)
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return all.filter((r) => (show === 'all' || (show === 'waiting' ? r.status === 'submitted' : show === 'changes' ? r.status === 'changes' : r.status === 'approved' || r.status === 'reviewed'))
      && (!kind || r.kind === kind) && (!who || r.employeeId === who)
      && (!n || `${r.id} ${r.title} ${r.body} ${byId(db.employees, r.employeeId)?.name || ''}`.toLowerCase().includes(n)))
  }, [all, show, kind, who, q, db])
  const waiting = all.filter((r) => r.status === 'submitted').length
  const active = db.employees.filter((e) => e.status !== 'left')
  const silent = active.filter((e) => !all.some((r) => r.employeeId === e.id && r.submittedAt.slice(0, 10) >= weekAgo && r.status !== 'withdrawn'))
  return (
    <>
      <PageHead title="Employee reports" sub="Written reports from staff, with files. Read, approve, ask for changes, or reply — the employee sees the answer on My work." />
      <div className="stats">
        <Stat icon="bell" label="Waiting for review" value={fmt(waiting)} tone={waiting ? 'warn' : undefined} />
        <Stat icon="undo" label="Sent back for changes" value={fmt(all.filter((r) => r.status === 'changes').length)} />
        <Stat icon="check" label="Approved this month" value={fmt(all.filter((r) => r.status === 'approved' && (r.reviewedAt || '').slice(0, 7) === today.slice(0, 7)).length)} />
        <Stat icon="clock" label="No report this week" value={fmt(silent.length)} sub={silent.slice(0, 3).map((e) => e.name.split(' ')[0]).join(', ') + (silent.length > 3 ? '…' : '')} />
      </div>
      <Card icon="receipt" title="Reports">
        <div className="card-body pt0 filter-bar">
          <Segmented<Show> label="Show" value={show} onChange={setShow} options={[{ value: 'waiting', label: `Waiting (${waiting})` }, { value: 'changes', label: 'Changes asked' }, { value: 'done', label: 'Answered' }, { value: 'all', label: 'All' }]} />
          <select className="in place-filter" value={kind} onChange={(e) => setKind(e.target.value as ReportKind | '')} aria-label="Kind">
            <option value="">Every kind</option>
            {(Object.keys(REPORT_KINDS) as ReportKind[]).map((k) => <option key={k} value={k}>{REPORT_KINDS[k]}</option>)}
          </select>
          <select className="in place-filter" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Person">
            <option value="">Everyone</option>
            {active.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <SearchBox value={q} onChange={setQ} placeholder="Title, words in the report, name" label="Search reports" />
        </div>
        <ReportTable rows={rows} empty={show === 'waiting' ? 'Nothing waiting. All reports are answered.' : 'No report matches.'} />
      </Card>
    </>
  )
}

/** A list of reports; tap one to read and answer it. Shared with My work. */
export function ReportTable({ rows, empty, mine }: { rows: WorkReport[]; empty: string; mine?: boolean }) {
  const { db } = useBooks()
  const sheets = useSheets()
  return (
    <DataTable rows={rows} rowKey={(r) => r.id} pageSize={15} exportName="employee-reports" onRow={(r) => sheets.open(ReportSheet, { id: r.id })} empty={empty}
      columns={[
        { label: 'Report', primary: true, render: (r) => <span className="two-line"><b>{r.title}</b><small className="t-muted">{r.id} · {REPORT_KINDS[r.kind]} · {r.from === r.to ? fdate(r.from) : `${fdate(r.from)} – ${fdate(r.to)}`}</small></span>, exportValue: (r) => r.title },
        ...(mine ? [] : [{ label: 'By', render: (r: WorkReport) => byId(db.employees, r.employeeId)?.name || '—' }]),
        { label: 'Sent', render: (r) => <span className="nowrap">{fdate(r.submittedAt.slice(0, 10))}</span>, exportValue: (r) => r.submittedAt.slice(0, 10) },
        { label: 'Files', align: 'right', render: (r) => { const n = r.attachments.length + r.replies.reduce((a, x) => a + (x.attachments?.length || 0), 0); return n ? <span className="nowrap"><Icon name="clip" size={13} /> {n}</span> : '' }, exportValue: (r) => r.attachments.length },
        { label: 'Replies', align: 'right', render: (r) => (r.replies.length ? r.replies.length : ''), exportValue: (r) => r.replies.length },
        { label: 'Status', render: (r) => <span className={cls('two-line')}><Pill tone={REPORT_TONE[r.status]}>{REPORT_STATUS[r.status]}</Pill>{r.reviewedBy && r.status !== 'submitted' && <small className="t-muted">by {r.reviewedBy}</small>}</span>, exportValue: (r) => REPORT_STATUS[r.status as ReportStatus] },
      ]} />
  )
}
