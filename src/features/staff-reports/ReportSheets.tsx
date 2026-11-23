import { useState, type FormEvent } from 'react'
import {
  byId, fdate, REPORT_KINDS, REPORT_STATUS, REPORT_TONE, reportAccess, reportPeriod, todayISO, type Attachment, type ReportKind,
} from '@shared/domain'
import { AttachField, FileList } from '@/components/attachments/Attachments'
import { useBooks } from '@/core/store/context'
import { Button, Field, Icon, Pill, Sheet, useConfirm, useSheetItem, useSheets, useToast, type SheetComponent } from '@/ui'

const when = (iso: string) => `${fdate(iso.slice(0, 10))} ${iso.slice(11, 16)}`

/** Write a report, or change one still waiting or sent back for changes. */
export const WriteReportSheet: SheetComponent<{ id?: string }> = ({ id }) => {
  const { db, session, workReport } = useBooks()
  const toast = useToast()
  const { close } = useSheetItem()
  const me = byId(db.users, session.userId)
  const emp = byId(db.employees, me?.employeeId)
  const cur = (db.workReports || []).find((r) => r.id === id)
  const first = reportPeriod('daily')
  const [kind, setKind] = useState<ReportKind>(cur?.kind || 'daily')
  const [from, setFrom] = useState(cur?.from || first.from)
  const [to, setTo] = useState(cur?.to || first.to)
  const [title, setTitle] = useState(cur?.title || '')
  const [body, setBody] = useState(cur?.body || '')
  const [files, setFiles] = useState<Attachment[]>(cur?.attachments || [])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!emp) return <Sheet title="Write a report"><p className="t-muted">Your login is not linked to an employee. Ask the office to link it.</p></Sheet>
  const manager = byId(db.employees, emp.managerId)
  const pickKind = (k: ReportKind) => {
    setKind(k)
    if (!cur) { const p = reportPeriod(k); setFrom(p.from); setTo(p.to) }
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await workReport({ op: 'submit', id: cur?.id, kind, from, to, title, body, attachments: files })
      toast(cur ? 'Report sent again' : `Report sent${manager ? ` to ${manager.name} and the office` : ' to the office'}`)
      close()
    } catch (x) {
      setErr((x as Error).message)
      setBusy(false)
    }
  }
  return (
    <Sheet title={cur ? `Edit ${cur.id}` : 'Write a report'} crumb="My work" wide onSubmit={(e) => void submit(e)}
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" icon="send" disabled={busy}>{busy ? 'Sending…' : cur?.status === 'changes' ? 'Send again' : 'Send report'}</Button></>}>
      {err && <div className="err" role="alert">{err}</div>}
      {cur?.status === 'changes' && <div className="trade-alert info">Asked to change: “{[...cur.replies].reverse().find((r) => r.status === 'changes')?.text}”</div>}
      <div className="form-grid">
        <Field label="Kind">
          <select className="in" value={kind} onChange={(e) => pickKind(e.target.value as ReportKind)}>{(Object.keys(REPORT_KINDS) as ReportKind[]).map((k) => <option key={k} value={k}>{REPORT_KINDS[k]}</option>)}</select>
        </Field>
        <Field label="Goes to"><input className="in" disabled value={manager ? `${manager.name} (manager) and the office` : 'The office'} /></Field>
        <Field label="From"><input className="in" type="date" max={todayISO()} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="in" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Title" wide><input className="in" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'incident' ? 'e.g. 12 cartons damaged at unloading' : kind === 'weekly' ? 'e.g. Week 47: Dhaka North sales and collections' : 'e.g. Stock count and receiving, 22 Nov'} maxLength={160} /></Field>
        <label className="field wide">
          <span className="field-label">Report</span>
          <textarea className="in report-text" value={body} onChange={(e) => setBody(e.target.value)} rows={10}
            placeholder={kind === 'incident' ? 'What happened, when and where, who was there, what was done, and what is needed now.' : 'What you did, results and numbers, problems, and the plan for next time.'} />
          <small className="t-muted">{body.trim().length} characters</small>
        </label>
        <AttachField value={files} onChange={setFiles} label="Files" hint="optional: photos, PDF, Word, Excel — up to 10" button="Attach file" />
      </div>
    </Sheet>
  )
}
WriteReportSheet.readOnlySafe = true

/** One report with its conversation; the writer can edit or withdraw it, a reviewer can answer it. */
export const ReportSheet: SheetComponent<{ id: string }> = ({ id }) => {
  const { db, session, workReport } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const r = (db.workReports || []).find((x) => x.id === id)
  if (!r) return null
  const e = byId(db.employees, r.employeeId)
  const access = reportAccess(db, session.userId, r)
  const editable = access.own && (r.status === 'submitted' || r.status === 'changes')
  const send = async (body: Record<string, unknown>, done: string) => {
    setBusy(true)
    try {
      await workReport({ id: r.id, text, attachments: files, ...body })
      setText('')
      setFiles([])
      toast(done)
    } catch (x) {
      toast((x as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet title={r.title} crumb={`${r.id} · ${REPORT_KINDS[r.kind]}`} wide
      footer={editable ? (
        <>
          {r.status === 'submitted' && <Button variant="secondary" onClick={async () => {
            if (await confirm({ title: `Withdraw ${r.id}?`, message: 'Your manager and the office will see it was withdrawn.', confirmLabel: 'Withdraw' })) void send({ op: 'withdraw' }, 'Report withdrawn')
          }}>Withdraw</Button>}
          <Button icon="edit" onClick={() => sheets.open(WriteReportSheet, { id: r.id })}>{r.status === 'changes' ? 'Change and send again' : 'Edit'}</Button>
        </>
      ) : undefined}>
      <div className="report-head">
        <span className="emp-avatar sm" aria-hidden="true">{(e?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
        <div>
          <b>{e?.name || 'Employee'}</b>
          <span className="t-muted">{[e?.role, e?.department].filter(Boolean).join(' · ')} · {r.from === r.to ? fdate(r.from) : `${fdate(r.from)} – ${fdate(r.to)}`} · sent {when(r.submittedAt)}{r.version > 1 ? ` · version ${r.version}` : ''}</span>
        </div>
        <Pill tone={REPORT_TONE[r.status]}>{REPORT_STATUS[r.status]}</Pill>
      </div>
      <div className="report-body">{r.body}</div>
      {r.attachments.length > 0 && <FileList files={r.attachments} />}

      <h3 className="sheet-h">Conversation</h3>
      <ol className="report-thread">
        {r.replies.map((x) => (
          <li key={x.id} className={x.byEmployee === r.employeeId ? 'mine' : 'theirs'}>
            <div className="report-bubble">
              <small className="t-muted">{x.by} · {when(x.at)}</small>
              {x.status && <Pill tone={REPORT_TONE[x.status]}>{REPORT_STATUS[x.status]}</Pill>}
              {x.text && <p>{x.text}</p>}
              {x.attachments && <FileList files={x.attachments} />}
            </div>
          </li>
        ))}
        {!r.replies.length && <li className="t-muted">No replies yet.</li>}
      </ol>

      {r.status !== 'withdrawn' && access.read && (
        <div className="report-reply">
          <textarea className="in" rows={3} value={text} onChange={(x) => setText(x.target.value)} placeholder={access.review ? 'Feedback for the employee (needed when asking for changes)' : 'Write a reply'} aria-label="Reply" />
          <AttachField value={files} onChange={setFiles} label="Files" hint="optional" button="Attach" />
          <div className="btn-row">
            <Button variant="secondary" icon="send" disabled={busy || (!text.trim() && !files.length)} onClick={() => void send({ op: 'reply' }, 'Reply sent')}>Reply</Button>
            {access.review && (
              <>
                <Button variant="secondary" disabled={busy} onClick={() => void send({ op: 'review', status: 'changes' }, 'Sent back for changes')}><Icon name="undo" size={15} /> Ask for changes</Button>
                <Button variant="secondary" disabled={busy} onClick={() => void send({ op: 'review', status: 'reviewed' }, 'Marked as seen')}>Mark seen</Button>
                <Button icon="check" disabled={busy} onClick={() => void send({ op: 'review', status: 'approved' }, 'Report approved')}>Approve</Button>
              </>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}
ReportSheet.readOnlySafe = true
