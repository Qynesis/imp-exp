import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Brief, InsightWindow } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Button, Card, Empty, Icon, Pill } from '@/ui'
import { Spinner } from '@/ui/Button'

interface BriefResponse { brief: Brief; ai: boolean; error?: string; at: string }

const SUGGESTED = [
  'Which dealers should I visit this week, and why?',
  'What should I reorder now, and how much?',
  'Why did profit change this period?',
  'Where can I raise prices without losing sales?',
  'Will I have enough cash for the next three months?',
]

/**
 * The AI analyst: a briefing written from a digest of the books (only what this role may see), and
 * answers to questions about it. Without an AI key on the server, the briefing is put together from
 * the numbers and says so.
 */
export function AiAnalyst({ days }: { days: InsightWindow }) {
  const { call } = useBooks()
  const [res, setRes] = useState<BriefResponse | null>(null)
  // the first briefing starts loading as soon as the tab opens (the page remounts this for each period)
  const [busy, setBusy] = useState<'' | 'brief' | 'ask'>('brief')
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState<{ q: string; a: string }[]>([])

  const load = useCallback(async (question?: string) => {
    setBusy(question ? 'ask' : 'brief')
    setErr('')
    try {
      const r = await call<BriefResponse>('POST', 'insights/brief', { days, question })
      if (question) setAsked((x) => [{ q: question, a: r.brief.answer || r.error || 'No answer came back. Try asking another way.' }, ...x].slice(0, 6))
      else setRes(r)
      if (question) setQ('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The analyst could not be reached. Check your connection and try again.')
    } finally {
      setBusy('')
    }
  }, [call, days])

  useEffect(() => {
    let live = true
    call<BriefResponse>('POST', 'insights/brief', { days })
      .then((r) => { if (live) setRes(r) })
      .catch((e: unknown) => { if (live) setErr(e instanceof Error ? e.message : 'The analyst could not be reached. Check your connection and try again.') })
      .finally(() => { if (live) setBusy('') })
    return () => { live = false }
  }, [call, days])

  const ask = (e: FormEvent) => {
    e.preventDefault()
    const text = q.trim()
    if (text.length < 4) return setErr('Type a question first.')
    void load(text)
  }

  const b = res?.brief
  return (
    <>
      <Card icon="sparkle" title="AI business briefing" sub={`Written from your books for the last ${days} days. Numbers are rounded; nothing is changed.`}
        action={<Button size="sm" variant="secondary" icon="undo" loading={busy === 'brief'} onClick={() => void load()}>{busy === 'brief' ? 'Thinking…' : 'Refresh'}</Button>}>
        <div className="card-body pt0">
          {res && (
            <p className="brief-source">
              {b?.source === 'ai' ? <Pill tone="good">Written by AI</Pill> : <Pill tone="neutral">Worked out from your numbers</Pill>}
              <small className="t-muted">{new Date(res.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
              {!res.ai && <small className="t-muted">The AI is not set up on this server (ANTHROPIC_API_KEY), so this briefing uses rules.</small>}
              {res.error && <small className="t-warn">AI unavailable: {res.error} Showing the rules briefing instead.</small>}
            </p>
          )}
          {err && <div className="err" role="alert">{err}</div>}
          {!b && busy === 'brief' && <div className="brief-wait" role="status"><Spinner size={22} /> <span>Reading your sales, stock, dues and cash…</span></div>}
          {!b && !busy && !err && <Empty>No briefing yet.</Empty>}
          {b && (
            <div className={busy === 'brief' ? 'brief is-stale' : 'brief'}>
              <h3 className="brief-headline">{b.headline}</h3>
              <p>{b.summary}</p>
              <div className="two-col">
                <div className="brief-list good"><b><Icon name="check" size={16} /> Going well</b><ul>{b.wins.length ? b.wins.map((x) => <li key={x}>{x}</li>) : <li className="t-muted">Nothing stands out yet.</li>}</ul></div>
                <div className="brief-list warn"><b><Icon name="alert" size={16} /> Watch out</b><ul>{b.risks.length ? b.risks.map((x) => <li key={x}>{x}</li>) : <li className="t-muted">No clear risks.</li>}</ul></div>
              </div>
              <p className="form-sub">Recommended decisions</p>
              <ol className="brief-actions">
                {b.actions.map((a, i) => (
                  <li key={a.title + i}>
                    <span className="brief-num">{i + 1}</span>
                    <span><b>{a.title}</b><small className="t-muted">{a.why}</small></span>
                    {a.impact && <Pill tone="info">{a.impact}</Pill>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </Card>

      <Card icon="chat" title="Ask the analyst" sub="A question about your business; the answer uses the same figures as the briefing.">
        <form className="card-body pt0 ask-form" onSubmit={ask} noValidate>
          <div className="ask-row">
            <input className="in" value={q} onChange={(e) => setQ(e.target.value)} maxLength={600} placeholder="e.g. Which dealers are slipping, and what should I do?" aria-label="Your question" />
            <Button type="submit" icon="send" loading={busy === 'ask'} disabled={!!busy}>{busy === 'ask' ? 'Thinking…' : 'Ask'}</Button>
          </div>
          <div className="ask-chips">{SUGGESTED.map((s) => <button key={s} type="button" className="chip" disabled={!!busy} onClick={() => void load(s)}>{s}</button>)}</div>
          {asked.map((x) => (
            <div key={x.q} className="ask-answer">
              <b>{x.q}</b>
              <p>{x.a}</p>
            </div>
          ))}
        </form>
      </Card>
    </>
  )
}
