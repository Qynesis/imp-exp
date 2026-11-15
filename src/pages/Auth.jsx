import { useEffect, useState } from 'react'
import { BUSINESS_TYPES } from '../lib/presets.js'
import { useStore } from '../lib/store.jsx'
import { Button, Field, Logo, POWERED_BY, Segmented, cls, useForm } from '../ui.jsx'

export default function Auth() {
  const { signIn, status } = useStore()
  const [server, setServer] = useState({ state: 'checking', demo: null, problem: '' })
  const [mode, setMode] = useState('login')
  const [v, set, bind] = useForm({ company: '', name: '', email: '', password: '', businessTypes: ['general'], sample: false })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const signup = mode === 'signup'

  // check the server is reachable before the person types anything, and keep checking while it is down
  useEffect(() => {
    let timer
    let live = true
    const check = () => status()
      .then((r) => {
        if (!live) return
        if (r.ok) return setServer({ state: 'up', demo: r.demo, problem: '', local: !!r.local })
        setServer({ state: 'down', demo: null, problem: r.problem })
        timer = setTimeout(check, 5000)
      })
      .catch((e) => {
        if (!live) return
        setServer({ state: 'down', demo: null, problem: e.status ? e.message : '' })
        timer = setTimeout(check, 3000)
      })
    check()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [status])

  const demoLogin = async (email) => {
    setBusy(true)
    setErr('')
    try {
      await signIn('login', { email, password: server.demo.password })
    } catch (ex) {
      setErr(ex.message)
      setBusy(false)
    }
  }

  const toggleType = (t) => set('businessTypes', v.businessTypes.includes(t) ? v.businessTypes.filter((x) => x !== t) : [...v.businessTypes, t])
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await signIn(signup ? 'signup' : 'login', signup ? v : { email: v.email, password: v.password })
    } catch (ex) {
      setErr(ex.message)
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-side">
        <Logo height={96} light />
        <b>Books for importers and exporters</b>
        <p>Factory orders, LC shipments, customs clearance, stock, dealer sales, dues and payroll. One private set of books for each company.</p>
        <span className="powered-auth">Powered by <b>{POWERED_BY}</b></span>
      </div>
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1>{signup ? 'Create your company' : 'Sign in'}</h1>
        <Segmented label="Sign in or create" value={mode} onChange={(m) => { setMode(m); setErr('') }} options={[{ value: 'login', label: 'Sign in' }, { value: 'signup', label: 'New company' }]} />
        {server.state === 'down' && (
          <div className="err" role="alert">
            {server.problem || <>The server did not answer, so sign-in cannot work yet. On your own computer run <b>npm run dev</b> in the project folder. On a hosted site, check the deployment logs.</>} This page keeps retrying by itself.
          </div>
        )}
        {err && <div className="err" role="alert">{err}</div>}
        <div className="form-grid one" key={mode}>
          {signup && (
            <>
              <Field label="Company name"><input {...bind('company')} autoComplete="organization" placeholder="e.g. Karnaphuli Trading" /></Field>
              <Field label="Your name"><input {...bind('name')} autoComplete="name" placeholder="Full name" /></Field>
            </>
          )}
          <Field label="Email"><input {...bind('email')} type="email" autoComplete="email" placeholder="you@company.com" /></Field>
          <Field label="Password" hint={signup ? 'At least 8 characters.' : undefined}>
            <input {...bind('password')} type="password" autoComplete={signup ? 'new-password' : 'current-password'} />
          </Field>
          {signup && (
            <>
              <fieldset className="field">
                <legend className="field-label">What do you trade? Pick all that apply</legend>
                <div className="chips">
                  {Object.entries(BUSINESS_TYPES).map(([k, t]) => (
                    <button key={k} type="button" className={cls('chip', v.businessTypes.includes(k) && 'on')} aria-pressed={v.businessTypes.includes(k)} onClick={() => toggleType(k)}>{t.label}</button>
                  ))}
                </div>
                <small>Each type adds the right extra fields and customs documents. You can change this later.</small>
              </fieldset>
              <label className="check"><input type="checkbox" checked={v.sample} onChange={(e) => set('sample', e.target.checked)} /> Fill the books with sample data so I can look around</label>
            </>
          )}
        </div>
        <Button type="submit" block disabled={busy || server.state === 'down'}>{busy ? 'Please wait' : signup ? 'Create company' : 'Sign in'}</Button>
        {server.local && (
          <p className="t-muted small tight">Running in this browser only: companies and books are saved on this device, not on a server.</p>
        )}
        {!signup && server.demo && (
          <div className="demo-box">
            <b>Demo logins</b>
            <span>{server.local ? 'A sample company, one login per role, and the platform owner.' : 'One sample company, one login per role.'} Password for all: <code>{server.demo.password}</code></span>
            <div className="demo-list">
              {server.demo.logins.map((l) => (
                <button key={l.email} type="button" className="demo-row" disabled={busy} onClick={() => demoLogin(l.email)}>
                  <span><b>{l.role}</b>{l.email}</span>
                  <span className="link">Sign in</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
