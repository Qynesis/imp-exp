import { useEffect, useState } from 'react'
import { byId, fshort, isAdmin, type MessageChannel, type MessageKind, type MessagingSettings } from '@shared/domain'
import { DEFAULT_TEMPLATES, MESSAGE_KINDS, MESSAGING_FIELDS, PLACEHOLDERS, type MessagingKeyName } from '@shared/messaging'
import type { FeatureRouteProps } from '@/app/features'
import { PageHead } from '@/components/PageHead'
import { ApiError, BACKEND } from '@/core/api/client'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Button, Card, cls, DataTable, Field, Pill, Segmented, useToast } from '@/ui'
import { SendOne } from './SendOne'
import { messagingOf, templateOf } from './useMessaging'

type Tab = 'send' | 'log' | 'settings'
const TABS: Tab[] = ['send', 'log', 'settings']
const CH: Record<MessageChannel, string> = { whatsapp: 'WhatsApp', sms: 'SMS' }
const KIND = Object.fromEntries(MESSAGE_KINDS.map((k) => [k.kind, k.label])) as Record<MessageKind, string>

/** #/messages: one message to one person, on WhatsApp or as an SMS. */
export default function MessagesPage({ params: [tabParam] }: FeatureRouteProps) {
  const { db } = useBooks()
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'send'
  const s = messagingOf(db)
  const log = db.messages || []
  return (
    <>
      <PageHead title="Messages" sub="Send one message to one person, on WhatsApp or as a mobile SMS." />
      {s.testMode && (
        <div className="alert-strip info" role="status">
          <div><b>Test mode is on</b><span>Messages are saved in the log but nothing is really sent. Turn it off under Settings when WhatsApp or SMS is ready.</span></div>
          <button type="button" className="link" onClick={() => go('messages/settings')}>Settings</button>
        </div>
      )}
      <Segmented<Tab> label="Messages section" value={tab} onChange={(t) => go(t === 'send' ? 'messages' : 'messages/' + t)} options={[
        { value: 'send', label: 'Send' }, { value: 'log', label: `Sent messages (${log.length})` }, { value: 'settings', label: 'Settings' },
      ]} />
      {tab === 'send' && (
        <Card icon="send" title="Send a message">
          <div className="card-body pt0"><SendOne /></div>
        </Card>
      )}
      {tab === 'log' && <LogTab />}
      {tab === 'settings' && <SettingsTab />}
    </>
  )
}

function LogTab() {
  const { db } = useBooks()
  const [kind, setKind] = useState<MessageKind | ''>('')
  const rows = (db.messages || []).filter((m) => !kind || m.kind === kind)
  return (
    <Card icon="receipt" title="Sent messages" sub="Every message, newest first: sent, opened in WhatsApp, or failed with the reason."
      action={<select className="in narrow-select" value={kind} onChange={(e) => setKind(e.target.value as MessageKind | '')} aria-label="Kind">
        <option value="">All kinds</option>{MESSAGE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
      </select>}>
      <DataTable pageSize={25} rows={rows} rowKey={(m) => m.id} empty="Nothing sent yet."
        columns={[
          { label: 'To', primary: true, render: (m) => <span className="two-line"><b>{byId(db.dealers, m.dealerId)?.name || m.name || m.to}</b><small>{fshort(m.date)} · {CH[m.channel]} · {m.to}</small></span> },
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
