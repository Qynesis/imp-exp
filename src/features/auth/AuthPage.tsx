import { useEffect, useState, type FormEvent } from 'react'
import type { StatusResponse } from '@shared/api/contract'
import { BUSINESS_TYPES, isBusinessType, type BusinessTypeId } from '@shared/domain'
import { LangSwitch } from '@/components/LangSwitch'
import { BRAND, POWERED_BY } from '@/config/brand'
import { ApiError } from '@/core/api/client'
import { useStore } from '@/core/store/context'
import { Icon, Logo, useForm, type IconName } from '@/ui'
import { ImageStack } from '@/features/landing/Solutions'
import '@fontsource-variable/plus-jakarta-sans'
import '@/features/landing/landing.css'

/** Shown beside the form: what the books cover, in a few words each. */
const POINTS: [IconName, string][] = [
  ['ship', 'Imports, exports, LC and customs'], ['building', 'Warehouses with confirmed receiving'],
  ['factory', 'Factory orders and production'], ['receipt', 'Dealer sales, dues and delivery'],
  ['trend', 'Business insights and charts'],
]

const PHOTOS = [
  { src: 'warehouse-racks.jpg', alt: 'High racks of boxed stock in a warehouse' },
  { src: 'port-aerial.jpg', alt: 'Cranes and cars at a port' },
  { src: 'garments-floor.jpg', alt: 'Workers sewing at a factory' },
  { src: 'shelves-aerial.jpg', alt: 'Rows of stocked shelves' },
  { src: 'forklift-store.jpg', alt: 'Reach truck between pallets of goods' },
]

type Mode = 'login' | 'signup'
interface ServerState {
  state: 'checking' | 'up' | 'down'
  demo: StatusResponse['demo']
  problem: string
  local: boolean
}

/** A trade named in the link, e.g. #/signup/garments from the garments page, is ticked in advance. */
function signupTrade(): BusinessTypeId[] {
  const t = window.location.hash.replace(/^#\/?/, '').split('/')[1]
  return isBusinessType(t) ? [t] : ['general']
}

/** Sign in, create a company, or use a demo login: a clean form beside a slideshow of real trade photos. */
export default function AuthPage() {
  const { signIn, status } = useStore()
  const [server, setServer] = useState<ServerState>({ state: 'checking', demo: null, problem: '', local: false })
  const [mode, setMode] = useState<Mode>(() => (window.location.hash.startsWith('#/signup') ? 'signup' : 'login'))
  const [v, set, bind] = useForm({ company: '', name: '', email: '', password: '', businessTypes: signupTrade(), sample: false })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)
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
  const switchTo = (m: Mode) => { setMode(m); setErr('') }

  return (
    <div className="px px-auth">
      <header className="px-auth-top">
        <a className="px-brand" href="#/" aria-label={`${BRAND} home`}><Logo height={34} /></a>
        <div className="px-auth-top-right">
          <LangSwitch />
          <a className="px-link" href="#/">← Back to home</a>
        </div>
      </header>

      <main className="px-auth-main">
        <form className="px-auth-form" onSubmit={submit} noValidate>
          <h1>{signup ? 'Create your company' : 'Welcome back'}</h1>
          <p className="px-auth-sub">{signup ? 'A private set of books for your company, ready in a minute. Every new company starts with a free trial.' : 'Sign in to your company’s books, or open a demo company below.'}</p>

          <div className="px-auth-switch" role="tablist" aria-label="Sign in or create">
            <button type="button" role="tab" aria-selected={!signup} className={!signup ? 'on' : ''} onClick={() => switchTo('login')}>Sign in</button>
            <button type="button" role="tab" aria-selected={signup} className={signup ? 'on' : ''} onClick={() => switchTo('signup')}>New company</button>
          </div>

          {server.state === 'down' && (
            <div className="px-auth-alert" role="alert">
              <Icon name="alert" size={18} />
              <span>{server.problem || <>The server did not answer, so sign-in cannot work yet. On your own computer run <b>npm run dev</b> in the project folder. On a hosted site, check the deployment logs.</>} This page keeps retrying by itself.</span>
            </div>
          )}
          {err && <div className="px-auth-alert" role="alert"><Icon name="alert" size={18} /><span>{err}</span></div>}

          <div className="px-auth-fields" key={mode}>
            {signup && (
              <>
                <label className="px-input"><span>Company name</span><input {...bind('company')} autoComplete="organization" placeholder="e.g. Karnaphuli Trading" /></label>
                <label className="px-input"><span>Your name</span><input {...bind('name')} autoComplete="name" placeholder="Full name" /></label>
              </>
            )}
            <label className="px-input"><span>Email</span><input {...bind('email')} type="email" autoComplete="email" placeholder="you@company.com" /></label>
            <label className="px-input">
              <span>Password {signup && <small>at least 8 characters</small>}</span>
              <span className="px-input-wrap">
                <input {...bind('password')} type={show ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'Choose a password' : 'Your password'} />
                <button type="button" className="px-input-eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
              </span>
            </label>
            {signup && (
              <>
                <fieldset className="px-auth-trades">
                  <legend>What do you trade? <small>Pick all that apply</small></legend>
                  <div className="px-chip-row">
                    {(Object.keys(BUSINESS_TYPES) as BusinessTypeId[]).map((k) => (
                      <button key={k} type="button" className={`px-chip chip${v.businessTypes.includes(k) ? ' on' : ''}`} aria-pressed={v.businessTypes.includes(k)} onClick={() => toggleType(k)}>
                        {v.businessTypes.includes(k) && <Icon name="check" size={15} />}{BUSINESS_TYPES[k].label}
                      </button>
                    ))}
                  </div>
                  <small>Each adds the right extra fields and customs documents. You can change this later.</small>
                </fieldset>
                <label className="px-auth-check"><input type="checkbox" checked={v.sample} onChange={(e) => set('sample', e.target.checked)} /> Fill the books with sample data so I can look around</label>
              </>
            )}
          </div>

          <button type="submit" className="px-btn px-auth-submit" disabled={busy || server.state === 'down'}>
            {busy ? 'Please wait…' : signup ? 'Create company' : 'Sign in'} {!busy && <Icon name="arrowRight" size={18} />}
          </button>
          <p className="px-auth-alt">{signup ? <>Already have an account? <button type="button" onClick={() => switchTo('login')}>Sign in</button></> : <>New here? <button type="button" onClick={() => switchTo('signup')}>Create your company</button></>}</p>
          {server.local && <p className="px-auth-note">Running in this browser only: companies and books are saved on this device, not on a server.</p>}

          {!signup && server.demo && (
            <div className="px-panel px-demo">
              <div className="px-panel-head">
                <b>Try a demo company</b>
                <small className="px-muted">Password <code>{server.demo.password}</code></small>
              </div>
              <div className="demo-list">
                {server.demo.logins.map((l) => (
                  <button key={l.email} type="button" className="demo-row" disabled={busy}
                    onClick={() => server.demo && void attempt(() => signIn('login', { email: l.email, password: server.demo!.password }))}>
                    <i aria-hidden="true">{l.role.slice(0, 1)}</i>
                    <span><b>{l.role}</b><small>{l.email}</small></span>
                    <em>Open →</em>
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>

        <aside className="px-auth-media" aria-label={`About ${BRAND}`}>
          <ImageStack images={PHOTOS} label="Photos from warehouses, ports, factories and shops" every={4000} />
          <div className="px-auth-media-card">
            <b>Import, export, factory and distribution, in one set of books.</b>
            <ul>{POINTS.map(([icon, t]) => <li key={t}><span className="px-feature-icon sm"><Icon name={icon} size={16} /></span>{t}</li>)}</ul>
            <small>Powered by {POWERED_BY}</small>
          </div>
        </aside>
      </main>
    </div>
  )
}
