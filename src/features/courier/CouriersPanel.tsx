import { useEffect, useState } from 'react'
import { isAdmin, todayISO, type CourierProvider } from '@shared/domain'
import { COURIER_PROVIDERS, courierLabel, FIELDS, hasBalance, needsKeys, type KeyName } from '@shared/courier'
import { ApiError, BACKEND } from '@/core/api/client'
import { useBooks } from '@/core/store/context'
import { Button, Card, cls, Field, Pill, Segmented, useToast } from '@/ui'

type Info = Record<CourierProvider, { hints: Partial<Record<KeyName, string>>; configured: boolean; fromServer: boolean }>

/** Which couriers we use, their keys, the default one and automatic booking. Admins only. */
export function CouriersPanel() {
  const { db, act, call, session } = useBooks()
  const toast = useToast()
  const cur = db.company.courier || { provider: 'demo' as CourierProvider, autoBook: false }
  const enabled = new Set<CourierProvider>([cur.provider, ...(cur.enabled || [])])
  const [info, setInfo] = useState<Info | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [open, setOpen] = useState<CourierProvider | null>(null)
  const [vals, setVals] = useState<Partial<Record<KeyName, string>>>({})
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState<Partial<Record<CourierProvider, { ok: boolean; text: string }>>>({})
  const admin = isAdmin(db, session.userId)

  const load = () => call<Info>('GET', 'courier/settings').then(setInfo).catch((e: unknown) => setLoadErr(e instanceof ApiError ? e.message : 'Could not load the courier settings.'))
  useEffect(() => {
    if (admin) void load()
  }, [admin]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = (patch: Partial<typeof cur>) => {
    const next = { ...cur, ...patch }
    act('saveCourierSettings', { ...next, enabled: [...new Set([next.provider, ...(next.enabled || [])])] })
  }
  const toggle = (p: CourierProvider) => {
    if (p === cur.provider) return toast('Make another courier the default before turning this one off')
    const list = enabled.has(p) ? [...enabled].filter((x) => x !== p) : [...enabled, p]
    save({ enabled: list })
  }
  const run = async (p: CourierProvider, what: 'save' | 'clear' | 'test') => {
    setBusy(p + what)
    try {
      if (what !== 'test') {
        await call('PUT', 'courier/settings', what === 'clear' ? { provider: p, clear: true } : { provider: p, values: vals })
        setVals({})
        await load()
        toast(what === 'clear' ? `${courierLabel(p)} keys removed` : `${courierLabel(p)} keys saved`)
        if (what === 'clear') return
      }
      const r = await call<{ message: string }>('POST', 'courier/test', { provider: p })
      setResult((m) => ({ ...m, [p]: { ok: true, text: r.message } }))
    } catch (e) {
      setResult((m) => ({ ...m, [p]: { ok: false, text: e instanceof ApiError ? e.message : 'Could not reach the courier.' } }))
    } finally {
      setBusy('')
    }
  }

  if (!admin) return <Card icon="settings" title="Couriers"><p className="card-body pt0 t-muted">Only an admin can set up couriers. Booking and tracking work for everyone with access.</p></Card>

  return (
    <div className="stack">
      <Card icon="settings" title="Booking settings">
        <div className="card-body pt0 form-grid">
          <Field label="Default courier" hint="Picked first when booking">
            <select className="in" value={cur.provider} onChange={(e) => save({ provider: e.target.value as CourierProvider })}>
              {COURIER_PROVIDERS.map((p) => <option key={p} value={p}>{courierLabel(p)}</option>)}
            </select>
          </Field>
          <div className="field">
            <span className="field-label">Automatic booking</span>
            <Segmented<'on' | 'off'> label="Automatic booking" value={cur.autoBook ? 'on' : 'off'} onChange={(x) => save({ autoBook: x === 'on' })} options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} />
            <small>When on, saving a sale for a dealer marked “Deliver by courier” books the parcel with the default courier.</small>
          </div>
          <div className="field">
            <span className="field-label">Test mode</span>
            <Segmented<'on' | 'off'> label="Test mode" value={cur.testMode ? 'on' : 'off'} onChange={(x) => save({ testMode: x === 'on' })} options={[{ value: 'off', label: 'Off (real couriers)' }, { value: 'on', label: 'On (simulated)' }]} />
            <small>{cur.testMode ? 'Bookings, tracking and areas are simulated inside the app. Nothing reaches a courier and no keys are needed.' : 'Bookings go to the real courier with your keys.'}</small>
          </div>
          <div className="field">
            <span className="field-label">Sample parcels</span>
            <div className="btn-row tight-row">
              <Button size="sm" variant="secondary" icon="parcel" onClick={() => { act('loadSampleParcels', { today: todayISO() }); toast('14 sample parcels added, test mode on') }}>Load sample parcels</Button>
              {(db.parcels || []).some((x) => x.test) && <Button size="sm" variant="danger" icon="trash" onClick={() => { act('removeSampleParcels', {}); toast('Sample and test parcels removed') }}>Remove samples</Button>}
            </div>
            <small>{(db.parcels || []).filter((x) => x.test).length} test parcels now. Real parcels are never touched.</small>
          </div>
          {BACKEND === 'local' && <p className="field wide note">This copy runs in the browser only, so keys saved here stay in this browser and bookings go straight from it to the courier. Use Save and test to see whether your courier accepts that. For the safest setup run the app with the server, where keys live in its .env and never reach a browser.</p>}
          {loadErr && <p className="field wide err">{loadErr}</p>}
        </div>
      </Card>
      <div className="courier-grid">
        {COURIER_PROVIDERS.map((p) => {
          const i = info?.[p]
          const on = enabled.has(p)
          const r = result[p]
          return (
            <section key={p} className={cls('card courier-card', on && 'on')}>
              <header className="courier-head">
                <div>
                  <b>{courierLabel(p)}</b>
                  <span>{p === cur.provider ? <Pill tone="good">Default</Pill> : on ? <Pill tone="info">On</Pill> : <Pill tone="muted">Off</Pill>}{' '}{needsKeys(p) && (i?.configured ? <Pill tone="good">Keys saved{i.fromServer ? ' on server' : ''}</Pill> : <Pill tone="warn">Needs keys</Pill>)}</span>
                </div>
                <Button size="sm" variant={on ? 'secondary' : 'primary'} onClick={() => toggle(p)}>{on ? 'Turn off' : 'Turn on'}</Button>
              </header>
              {p === 'manual' && <p className="t-muted">Book on the courier’s site or app, then record the consignment number here to track it with the sale.</p>}
              {p === 'demo' && <p className="t-muted">Pretend parcels for trying the flow: they move to “in transit” after a few minutes and “delivered” after an hour.</p>}
              {needsKeys(p) && (open === p ? (
                <div className="form-grid">
                  {i?.fromServer && <p className="field wide t-muted">Keys come from the server’s settings and win over anything saved here.</p>}
                  {FIELDS[p].map((f) => (
                    <Field key={f.key} label={f.label} hint={i?.hints[f.key] ? `Saved: ${i.hints[f.key]}. Leave empty to keep it.` : f.hint} wide={f.key === 'baseUrl'}>
                      <input className="in" type={f.secret ? 'password' : 'text'} value={vals[f.key] || ''} autoComplete={f.secret ? 'new-password' : 'off'} spellCheck={false}
                        onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
                    </Field>
                  ))}
                  <div className="field wide btn-row tight-row">
                    <Button size="sm" icon="check" disabled={!!busy} onClick={() => void run(p, 'save')}>{busy === p + 'save' ? 'Saving…' : 'Save and test'}</Button>
                    <Button size="sm" variant="secondary" onClick={() => { setOpen(null); setVals({}) }}>Close</Button>
                    {i?.configured && !i.fromServer && <Button size="sm" variant="danger" icon="trash" disabled={!!busy} onClick={() => void run(p, 'clear')}>Remove keys</Button>}
                  </div>
                </div>
              ) : (
                <div className="btn-row tight-row">
                  <Button size="sm" variant="secondary" icon="edit" onClick={() => { setOpen(p); setVals({}) }}>{i?.configured ? 'Change keys' : 'Add keys'}</Button>
                  {i?.configured && <Button size="sm" variant="secondary" icon="check" disabled={!!busy} onClick={() => void run(p, 'test')}>{busy === p + 'test' ? 'Testing…' : hasBalance(p) ? 'Test and show balance' : 'Test connection'}</Button>}
                </div>
              ))}
              {r && <p className={r.ok ? 't-good' : 'err'}>{r.text}</p>}
            </section>
          )
        })}
      </div>
    </div>
  )
}
