import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { LangSwitch } from '@/components/LangSwitch'
import { BRAND, POWERED_BY } from '@/config/brand'
import { go as navigate } from '@/core/router'
import { Icon, Logo } from '@/ui'
import { scrollToSection as scrollTo } from './scroll'

/**
 * Pieces shared by the public pages: a nav that sits clear over the hero and turns white once you
 * scroll, a muted looping background video, a fade-up reveal and the footer.
 */

const ease = [0.22, 1, 0.36, 1] as const

export function SiteNav({ links }: { links: { label: string; to: string }[] }) {
  const [open, setOpen] = useState(false)
  const [shadow, setShadow] = useState(false)
  // a new public page starts at the top, not where the last one was scrolled to
  useEffect(() => window.scrollTo(0, 0), [])
  useEffect(() => {
    const on = () => setShadow(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const go = (to: string) => {
    setOpen(false)
    if (to.startsWith('#/')) navigate(to.slice(2))
    else scrollTo(to)
  }
  return (
    <header className={`px-nav${shadow ? ' shadow' : ''}`}>
      <a className="px-brand" href="#/" aria-label={`${BRAND} home`}><Logo height={34} /></a>
      <nav className={open ? 'open' : ''} aria-label="Main">
        {links.map((l) => <button key={l.to} type="button" onClick={() => go(l.to)}>{l.label}</button>)}
        <a className="px-nav-signin" href="#/signin">Sign in</a>
      </nav>
      <div className="px-nav-right">
        <LangSwitch />
        <a className="px-link" href="#/signin">Sign in</a>
        <a className="px-btn px-btn-sm" href="#/signup">Start free</a>
        <button type="button" className="px-burger" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'close' : 'grid'} size={20} /></button>
      </div>
    </header>
  )
}

/**
 * A row of pill tabs that stays under the header. Tapping one brings its section fully into view below
 * the header and tabs; the tab of the section you are reading is filled black and, on phones, slid into view.
 */
export function PillTabs({ tabs }: { tabs: { id: string; label: string; badge?: string; to?: string }[] }) {
  const [active, setActive] = useState(tabs[0]?.id)
  const bar = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    let frame = 0
    const pick = () => {
      frame = 0
      // the last section whose top has passed a line just under the sticky bars is the one being read
      // measured where the tabs sit once pinned, so the first section does not count before you scroll
      const el = bar.current
      const line = (el ? parseFloat(getComputedStyle(el).top) + el.offsetHeight : 140) + 24
      let cur = tabs[0]?.id
      for (const t of tabs) {
        if (t.to) continue
        const el = document.getElementById(t.id)
        if (el && el.getBoundingClientRect().top <= line) cur = t.id
      }
      // at the very bottom the last section counts, even if it is short
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = [...tabs].reverse().find((t) => !t.to)?.id ?? cur
      setActive(cur)
      // a line under the tabs once they are pinned, so content scrolling beneath stays clearly separate
      if (el) setStuck(el.getBoundingClientRect().top <= parseFloat(getComputedStyle(el).top) + 1 && window.scrollY > 0)
    }
    const on = () => { if (!frame) frame = requestAnimationFrame(pick) }
    pick()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); cancelAnimationFrame(frame) }
  }, [tabs])
  useEffect(() => {
    // keep the active pill visible in the row when the row scrolls sideways (phones)
    const row = bar.current
    const btn = row?.querySelector<HTMLElement>('button.on')
    if (!row || !btn || row.scrollWidth <= row.clientWidth) return
    row.scrollTo({ left: btn.offsetLeft - row.clientWidth / 2 + btn.offsetWidth / 2, behavior: 'smooth' })
  }, [active])
  return (
    <div className={`px-tabs${stuck ? ' stuck' : ''}`} ref={bar} role="tablist" aria-label="Sections">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className={active === t.id ? 'on' : ''}
          onClick={() => (t.to ? navigate(t.to.slice(2)) : t.id === 'top' ? window.scrollTo({ top: 0, behavior: 'smooth' }) : scrollTo(t.id))}>
          {t.label}{t.badge && <span className="px-badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  )
}

/** A rounded, bordered panel of chips with a title and a "see more" link, as on photo sites. */
export function ChipPanel({ title, more, children }: { title: ReactNode; more?: { label: string; onClick: () => void }; children: ReactNode }) {
  return (
    <div className="px-panel">
      <div className="px-panel-head">
        <b>{title}</b>
        {more && <button type="button" onClick={more.onClick}>{more.label} <Icon name="chevron" size={14} /></button>}
      </div>
      <div className="px-chip-row">{children}</div>
    </div>
  )
}

/**
 * A muted, looping video behind content, with its first frame as the poster so the page never shows
 * an empty box. Phones get the smaller file; anyone who asks for less motion gets the still image.
 */
export function VideoBg({ src, small, poster, label }: { src: string; small?: string; poster: string; label: string }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLVideoElement>(null)
  const [file] = useState(() => (small && typeof window !== 'undefined' && window.innerWidth < 760 ? small : src))
  useEffect(() => {
    const v = ref.current
    if (!v || reduce) return
    // pause when off screen: saves battery and data on long pages
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) void v.play().catch(() => undefined); else v.pause() }, { threshold: 0.1 })
    io.observe(v)
    return () => io.disconnect()
  }, [reduce])
  if (reduce) return <img className="px-video" src={poster} alt={label} />
  return <video ref={ref} className="px-video" src={file} poster={poster} muted loop playsInline autoPlay preload="metadata" aria-label={label} />
}

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.7, delay, ease }}>
      {children}
    </motion.div>
  )
}

export function SectionHead({ kicker, title, text, center = true }: { kicker?: string; title: string; text?: string; center?: boolean }) {
  return (
    <Reveal className={`px-head${center ? ' center' : ''}`}>
      {kicker && <span className="px-kicker">{kicker}</span>}
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </Reveal>
  )
}

export function SiteFooter() {
  return (
    <footer className="px-foot">
      <div className="px-foot-inner">
        <div className="px-foot-brand">
          <Logo height={36} />
          <p>Import, export, factory and distribution management, made in Bangladesh for traders everywhere.</p>
        </div>
        <div>
          <b>Product</b>
          <button type="button" onClick={() => { navigate(''); setTimeout(() => scrollTo('features'), 50) }}>Features</button>
          <button type="button" onClick={() => { navigate(''); setTimeout(() => scrollTo('insights'), 50) }}>Business insights</button>
          <button type="button" onClick={() => { navigate(''); setTimeout(() => scrollTo('solutions'), 50) }}>Solutions</button>
        </div>
        <div>
          <b>Industries</b>
          <button type="button" onClick={() => { navigate(''); setTimeout(() => scrollTo('industries'), 50) }}>Importers and exporters</button>
          <button type="button" onClick={() => { navigate(''); setTimeout(() => scrollTo('industries'), 50) }}>Distributors</button>
        </div>
        <div>
          <b>Account</b>
          <a href="#/signin">Sign in</a>
          <a href="#/signup">Start free trial</a>
          <a href="#/signin">Try the demo</a>
        </div>
      </div>
      <div className="px-foot-base">
        <span>© {new Date().getFullYear()} {BRAND} · powered by {POWERED_BY}</span>
        <span>Made in Bangladesh for traders, factories and distributors</span>
      </div>
    </footer>
  )
}
