import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { AssistantReply } from '@shared/api/contract'
import { useBooks } from '@/core/store/context'
import { cls, Icon } from '@/ui'

interface Turn {
  role: 'user' | 'assistant'
  text: string
  error?: boolean
}

const SUGGEST = ['How is business today?', 'Who owes us the most?', 'Which products are low in stock?', 'Profit this month', 'আজকের বিক্রি কত?', 'Bills waiting for delivery']

/** **bold** inside a line, as React nodes (never as HTML). */
const inline = (text: string): ReactNode[] => text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part))

/** Plain text with "- " bullet lines, as paragraphs and lists. */
function Reply({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let items: string[] = []
  const flush = () => {
    if (items.length) blocks.push(<ul key={blocks.length}>{items.map((t, i) => <li key={i}>{inline(t)}</li>)}</ul>)
    items = []
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*[-•*]\s+(.*)$/)
    if (m) items.push(m[1])
    else {
      flush()
      if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>)
    }
  }
  flush()
  return <>{blocks}</>
}

/** The chat: a button in the corner, and a panel that stays open while moving between screens. */
export function Assistant() {
  const { call, session, db } = useBooks()
  const store = `sbt-chat:${session.tenantId}:${session.userId}`
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(store) || '[]') as Turn[]
    } catch {
      return []
    }
  })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [ai, setAi] = useState<boolean | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(store, JSON.stringify(turns.slice(-40)))
    } catch {
      /* the chat just won't survive a reload */
    }
  }, [turns, store])
  useEffect(() => {
    if (!open || ai !== null) return
    call<{ ai: boolean }>('GET', 'assistant').then((r) => setAi(r.ai)).catch(() => setAi(false))
  }, [open, ai, call])
  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: 'end' })
  }, [turns, busy, open])
  useEffect(() => {
    if (!open) return
    // on phones the chat covers the screen: keep the page behind it still, and let Escape (or a keyboard's back) close it
    document.documentElement.classList.add('chat-open')
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    // only jump into the box on a real keyboard; on phones the keyboard would cover half the chat at once
    if (window.matchMedia('(min-width: 861px)').matches) input.current?.focus()
    return () => {
      document.documentElement.classList.remove('chat-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  // the box grows with what is typed, up to about five lines
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [text, open])

  const ask = async (q: string) => {
    const question = q.trim()
    if (!question || busy) return
    const next = [...turns.filter((t) => !t.error), { role: 'user' as const, text: question }]
    setTurns(next)
    setText('')
    setBusy(true)
    try {
      const r = await call<AssistantReply>('POST', 'assistant/chat', { messages: next.map(({ role, text }) => ({ role, text })) })
      setAi(r.ai)
      setTurns((t) => [...t, { role: 'assistant', text: r.reply }])
    } catch (e) {
      setTurns((t) => [...t, { role: 'assistant', text: (e as Error).message, error: true }])
    } finally {
      setBusy(false)
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void ask(text)
  }

  return (
    <>
      <button type="button" className={cls('chat-fab', open && 'open')} aria-label={open ? 'Close assistant' : 'Ask the assistant'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name={open ? 'close' : 'sparkle'} size={22} />
        {!open && <span>Ask</span>}
      </button>
      {open && (
        <section className="chat-panel" role="dialog" aria-label="Assistant" data-no-print>
          <header className="chat-head">
            <span className="chat-avatar"><Icon name="sparkle" size={18} /></span>
            <div>
              <b>Assistant</b>
              <small>{ai === null ? 'Connecting…' : ai ? 'AI answers from your books' : 'Built-in answers from your books'}</small>
            </div>
            {turns.length > 0 && <button type="button" className="link" onClick={() => setTurns([])}>New chat</button>}
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button>
          </header>
          <div className="chat-body" data-no-translate>
            {!turns.length && (
              <div className="chat-hello">
                <p>Hi! Ask me anything about {db.company.name || 'your books'}: sales, dues, stock, cash, profit, deliveries, factory orders or shipments. English or বাংলা.</p>
                <div className="chips">{SUGGEST.map((s) => <button key={s} type="button" className="chip" onClick={() => void ask(s)}>{s}</button>)}</div>
                <small className="t-muted">I can only read, never change anything, and only what your role can see.</small>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={cls('chat-msg', t.role, t.error && 'error')}>
                {t.role === 'assistant' ? <Reply text={t.text} /> : t.text}
              </div>
            ))}
            {busy && <div className="chat-msg assistant typing" aria-label="Thinking"><span /><span /><span /></div>}
            <div ref={end} />
          </div>
          <form className="chat-input" onSubmit={submit}>
            <textarea ref={input} rows={1} value={text} maxLength={2000} placeholder="Ask about your business…" aria-label="Your question"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(text) } }} />
            <button type="submit" className="chat-send" disabled={busy || !text.trim()} aria-label="Send"><Icon name="send" size={18} /></button>
          </form>
        </section>
      )}
    </>
  )
}
