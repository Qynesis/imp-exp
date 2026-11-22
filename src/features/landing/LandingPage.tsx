/**
 * The public landing page. Framer Motion drives the hero, cards, tabs and FAQ; GSAP + ScrollTrigger drive
 * the pinned "how goods move" journey, the marquee and the counters. Everything calms down for visitors
 * whose device asks for reduced motion.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, MotionConfig, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { PLANS, PLAN_FEATURES } from '@shared/billing'
import { LangSwitch } from '@/components/LangSwitch'
import { BRAND, POWERED_BY } from '@/config/brand'
import { Icon, Logo, type IconName } from '@/ui'
import './landing.css'

gsap.registerPlugin(ScrollTrigger, useGSAP)

const ease = [0.22, 1, 0.36, 1] as const

/* ---------------------------------------------------------------- content */

const FEATURES: { icon: IconName; title: string; text: string; tone: string }[] = [
  { icon: 'cart', title: 'Purchase and sales', text: 'Bills, estimates, credit or cash on delivery, with VAT for your country.', tone: 'orange' },
  { icon: 'box', title: 'Stock and inventory', text: 'Live stock, what is held for bills, low-stock alerts and full history.', tone: 'teal' },
  { icon: 'users', title: 'Dealers and retailers', text: 'Credit limits, dues by bill, statements and reminders.', tone: 'blue' },
  { icon: 'wallet', title: 'Cash flow and accounts', text: 'Cash, bank, bKash and Nagad balances, chart of accounts and P&L.', tone: 'purple' },
  { icon: 'receipt', title: 'Dues and collections', text: 'Who owes what, from when, and one tap to collect.', tone: 'orange' },
  { icon: 'truck', title: 'Delivery and returns', text: 'Part deliveries, returns with reasons, challans and trips.', tone: 'teal' },
  { icon: 'chart', title: 'Reports that matter', text: 'Company, product and dealer reports; daily, monthly, yearly.', tone: 'blue' },
  { icon: 'print', title: 'Invoice and challan printing', text: 'Clean bills with your logo, BIN and a barcode on every one.', tone: 'purple' },
  { icon: 'barcode', title: 'Barcode labels and scanning', text: 'Print unit and carton labels in bulk; scan at every step.', tone: 'orange' },
  { icon: 'send', title: 'SMS and WhatsApp', text: 'Bills, payments and reminders sent by themselves or one by one.', tone: 'teal' },
  { icon: 'badge', title: 'Many users with roles', text: 'Owner, accountant, sales, warehouse: each sees only their part.', tone: 'blue' },
  { icon: 'sparkle', title: 'AI assistant', text: 'Ask in English or বাংলা: who owes most, what to reorder.', tone: 'purple' },
]

const JOURNEY: { icon: IconName; title: string; text: string }[] = [
  { icon: 'factory', title: 'Factory or LC', text: 'Order from a factory with an estimate and advance, or open an LC to import.' },
  { icon: 'shield', title: 'Port and customs', text: 'Duty, VAT, AIT and demurrage worked out; documents ticked off.' },
  { icon: 'barcode', title: 'Warehouse', text: 'Cartons scanned in; landed cost goes into the stock cost by itself.' },
  { icon: 'truck', title: 'Dealer delivery', text: 'Bill now, deliver in parts; every carton scanned onto the truck.' },
  { icon: 'wallet', title: 'Money in', text: 'Collections by cash, bank or bKash, receipts attached, dues cleared.' },
]

const SHOWCASE = [
  { key: 'sell', label: 'Sell', icon: 'receipt' as IconName, title: 'A bill in under a minute', text: 'Scan or pick the goods, VAT is added for you, and the dealer’s credit limit is checked before you print.' },
  { key: 'deliver', label: 'Deliver', icon: 'truck' as IconName, title: 'Deliver part, keep the rest pending', text: 'Stock only leaves when the goods go. Scan each carton as it is loaded; the challan prints with a barcode.' },
  { key: 'accounts', label: 'Accounts', icon: 'layers' as IconName, title: 'Every account in one place', text: 'Chart of accounts, VAT report, regular expenses with due and advance, and a note on every change.' },
  { key: 'alerts', label: 'Alerts', icon: 'bell' as IconName, title: 'Know before it becomes a problem', text: 'Overdue dealers, low stock, late factory orders, expiring vehicle papers: one bell, ranked by urgency.' },
]

const FAQ = [
  ['Does it work for a small trading company?', 'Yes. Start with sales, stock and dues; turn on imports, factory orders, transport or accounts when you need them. Every screen is in the same plan.'],
  ['Can my staff use it on their phones?', 'Every screen is built for phones as well as computers. Each user signs in with their own login and role.'],
  ['Is it only for Bangladesh?', 'It is made in Bangladesh, with Taka, BIN, VAT, bKash and Nagad set up. Pick China, USA, India, UAE and more for their currency and tax rates.'],
  ['How do I pay?', 'Online with bKash, Nagad or card, or send by bKash or bank and press “I paid”. Every new company gets a free trial first.'],
  ['Is my data private?', 'Each company has its own private books. Staff only see the screens their role allows, and every payment can carry its receipt.'],
]

const STATS: { value: number; suffix: string; label: string }[] = [
  { value: 25, suffix: '+', label: 'screens in one plan' },
  { value: 11, suffix: '', label: 'country tax presets' },
  { value: 3, suffix: '', label: 'couriers built in' },
  { value: 2, suffix: '', label: 'languages: English and বাংলা' },
]

const TRADES = ['Importers', 'Exporters', 'Distributors', 'Factories', 'Wholesalers', 'Food and FMCG', 'Electronics', 'Medicine', 'Machinery', 'Toys', 'Garments accessories', 'Chemicals']

/* ---------------------------------------------------------------- small pieces */

/** A button that leans toward the pointer. */
function Magnetic({ href, children, className }: { href: string; children: ReactNode; className: string }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 220, damping: 16 })
  const sy = useSpring(y, { stiffness: 220, damping: 16 })
  const move = (e: ReactPointerEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    x.set((e.clientX - r.left - r.width / 2) * 0.25)
    y.set((e.clientY - r.top - r.height / 2) * 0.35)
  }
  return (
    <motion.a href={href} className={className} style={{ x: sx, y: sy }} onPointerMove={move} onPointerLeave={() => { x.set(0); y.set(0) }} whileTap={{ scale: 0.96 }}>
      {children}
    </motion.a>
  )
}

/** Words that rise into place one after another. */
function Headline({ text, highlight }: { text: string; highlight: string }) {
  const words = text.split(' ')
  return (
    <motion.h1 className="ld-h1" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } } }}>
      {words.map((w, i) => (
        <span key={i} className="ld-word-mask">
          <motion.span className={w === highlight ? 'ld-word ld-grad' : 'ld-word'} variants={{ hidden: { y: '110%', rotate: 4 }, show: { y: '0%', rotate: 0, transition: { duration: 0.8, ease } } }}>{w}</motion.span>
        </span>
      ))}
    </motion.h1>
  )
}

/** The app, drawn small: tiles, a growing chart and notifications that pop in. It tilts with the pointer. */
function HeroMockup() {
  const ref = useRef<HTMLDivElement>(null)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [8, -8]), { stiffness: 120, damping: 14 })
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-10, 10]), { stiffness: 120, damping: 14 })
  const move = (e: ReactPointerEvent) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    mx.set((e.clientX - r.left) / r.width - 0.5)
    my.set((e.clientY - r.top) / r.height - 0.5)
  }
  const bars = [38, 52, 44, 66, 58, 74, 62, 88, 70, 92, 80, 100]
  const tiles: [IconName, string, string][] = [['cart', 'Sold today', 'Tk 2.7 L'], ['users', 'To collect', 'Tk 3 L'], ['truck', 'To deliver', '4 bills'], ['box', 'Low stock', '2 items']]
  return (
    <motion.div ref={ref} className="ld-mock-wrap" onPointerMove={move} onPointerLeave={() => { mx.set(0); my.set(0) }}
      initial={{ opacity: 0, y: 60, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 1, delay: 0.35, ease }}>
      <motion.div className="ld-mock" style={{ rotateX: rx, rotateY: ry }}>
        <div className="ld-mock-bar"><i /><i /><i /><span>{BRAND} · Star Bangla Demo</span></div>
        <div className="ld-mock-body">
          <div className="ld-mock-tiles">
            {tiles.map(([icon, label, value], i) => (
              <motion.div key={label} className="ld-mock-tile" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 + i * 0.12, duration: 0.6, ease }}>
                <span><Icon name={icon} size={16} /></span>
                <small>{label}</small>
                <b>{value}</b>
              </motion.div>
            ))}
          </div>
          <div className="ld-mock-chart">
            <small>Sales, last 12 days</small>
            <div className="ld-bars">
              {bars.map((h, i) => <motion.i key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: 1.1 + i * 0.05, duration: 0.7, ease }} />)}
            </div>
          </div>
        </div>
      </motion.div>
      <motion.div className="ld-float ld-float-1" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0, y: [0, -8, 0] }} transition={{ opacity: { delay: 1.6 }, x: { delay: 1.6, duration: 0.6 }, y: { delay: 2.2, duration: 4, repeat: Infinity, ease: 'easeInOut' } }}>
        <span className="ld-dot warn" /> <div><b>Notun Bazar: Tk 1.4 L overdue</b><small>46 days · tap to collect</small></div>
      </motion.div>
      <motion.div className="ld-float ld-float-2" initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0, y: [0, 8, 0] }} transition={{ opacity: { delay: 1.9 }, x: { delay: 1.9, duration: 0.6 }, y: { delay: 2.5, duration: 5, repeat: Infinity, ease: 'easeInOut' } }}>
        <Icon name="barcode" size={18} /> <div><b>Carton scanned</b><small>Soyabean oil 5 L · +6 jars</small></div>
      </motion.div>
      <motion.div className="ld-float ld-float-3" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1, rotate: [0, -3, 0] }} transition={{ opacity: { delay: 2.2 }, scale: { delay: 2.2, type: 'spring', stiffness: 260, damping: 14 }, rotate: { delay: 3, duration: 6, repeat: Infinity } }}>
        <Icon name="sparkle" size={16} /> <span>“Who owes us the most?”</span>
      </motion.div>
    </motion.div>
  )
}

/** A number that counts up when it scrolls into view (GSAP). */
function Counter({ value, suffix }: { value: number; suffix: string }) {
  const el = useRef<HTMLSpanElement>(null)
  useGSAP(() => {
    const n = { v: 0 }
    gsap.to(n, {
      v: value, duration: 1.6, ease: 'power3.out', scrollTrigger: { trigger: el.current, start: 'top 88%', once: true },
      onUpdate: () => { if (el.current) el.current.textContent = Math.round(n.v) + suffix },
    })
  }, { scope: el })
  return <span ref={el}>0{suffix}</span>
}

/** A section heading that fades up as it enters. */
function SectionHead({ kicker, title, text }: { kicker: string; title: string; text?: string }) {
  return (
    <motion.div className="ld-section-head" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.7, ease }}>
      <span className="ld-kicker">{kicker}</span>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </motion.div>
  )
}

/* ---------------------------------------------------------------- sections */

function Nav() {
  const { scrollY } = useScroll()
  const bg = useTransform(scrollY, [0, 80], ['rgba(10,24,21,0)', 'rgba(10,24,21,0.82)'])
  const [open, setOpen] = useState(false)
  const links: [string, string][] = [['Features', '#features'], ['How it works', '#journey'], ['Pricing', '#pricing'], ['FAQ', '#faq']]
  const jump = (id: string) => {
    setOpen(false)
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' })
  }
  return (
    <motion.header className="ld-nav" style={{ backgroundColor: bg }}>
      <a className="ld-brand" href="#/"><Logo height={38} light /></a>
      <nav className={open ? 'open' : ''} aria-label="Page">
        {links.map(([label, id]) => <button key={id} type="button" onClick={() => jump(id)}>{label}</button>)}
      </nav>
      <div className="ld-nav-right">
        <LangSwitch dark />
        <a className="ld-link" href="#/signin">Sign in</a>
        <Magnetic href="#/signup" className="ld-btn ld-btn-sm">Start free trial</Magnetic>
        <button type="button" className="ld-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Icon name={open ? 'close' : 'grid'} size={22} /></button>
      </div>
    </motion.header>
  )
}

function Hero() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '30%'])
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0])
  return (
    <section ref={ref} className="ld-hero">
      <div className="ld-aurora" aria-hidden="true"><i /><i /><i /></div>
      <div className="ld-grid-bg" aria-hidden="true" />
      <motion.div className="ld-hero-inner" style={{ y, opacity: fade }}>
        <div className="ld-hero-copy">
          <motion.span className="ld-pill" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="ld-pulse" /> Made in Bangladesh for traders everywhere
          </motion.span>
          <Headline text="Run your whole trade from one screen" highlight="whole" />
          <motion.p className="ld-lead" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.8, ease }}>
            Factory orders, LC imports, customs, stock, dealer sales, delivery, dues, VAT and accounts. Built for importers, exporters and distributors, on the phone and the computer.
          </motion.p>
          <motion.div className="ld-cta" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.8, ease }}>
            <Magnetic href="#/signup" className="ld-btn">Start your free trial <Icon name="arrowRight" size={18} /></Magnetic>
            <a className="ld-btn ld-btn-ghost" href="#/signin">Try the demo</a>
          </motion.div>
          <motion.ul className="ld-trust" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 1.1 } } }}>
            {['Each company’s books kept apart', 'bKash · Nagad · Card', 'BD VAT and BIN ready', 'English and বাংলা'].map((t) => (
              <motion.li key={t} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}><Icon name="check" size={15} /> {t}</motion.li>
            ))}
          </motion.ul>
        </div>
        <HeroMockup />
      </motion.div>
    </section>
  )
}

function Marquee() {
  const track = useRef<HTMLDivElement>(null)
  useGSAP(() => {
    const tween = gsap.to('.ld-marquee-track', { xPercent: -50, duration: 32, ease: 'none', repeat: -1 })
    // speeds up and flips with scroll direction, then settles back
    ScrollTrigger.create({
      onUpdate: (self) => {
        gsap.to(tween, { timeScale: self.direction * Math.min(4, 1 + Math.abs(self.getVelocity()) / 400), duration: 0.3, overwrite: true })
        gsap.to(tween, { timeScale: self.direction, duration: 1.2, delay: 0.3, overwrite: false })
      },
    })
  }, { scope: track })
  const row = [...TRADES, ...TRADES]
  return (
    <div className="ld-marquee" ref={track} aria-label="Made for">
      <div className="ld-marquee-track">
        {row.map((t, i) => <span key={i}>{t}<Icon name="sparkle" size={14} /></span>)}
      </div>
    </div>
  )
}

function Features() {
  return (
    <section id="features" className="ld-section">
      <SectionHead kicker="Everything in one plan" title="All the work of a trading company" text="No modules to buy separately. Turn on what your trade needs; the rest stays out of the way." />
      <motion.div className="ld-features" initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
        {FEATURES.map((f) => (
          <motion.article key={f.title} className={`ld-feature tone-${f.tone}`}
            variants={{ hidden: { opacity: 0, y: 40, scale: 0.96 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease } } }}
            whileHover={{ y: -8, transition: { type: 'spring', stiffness: 300, damping: 18 } }}>
            <motion.span className="ld-feature-icon" whileHover={{ rotate: [0, -12, 10, 0], scale: 1.1 }} transition={{ duration: 0.5 }}><Icon name={f.icon} size={26} /></motion.span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </motion.article>
        ))}
      </motion.div>
    </section>
  )
}

/** Pinned on wide screens: scrolling drives a truck along the route and lights each step (GSAP ScrollTrigger). */
function Journey() {
  const root = useRef<HTMLElement>(null)
  useGSAP(() => {
    const mm = gsap.matchMedia()
    mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
      // the whole section (heading included) stays on screen while scrolling drives the truck along
      const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: 'top top', end: '+=1800', scrub: 0.8, pin: true } })
      tl.fromTo('.ld-route-fill', { scaleX: 0 }, { scaleX: 1, ease: 'none', duration: JOURNEY.length }, 0)
      tl.fromTo('.ld-truck', { left: '0%' }, { left: '100%', ease: 'none', duration: JOURNEY.length }, 0)
      JOURNEY.forEach((_, i) => {
        tl.fromTo(`.ld-stop-${i}`, { opacity: 0.25, y: 30 }, { opacity: 1, y: 0, duration: 0.5 }, i * (JOURNEY.length / (JOURNEY.length - 1)) * 0.92)
        tl.fromTo(`.ld-stop-${i} .ld-stop-icon`, { scale: 0.7, backgroundColor: 'rgba(255,255,255,0.06)' }, { scale: 1, backgroundColor: '#f26b1d', duration: 0.4 }, '<')
      })
    })
    mm.add('(max-width: 899px), (prefers-reduced-motion: reduce)', () => {
      gsap.utils.toArray<HTMLElement>('.ld-stop').forEach((el) => {
        gsap.fromTo(el, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6, scrollTrigger: { trigger: el, start: 'top 85%', once: true } })
      })
    })
  }, { scope: root })
  return (
    <section id="journey" ref={root} className="ld-section ld-journey">
      <SectionHead kicker="How goods move" title="From the factory to the dealer, and the money back" text="Every step leaves a record: stock, cost, dues and cash stay right without anyone adding them up." />
      <div className="ld-journey-stage">
        <div className="ld-route" aria-hidden="true">
          <div className="ld-route-fill" />
          <div className="ld-truck"><Icon name="truck" size={26} /></div>
        </div>
        <ol className="ld-stops">
          {JOURNEY.map((s, i) => (
            <li key={s.title} className={`ld-stop ld-stop-${i}`}>
              <span className="ld-stop-icon"><Icon name={s.icon} size={24} /></span>
              <b>{i + 1}. {s.title}</b>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Stats() {
  return (
    <section className="ld-stats">
      {STATS.map((s) => (
        <motion.div key={s.label} className="ld-stat" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease }}>
          <b><Counter value={s.value} suffix={s.suffix} /></b>
          <span>{s.label}</span>
        </motion.div>
      ))}
    </section>
  )
}

/** A small drawing for each showcase tab. */
function ShowcaseArt({ k }: { k: string }) {
  const row = (a: string, b: string, tone = '') => <div className={`ld-art-row ${tone}`}><span>{a}</span><b>{b}</b></div>
  if (k === 'sell') return <div className="ld-art">{row('Mosquito coil × 20 ctn', 'Tk 48,000')}{row('Soyabean oil 5 L × 40', 'Tk 34,000')}{row('VAT 5% (in price)', 'Tk 3,905', 'muted')}{row('Total', 'Tk 82,000', 'strong')}<div className="ld-art-scan"><Icon name="barcode" size={18} /> Scan to add a product</div></div>
  if (k === 'deliver') return <div className="ld-art">{row('INV-2311 · Rahman Traders', 'Partly delivered')}<div className="ld-art-progress"><motion.i initial={{ width: 0 }} animate={{ width: '64%' }} transition={{ duration: 1.2, ease }} /></div>{row('Mosquito coil', '13 of 20 ctn')}{row('Soyabean oil 5 L', '25 of 40')}<div className="ld-art-scan"><Icon name="scan" size={18} /> Carton scanned · +6</div></div>
  if (k === 'accounts') return <div className="ld-art">{row('1010 Cash in hand', 'Tk 1,40,300')}{row('1100 Dealer dues', 'Tk 3,01,461')}{row('2100 Expenses due', 'Tk 53,900', 'warn')}{row('2200 VAT payable', 'Tk 3,11,638', 'warn')}{row('Profit this month', 'Tk 79,513', 'strong')}</div>
  return <div className="ld-art">{row('⚠ Notun Bazar overdue 46 days', 'Tk 1.4 L', 'warn')}{row('Truck 1 insurance expired', 'Renew', 'warn')}{row('FO-1041 is late', '80 jars due')}{row('Book October depreciation', '6 assets', 'muted')}</div>
}

function Showcase() {
  const [tab, setTab] = useState(SHOWCASE[0].key)
  const cur = SHOWCASE.find((s) => s.key === tab)!
  return (
    <section className="ld-section">
      <SectionHead kicker="See it work" title="Made for the counter, the warehouse and the office" />
      <div className="ld-show">
        <div className="ld-show-tabs" role="tablist">
          {SHOWCASE.map((s) => (
            <button key={s.key} type="button" role="tab" aria-selected={tab === s.key} className={tab === s.key ? 'on' : ''} onClick={() => setTab(s.key)}>
              {tab === s.key && <motion.span layoutId="ld-tab-bg" className="ld-tab-bg" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />}
              <Icon name={s.icon} size={18} /> <span>{s.label}</span>
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={tab} className="ld-show-panel" initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -16, filter: 'blur(6px)' }} transition={{ duration: 0.45, ease }}>
            <div className="ld-show-copy"><h3>{cur.title}</h3><p>{cur.text}</p><a className="ld-link-arrow" href="#/signup">Try it free <Icon name="arrowRight" size={16} /></a></div>
            <ShowcaseArt k={tab} />
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="pricing" className="ld-section">
      <SectionHead kicker="Simple pricing" title="One plan with everything. Pay for the months you need." text="Start with a free trial. No card needed. Pay by bKash, Nagad, card or bank." />
      <div className="ld-plans">
        {PLANS.map((p, i) => (
          <motion.div key={p.id} className={`ld-plan${p.popular ? ' popular' : ''}`} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.12, duration: 0.7, ease }} whileHover={{ y: -6 }}>
            {p.badge && <span className="ld-plan-badge">{p.badge}</span>}
            <h3>{p.label}</h3>
            <div className="ld-price">৳{p.price.toLocaleString('en-IN')}<small>/ {p.months} months</small></div>
            <p className="ld-per">≈ ৳{Math.round(p.price / p.months).toLocaleString('en-IN')} a month</p>
            <ul>{PLAN_FEATURES.map((f) => <li key={f}><Icon name="check" size={15} /> {f}</li>)}</ul>
            <a className={`ld-btn${p.popular ? '' : ' ld-btn-ghost'}`} href="#/signup">Start free trial</a>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="ld-section ld-faq-wrap">
      <SectionHead kicker="Questions" title="Good to know" />
      <div className="ld-faq">
        {FAQ.map(([q, a], i) => (
          <motion.div key={q} layout className={`ld-faq-item${open === i ? ' open' : ''}`} transition={{ layout: { duration: 0.35, ease } }}>
            <motion.button layout="position" type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              <span>{q}</span>
              <motion.span className="ld-faq-plus" animate={{ rotate: open === i ? 45 : 0 }}><Icon name="plus" size={18} /></motion.span>
            </motion.button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.p key="a" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease }}>{a}</motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function Closing() {
  return (
    <section className="ld-closing">
      <div className="ld-aurora small" aria-hidden="true"><i /><i /></div>
      <motion.div initial={{ opacity: 0, scale: 0.94 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, ease }}>
        <h2>Open your books today</h2>
        <p>Set up in minutes, with sample data to try everything first.</p>
        <div className="ld-cta center">
          <Magnetic href="#/signup" className="ld-btn">Start your free trial <Icon name="arrowRight" size={18} /></Magnetic>
          <a className="ld-btn ld-btn-ghost" href="#/signin">Sign in</a>
        </div>
      </motion.div>
    </section>
  )
}

/* ---------------------------------------------------------------- page */

export default function LandingPage() {
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24 })
  return (
    <MotionConfig reducedMotion="user">
      <div className={`ld${reduce ? ' ld-still' : ''}`}>
        <motion.div className="ld-progress" style={{ scaleX: progress }} aria-hidden="true" />
        <Nav />
        <main>
          <Hero />
          <Marquee />
          <Features />
          <Journey />
          <Stats />
          <Showcase />
          <Pricing />
          <Faq />
          <Closing />
        </main>
        <footer className="ld-foot">
          <Logo height={34} light />
          <span>© {new Date().getFullYear()} {BRAND} · Powered by <b>{POWERED_BY}</b></span>
          <span className="ld-foot-links"><a href="#/signin">Sign in</a><a href="#/signup">Start free trial</a></span>
        </footer>
      </div>
    </MotionConfig>
  )
}
