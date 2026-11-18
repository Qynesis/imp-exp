import { useEffect, useState } from 'react'
import { byId, dealerLedger, fshort, isAdmin, receivables, tk, todayISO, type MessageChannel, type MessageKind, type MessagingSettings } from '@shared/domain'
import { DEFAULT_TEMPLATES, MESSAGE_KINDS, MESSAGING_FIELDS, PLACEHOLDERS, renderTemplate, type MessagingKeyName } from '@shared/messaging'
import type { FeatureRouteProps } from '@/app/features'
import { PageHead } from '@/components/PageHead'
import { ApiError, BACKEND } from '@/core/api/client'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Button, Card, cls, DataTable, Field, Pill, Segmented, Stat, useToast } from '@/ui'
import { messagingOf, templateOf, useMessaging, vars } from './useMessaging'

type Tab = 'send' | 'reminders' | 'log' | 'settings'
const TABS: Tab[] = ['send', 'reminders', 'log', 'settings']
const CH: Record<MessageChannel, string> = { whatsapp: 'WhatsApp', sms: 'SMS' }
const KIND = Object.fromEntries(MESSAGE_KINDS.map((k) => [k.kind, k.label])) as Record<MessageKind, string>

/** #/messages: send to dealers by WhatsApp or SMS, chase dues, and see everything that went out. */
export default function MessagesPage({ params: [tabParam] }: FeatureRouteProps) {
  const { db } = useBooks()
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'send'
  const s = messagingOf(db)
  const log = db.messages || []
  const month = todayISO().slice(0, 7)
  const thisMonth = log.filter((m) => m.date.startsWith(month))
  return (
    <>
      <PageHead title="Messages" sub="Estimates, bills, payment receipts, due reminders and greetings to dealers on WhatsApp or SMS, by themselves or when you choose." />
      {s.testMode && (
        <div className="alert-strip info" role="status">
          <div><b>Test mode is on</b><span>Messages are logged here but nothing is sent. Turn it off under Settings when WhatsApp or SMS is set up.</span></div>
          <button type="button" className="link" onClick={() => go('messages/settings')}>Settings</button>
        </div>
      )}
      <div className="stats">
        <Stat icon="send" label="Sent this month" value={String(thisMonth.filter((m) => m.status !== 'failed').length)} sub={`${thisMonth.filter((m) => m.channel === 'whatsapp').length} WhatsApp · ${thisMonth.filter((m) => m.channel === 'sms').length} SMS`} />
        <Stat icon="alert" label="Failed" value={String(thisMonth.filter((m) => m.status === 'failed').length)} tone={thisMonth.some((m) => m.status === 'failed') ? 'warn' : undefined} sub="This month" />
        <Stat icon="clock" label="Dealers to remind" value={String(receivables(db).rows.filter((r) => r.overdue).length)} sub={`Overdue ${s.reminderDays}+ days`} />
        <Stat icon="settings" label="Channels" value={[s.whatsapp !== 'off' && 'WhatsApp', s.sms !== 'off' && 'SMS'].filter(Boolean).join(' + ') || 'None'} sub={s.whatsapp === 'cloud' ? 'WhatsApp sends by itself' : s.whatsapp === 'link' ? 'WhatsApp opens for you to send' : 'WhatsApp off'} />
      </div>
      <Segmented<Tab> label="Messages section" value={tab} onChange={(t) => go(t === 'send' ? 'messages' : 'messages/' + t)} options={[
        { value: 'send', label: 'Send' }, { value: 'reminders', label: 'Due reminders' }, { value: 'log', label: `Log (${log.length})` }, { value: 'settings', label: 'Settings' },
      ]} />
      {tab === 'send' && <SendTab />}
      {tab === 'reminders' && <RemindersTab />}
      {tab === 'log' && <LogTab />}
      {tab === 'settings' && <SettingsTab />}
    </>
  )
}

/** Run a list of sends one after another and say how it went. */
function useBatch() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = async (jobs: (() => Promise<{ ok: boolean }>)[]) => {
    setBusy(true)
    let ok = 0
    for (const j of jobs) if ((await j()).ok) ok++
    setBusy(false)
    toast(`${ok} of ${jobs.length} sent${ok < jobs.length ? '; see the log for the rest' : ''}`)
  }
  return { busy, run }
}

function SendTab() {
  const { db } = useBooks()
  const msg = useMessaging()
  const { busy, run } = useBatch()
  const areas = [...new Set(db.dealers.map((d) => d.area).filter(Boolean))]
  const [who, setWho] = useState<'all' | 'area' | 'pick'>('all')
  const [area, setArea] = useState(areas[0] || '')
  const [picked, setPicked] = useState<string[]>([])
  const [text, setText] = useState(() => templateOf(db, 'occasional'))
  const [chans, setChans] = useState<MessageChannel[]>(msg.channels.slice(0, 1))
  const to = db.dealers.filter((d) => (who === 'all' ? true : who === 'area' ? d.area === area : picked.includes(d.id)))
  const preview = to[0] ? renderTemplate(text, vars.occasional(db, to[0].id)) : renderTemplate(text, { company: db.company.name, dealer: 'Dealer' })
  const link = msg.settings.whatsapp === 'link' && !msg.settings.testMode && chans.includes('whatsapp')
  const IDEAS = [
    ['Eid greeting', DEFAULT_TEMPLATES.occasional],
    ['New product', 'Dear {dealer}, {company} has a new product in stock. Ask your sales officer for the price list. Thank you.'],
    ['Price change', 'Dear {dealer}, from next month our prices change. Please call {company} for the new list. Orders placed this month keep the old price.'],
    ['Holiday closing', 'Dear {dealer}, {company} will be closed for the holidays. Please place your orders before then. Thank you.'],
  ]
  return (
    <Card icon="send" title="Send a message" sub="Greetings, new products, price changes: to every dealer, an area, or the ones you pick. {dealer} and other words in braces fill in for each one.">
      <div className="card-body pt0 form-grid">
        <div className="field">
          <span className="field-label">To</span>
          <Segmented<'all' | 'area' | 'pick'> label="Recipients" value={who} onChange={setWho} options={[{ value: 'all', label: `All dealers (${db.dealers.length})` }, { value: 'area', label: 'One area' }, { value: 'pick', label: 'Pick dealers' }]} />
        </div>
        {who === 'area' && <Field label="Area"><select className="in" value={area} onChange={(e) => setArea(e.target.value)}>{areas.map((a) => <option key={a}>{a}</option>)}</select></Field>}
        {who === 'pick' && (
          <div className="field wide chips">
            {db.dealers.map((d) => <button key={d.id} type="button" className={cls('chip', picked.includes(d.id) && 'on')} aria-pressed={picked.includes(d.id)} onClick={() => setPicked(picked.includes(d.id) ? picked.filter((x) => x !== d.id) : [...picked, d.id])}>{d.name}</button>)}
          </div>
        )}
        <div className="field wide">
          <span className="field-label">Start from</span>
          <div className="chips">{IDEAS.map(([l, t]) => <button key={l} type="button" className="chip" onClick={() => setText(t)}>{l}</button>)}</div>
        </div>
        <Field label="Message" wide hint={`${text.length} characters${text.length > 160 ? ' · more than one SMS' : ''}. Fill-ins: ${PLACEHOLDERS.join(' ')}`}>
          <textarea className="in" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="field wide"><span className="field-label">Preview{to[0] ? ` for ${to[0].name}` : ''}</span><p className="msg-preview">{preview}</p></div>
        <div className="field">
          <span className="field-label">Send by</span>
          {msg.channels.length ? (
            <div className="chips">{msg.channels.map((c) => <button key={c} type="button" className={cls('chip', chans.includes(c) && 'on')} aria-pressed={chans.includes(c)} onClick={() => setChans(chans.includes(c) ? chans.filter((x) => x !== c) : [...chans, c])}>{CH[c]}</button>)}</div>
          ) : <small>No channel is on. Switch on WhatsApp or SMS under Settings.</small>}
        </div>
        <div className="field btn-row tight-row">
          {link ? (
            <small>WhatsApp is in link mode: open each chat below and press send.</small>
          ) : (
            <Button icon="send" disabled={busy || !to.length || !chans.length || !text.trim()} onClick={() => void run(to.flatMap((d) => chans.map((c) => () => msg.send('occasional', c, d.id, renderTemplate(text, vars.occasional(db, d.id)))))) }>
              {busy ? 'Sending…' : `Send to ${to.length} dealer${to.length === 1 ? '' : 's'}`}
            </Button>
          )}
        </div>
      </div>
      {link && (
        <div className="rows">
          {to.map((d) => (
            <div key={d.id} className="row-wrap">
              <div className="row"><span className="name">{d.name}</span><span className="meta">{d.phone || 'No phone'}</span><span className="amt" /></div>
              <Button size="sm" variant="secondary" icon="send" disabled={!d.phone} onClick={() => void msg.send('occasional', 'whatsapp', d.id, renderTemplate(text, vars.occasional(db, d.id)))}>Open WhatsApp</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function RemindersTab() {
  const { db } = useBooks()
  const msg = useMessaging()
  const toast = useToast()
  const { busy, run } = useBatch()
  const [chan, setChan] = useState<MessageChannel>(msg.channels[0] || 'whatsapp')
  const rows = receivables(db).rows.filter((r) => r.due > 0)
  const lastSent = (dealerId: string) => (db.messages || []).find((m) => m.dealerId === dealerId && m.kind === 'reminder' && m.status !== 'failed')?.date
  const overdue = rows.filter((r) => r.overdue)
  return (
    <Card icon="clock" title="Due reminders" sub={`Dealers who owe money. Automatic reminders go ${msg.settings.reminderDays} days after a bill falls due, then every ${msg.settings.reminderDays} days, when switched on under Settings.`}
      action={<div className="btn-row tight-row">
        {msg.channels.length > 1 && <Segmented<MessageChannel> label="Channel" value={chan} onChange={setChan} options={msg.channels.map((c) => ({ value: c, label: CH[c] }))} />}
        {!(msg.settings.whatsapp === 'link' && chan === 'whatsapp' && !msg.settings.testMode) && (
          <Button size="sm" icon="send" disabled={busy || !overdue.length || !msg.channels.length} onClick={() => void run(overdue.map((r) => () => msg.send('reminder', chan, r.dealer.id, msg.render('reminder', vars.reminder(db, r.dealer.id)), dealerLedger(db, r.dealer.id).open[0]?.id)))}>
            {busy ? 'Sending…' : `Remind all ${overdue.length} overdue`}
          </Button>
        )}
      </div>}>
      <DataTable rows={rows} rowKey={(r) => r.dealer.id} empty="No dealer owes anything."
        columns={[
          { label: 'Dealer', primary: true, render: (r) => <span className="two-line"><b>{r.dealer.name}</b><small>{r.dealer.phone || 'No phone'}</small></span> },
          { label: 'Due', align: 'right', render: (r) => <b>{tk(r.due)}</b> },
          { label: 'Status', render: (r) => <Pill tone={r.overdue ? 'warn' : 'neutral'}>{r.statusText}</Pill> },
          { label: 'Last reminder', render: (r) => <span className="t-muted">{lastSent(r.dealer.id) ? fshort(lastSent(r.dealer.id)) : 'Never'}</span> },
          { label: '', align: 'right', render: (r) => (
            <Button size="sm" variant="secondary" icon="send" className="edit-only" disabled={!msg.channels.length}
              onClick={async (e) => { e.stopPropagation(); const res = await msg.send('reminder', chan, r.dealer.id, msg.render('reminder', vars.reminder(db, r.dealer.id)), dealerLedger(db, r.dealer.id).open[0]?.id); toast(res.text) }}>Remind</Button>
          ) },
        ]} />
    </Card>
  )
}

function LogTab() {
  const { db } = useBooks()
  const [kind, setKind] = useState<MessageKind | ''>('')
  const rows = (db.messages || []).filter((m) => !kind || m.kind === kind)
  return (
    <Card icon="receipt" title="Message log" sub="Everything sent, opened in WhatsApp, or failed, newest first."
      action={<select className="in narrow-select" value={kind} onChange={(e) => setKind(e.target.value as MessageKind | '')} aria-label="Kind">
        <option value="">All kinds</option>{MESSAGE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
      </select>}>
      <DataTable pageSize={25} rows={rows} rowKey={(m) => m.id} empty="Nothing sent yet."
        columns={[
          { label: 'To', primary: true, render: (m) => <span className="two-line"><b>{byId(db.dealers, m.dealerId)?.name || m.to}</b><small>{fshort(m.date)} · {CH[m.channel]} · {m.to}</small></span> },
          { label: 'Kind', render: (m) => <span className="two-line"><span>{KIND[m.kind]}</span>{m.ref && <small className="t-muted">{m.ref}</small>}</span> },
          { label: 'Message', render: (m) => <span className="t-muted msg-cell">{m.text}</span> },
          { label: 'Status', align: 'right', render: (m) => <span className="two-line right"><Pill tone={m.status === 'failed' ? 'warn' : m.status === 'opened' ? 'info' : 'good'}>{m.status === 'failed' ? 'Failed' : m.status === 'opened' ? 'Opened in WhatsApp' : m.test ? 'Sent (test)' : 'Sent'}</Pill>{m.error && <small className="t-warn">{m.error}</small>}</span> },
        ]} />
    </Card>
  )
}

type KeyInfo = Record<MessageChannel, { hints: Partial<Record<MessagingKeyName, string>>; configured: boolean; fromServer: boolean }>

function SettingsTab() {
  const { db, act, call, session } = useBooks()
  const toast = useToast()
  const s = messagingOf(db)
  const admin = isAdmin(db, session.userId)
  const [info, setInfo] = useState<KeyInfo | null>(null)
  const [open, setOpen] = useState<MessageChannel | null>(null)
  const [vals, setVals] = useState<Partial<Record<MessagingKeyName, string>>>({})
  const [kind, setKind] = useState<MessageKind>('invoice')
  const [draft, setDraft] = useState(() => templateOf(db, 'invoice'))
  const load = () => call<KeyInfo>('GET', 'messaging/settings').then(setInfo).catch(() => undefined)
  useEffect(() => {
    if (admin) void load()
  }, [admin]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = (patch: Partial<MessagingSettings>) => act('saveMessaging', { ...s, ...patch })
  const toggleAuto = (k: MessageKind, c: MessageChannel) => {
    const cur = s.auto[k] || []
    save({ auto: { ...s.auto, [k]: cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c] } })
  }
  const saveKeys = async (ch: MessageChannel, clear = false) => {
    try {
      await call('PUT', 'messaging/settings', clear ? { channel: ch, clear: true } : { channel: ch, values: vals })
      setVals({})
      setOpen(null)
      await load()
      toast(clear ? 'Keys removed' : 'Keys saved')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save')
    }
  }
  const pickKind = (k: MessageKind) => {
    setKind(k)
    setDraft(templateOf(db, k))
  }

  return (
    <div className="stack">
      <Card icon="settings" title="Channels">
        <div className="card-body pt0 form-grid">
          <div className="field">
            <span className="field-label">WhatsApp</span>
            <Segmented<MessagingSettings['whatsapp']> label="WhatsApp" value={s.whatsapp} onChange={(x) => save({ whatsapp: x })} options={[{ value: 'off', label: 'Off' }, { value: 'link', label: 'Open WhatsApp' }, { value: 'cloud', label: 'Business API' }]} />
            <small>{s.whatsapp === 'link' ? 'Free: WhatsApp opens with the message typed in, a person presses send. Cannot send by itself.' : s.whatsapp === 'cloud' ? 'Sends by itself through the WhatsApp Business (Cloud) API. Needs a Meta business account and an approved template.' : 'No WhatsApp messages.'}</small>
          </div>
          <div className="field">
            <span className="field-label">SMS</span>
            <Segmented<MessagingSettings['sms']> label="SMS" value={s.sms} onChange={(x) => save({ sms: x })} options={[{ value: 'off', label: 'Off' }, { value: 'gateway', label: 'SMS gateway' }]} />
            <small>{s.sms === 'gateway' ? 'Sends through your SMS gateway (BulkSMSBD or another). Each message costs gateway credit.' : 'No SMS.'}</small>
          </div>
          <div className="field">
            <span className="field-label">Test mode</span>
            <Segmented<'on' | 'off'> label="Test mode" value={s.testMode ? 'on' : 'off'} onChange={(x) => save({ testMode: x === 'on' })} options={[{ value: 'on', label: 'On (nothing sent)' }, { value: 'off', label: 'Off (send for real)' }]} />
          </div>
          <Field label="Remind overdue dealers every (days)">
            <input className="in" inputMode="numeric" value={String(s.reminderDays)} onChange={(e) => save({ reminderDays: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
          </Field>
        </div>
      </Card>

      <Card icon="clock" title="Send by themselves" sub="Tick where each kind of message should go out on its own. Untick everything to send only by hand.">
        <table className="dt auto-table">
          <thead><tr><th>Message</th><th>When</th><th className="r">WhatsApp</th><th className="r">SMS</th></tr></thead>
          <tbody>
            {MESSAGE_KINDS.filter((k) => k.kind !== 'occasional').map((k) => (
              <tr key={k.kind}>
                <td data-label="Message" className="primary"><b>{k.label}</b></td>
                <td data-label="When" className="t-muted">{k.when}</td>
                {(['whatsapp', 'sms'] as MessageChannel[]).map((c) => (
                  <td key={c} data-label={CH[c]} className="r">
                    <input type="checkbox" aria-label={`${k.label} by ${CH[c]}`} checked={(s.auto[k.kind] || []).includes(c)} disabled={c === 'whatsapp' ? s.whatsapp === 'off' : s.sms === 'off'} onChange={() => toggleAuto(k.kind, c)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {s.whatsapp === 'link' && <p className="card-body t-muted small-note">In “Open WhatsApp” mode an automatic WhatsApp opens the chat ready to send; only the Business API sends with nobody pressing anything.</p>}
      </Card>

      <Card icon="edit" title="Message wording" sub={`Fill-ins: ${PLACEHOLDERS.join(' ')}`}>
        <div className="card-body pt0 form-grid">
          <div className="field wide chips">{MESSAGE_KINDS.map((k) => <button key={k.kind} type="button" className={cls('chip', kind === k.kind && 'on')} onClick={() => pickKind(k.kind)}>{k.label}</button>)}</div>
          <Field label={`${KIND[kind]} message`} wide hint={`${draft.length} characters`}><textarea className="in" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} /></Field>
          <div className="field wide btn-row tight-row">
            <Button size="sm" icon="check" onClick={() => { save({ templates: { ...s.templates, [kind]: draft } }); toast('Wording saved') }}>Save wording</Button>
            <Button size="sm" variant="secondary" icon="restore" onClick={() => { setDraft(DEFAULT_TEMPLATES[kind]); const t = { ...s.templates }; delete t[kind]; save({ templates: t }) }}>Back to the standard wording</Button>
          </div>
        </div>
      </Card>

      {admin ? (
        <div className="courier-grid">
          {(['whatsapp', 'sms'] as MessageChannel[]).map((ch) => {
            const i = info?.[ch]
            return (
              <section key={ch} className="card courier-card on">
                <header className="courier-head">
                  <div><b>{ch === 'whatsapp' ? 'WhatsApp Business API' : 'SMS gateway'}</b><span>{i?.configured ? <Pill tone="good">Keys saved{i.fromServer ? ' on server' : ''}</Pill> : <Pill tone="warn">Needs keys</Pill>}</span></div>
                  {open !== ch && <Button size="sm" variant="secondary" icon="edit" onClick={() => { setOpen(ch); setVals({}) }}>{i?.configured ? 'Change keys' : 'Add keys'}</Button>}
                </header>
                {open === ch && (
                  <div className="form-grid">
                    {MESSAGING_FIELDS[ch].map((f) => (
                      <Field key={f.key} label={f.label} wide hint={i?.hints[f.key] ? `Saved: ${i.hints[f.key]}. Leave empty to keep it.` : f.hint}>
                        <input className="in" type={f.secret ? 'password' : 'text'} value={vals[f.key] || ''} autoComplete={f.secret ? 'new-password' : 'off'} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
                      </Field>
                    ))}
                    <div className="field wide btn-row tight-row">
                      <Button size="sm" icon="check" onClick={() => void saveKeys(ch)}>Save keys</Button>
                      <Button size="sm" variant="secondary" onClick={() => setOpen(null)}>Close</Button>
                      {i?.configured && !i.fromServer && <Button size="sm" variant="danger" icon="trash" onClick={() => void saveKeys(ch, true)}>Remove keys</Button>}
                    </div>
                  </div>
                )}
              </section>
            )
          })}
          {BACKEND === 'local' && <p className="note">This copy runs in the browser only, so keys stay in this browser and messages go straight from it. Run the app with the server to keep keys off the device; they can then live in the server’s .env.</p>}
        </div>
      ) : <p className="t-muted">Only an admin can add WhatsApp and SMS keys.</p>}
    </div>
  )
}
