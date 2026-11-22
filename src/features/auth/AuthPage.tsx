import { useEffect, useState, type FormEvent } from 'react'
import type { StatusResponse } from '@shared/api/contract'
import { BUSINESS_TYPES, type BusinessTypeId } from '@shared/domain'
import { LangSwitch } from '@/components/LangSwitch'
import { BRAND, BRAND_LINE, POWERED_BY } from '@/config/brand'
import { ApiError } from '@/core/api/client'
import { useStore } from '@/core/store/context'
import { Button, cls, Field, Icon, Logo, Segmented, useForm, type IconName } from '@/ui'

/** What the software does, as on the brochure: one icon and a name each. */
const AUTH_FEATURES: [IconName, string][] = [
  ['cart', 'Purchase and sales'], ['box', 'Stock and inventory'], ['users', 'Dealers and retailers'], ['wallet', 'Cash flow and accounts'],
  ['receipt', 'Dues and collections'], ['truck', 'Delivery and sales reports'], ['chart', 'Company, product and dealer reports'], ['print', 'Invoice and challan printing'],
  ['undo', 'Returns'], ['send', 'SMS and WhatsApp alerts'], ['badge', 'Many users with roles'], ['settings', 'Set up for your trade'],
]

type Mode = 'login' | 'signup'
interface ServerState {
  state: 'checking' | 'up' | 'down'
  demo: StatusResponse['demo']
  problem: string
  local: boolean
}

/** Sign in, create a company, or use a demo login. */
export default function AuthPage() {
  const { signIn, status } = useStore()
  const [server, setServer] = useState<ServerState>({ state: 'checking', demo: null, problem: '', local: false })
  const [mode, setMode] = useState<Mode>(() => (window.location.hash.startsWith('#/signup') ? 'signup' : 'login'))
  const [v, set, bind] = useForm({ company: '', name: '', email: '', password: '', businessTypes: ['general'] as BusinessTypeId[], sample: false })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const signup = mode === 'signup'

  // check the server is reachable before the person types anything, and keep checking while it is down
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let live = true
    const check = () =>
      status()
        .then((r) => {
          if (!live) return
          if (r.ok) return setServer({ state: 'up', demo: r.demo, problem: '', local: !!r.local })
          setServer({ state: 'down', demo: null, problem: r.problem || '', local: false })
          timer = setTimeout(check, 5000)
        })
        .catch((e: unknown) => {
          if (!live) return
          setServer({ state: 'down', demo: null, problem: e instanceof ApiError && e.status ? e.message : '', local: false })
          timer = setTimeout(check, 3000)
        })
    void check()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [status])

  const attempt = async (run: () => Promise<void>) => {
    setBusy(true)
    setErr('')
    try {
      await run()
    } catch (ex) {
      setErr((ex as Error).message)
      setBusy(false)
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void attempt(() => (signup ? signIn('signup', v) : signIn('login', { email: v.email, password: v.password })))
  }
  const toggleType = (t: BusinessTypeId) => set('businessTypes', v.businessTypes.includes(t) ? v.businessTypes.filter((x) => x !== t) : [...v.businessTypes, t])

  return (
    <div className="auth">
      <div className="auth-side">
        <a className="auth-home" href="#/">← Back to home</a>
        <Logo height={96} light />
        <b>Books for importers and exporters</b>
        <p>Factory orders, LC shipments, customs clearance, stock, dealer sales, dues and payroll. One private set of books for each company.</p>
        <ul className="auth-features">
          {AUTH_FEATURES.map(([icon, name]) => <li key={name}><span><Icon name={icon} size={22} /></span>{name}</li>)}
        </ul>
        <span className="powered-auth"><b>{BRAND}</b> · {BRAND_LINE} · Powered by <b>{POWERED_BY}</b></span>
      </div>
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="auth-lang"><LangSwitch /></div>
        <h1>{signup ? 'Create your company' : 'Sign in'}</h1>
        <Segmented<Mode> label="Sign in or create" value={mode} onChange={(m) => { setMode(m); setErr('') }} options={[{ value: 'login', label: 'Sign in' }, { value: 'signup', label: 'New company' }]} />
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
                  {(Object.keys(BUSINESS_TYPES) as BusinessTypeId[]).map((k) => (
                    <button key={k} type="button" className={cls('chip', v.businessTypes.includes(k) && 'on')} aria-pressed={v.businessTypes.includes(k)} onClick={() => toggleType(k)}>{BUSINESS_TYPES[k].label}</button>
                  ))}
                </div>
                <small>Each type adds the right extra fields and customs documents. You can change this later.</small>
              </fieldset>
              <label className="check"><input type="checkbox" checked={v.sample} onChange={(e) => set('sample', e.target.checked)} /> Fill the books with sample data so I can look around</label>
            </>
          )}
        </div>
        <Button type="submit" block disabled={busy || server.state === 'down'}>{busy ? 'Please wait' : signup ? 'Create company' : 'Sign in'}</Button>
        {server.local && <p className="t-muted small tight">Running in this browser only: companies and books are saved on this device, not on a server.</p>}
        {!signup && server.demo && (
          <div className="demo-box">
            <b>Demo logins</b>
            <span>{server.local ? 'A sample company, one login per role, and the platform owner.' : 'One sample company, one login per role.'} Password for all: <code>{server.demo.password}</code></span>
            <div className="demo-list">
              {server.demo.logins.map((l) => (
                <button key={l.email} type="button" className="demo-row" disabled={busy}
                  onClick={() => server.demo && void attempt(() => signIn('login', { email: l.email, password: server.demo!.password }))}>
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
