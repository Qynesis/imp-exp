/**
 * The public landing page, laid out like a modern photo site: a big headline with two video cards
 * beside it, pill tabs, a panel of trades, a masonry wall of real port, warehouse and shop media,
 * then solutions, features, warehouse, insights and questions. Motion is gentle and switches
 * off for visitors who ask for reduced motion.
 */
import { useMemo, useState } from 'react'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import { Icon, type IconName } from '@/ui'
import { ChipPanel, PillTabs, Reveal, SectionHead, SiteFooter, SiteNav, VideoBg } from './parts'
import { scrollToSection } from './scroll'
import { PhotoMarquee, SolutionsShowcase, WarehouseCollage } from './Solutions'
import '@fontsource-variable/plus-jakarta-sans'
import './landing.css'

const M = '/media/'
const T = M + 'thumbs/'

const NAV = [
  { label: 'Features', to: 'features' },
  { label: 'Industries', to: 'industries' },
  { label: 'Solutions', to: 'solutions' },
]

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'ship', title: 'Imports, exports and LC', text: 'Every shipment step from LC or contract to the warehouse, confirmed with its date and note.' },
  { icon: 'shield', title: 'Customs clearance', text: 'Duty, VAT and AIT worked out per regime; each stage confirmed with a note.' },
  { icon: 'factory', title: 'Factory orders', text: 'Materials handed over, finished goods received in parts, factory bills and payments.' },
  { icon: 'store', title: 'Suppliers and purchases', text: 'Bills, dues and payments for every supplier, with their goods in your warehouses.' },
  { icon: 'building', title: 'Warehouses with codes', text: 'Stock per godown, moves between them, goods confirmed in by the warehouse manager.' },
  { icon: 'box', title: 'Products and stock', text: 'Live stock, held for bills, low-stock alerts, recipes for what each item uses.' },
  { icon: 'barcode', title: 'Barcode labels', text: 'Print unit and carton labels; scan at receiving, delivery and returns.' },
  { icon: 'receipt', title: 'Selling and dues', text: 'Bills in a minute, credit limits checked, dues by invoice and one tap to collect.' },
  { icon: 'truck', title: 'Delivery and courier', text: 'Deliver part, keep the rest pending; trips, challans and courier booking.' },
  { icon: 'send', title: 'WhatsApp and SMS', text: 'Bills, payments and reminders sent by themselves or one by one.' },
  { icon: 'wallet', title: 'Cash, accounts and VAT', text: 'Cash, bank, bKash and Nagad balances, chart of accounts, VAT and P&L.' },
  { icon: 'badge', title: 'Staff, attendance and pay', text: 'Phone check-in, leave, salaries, daily wages and written work reports.' },
  { icon: 'trend', title: 'Business insights', text: 'Forecasts, unusual days, dealer segments, profit bridge and cash cycle, in charts.' },
  { icon: 'sparkle', title: 'AI analyst', text: 'A plain-words briefing and ranked decisions; ask it questions in English or বাংলা.' },
]

const TRADES: { label: string; note: string; thumb: string; to: string }[] = [
  { label: 'Importers', note: 'LC · customs', thumb: 'port', to: '#/signup' },
  { label: 'Exporters', note: 'contracts', thumb: 'terminal', to: '#/signup' },
  { label: 'FMCG distributors', note: 'dealers', thumb: 'aisle', to: '#/signup' },
  { label: 'Factories', note: 'orders', thumb: 'rolls', to: '#/signup' },
  { label: 'Electronics', note: 'serials', thumb: 'phone', to: '#/signup/electronics' },
  { label: 'Medicine', note: 'batches', thumb: 'charts', to: '#/signup/medical' },
  { label: 'Wholesalers', note: 'credit', thumb: 'shelves', to: '#/signup' },
  { label: 'Supermarket suppliers', note: 'returns', thumb: 'market', to: '#/signup' },
  { label: 'Warehousing', note: 'godowns', thumb: 'racks', to: '#/signup' },
]

const WALL: { kind: 'img' | 'video'; src: string; poster?: string; title: string; note: string; to?: string; h: number; pos?: string }[] = [
  { kind: 'video', src: 'hero-trade.mp4', poster: 'hero-trade.jpg', title: 'Imports and exports', note: 'LC to warehouse, every step confirmed', h: 0.62 },
  { kind: 'img', src: 'container-yard.jpg', title: 'Every container accounted for', note: 'Landed cost into stock by itself', h: 1.3, pos: '50% 88%' },
  { kind: 'img', src: 'port-aerial.jpg', title: 'At the port', note: 'Customs stages with notes', h: 0.56 },
  { kind: 'video', src: 'insights-2.mp4', poster: 'insights-2.jpg', title: 'Insights and AI', note: 'Decide with data', h: 0.56 },
  { kind: 'img', src: 'supermarket-aisle.jpg', title: 'Cash-and-carry aisles', note: 'Pallets, shelves and stock in one view', h: 1.3 },
  { kind: 'img', src: 'container-terminal.jpg', title: 'Exports out on time', note: 'Ready, shipped and paid', h: 0.66 },
  { kind: 'img', src: 'warehouse-racks.jpg', title: 'Godowns with codes', note: 'Stock per warehouse, always counted', h: 1.25 },
  { kind: 'img', src: 'shelves-aerial.jpg', title: 'Shelves that never run dry', note: 'Reorder alerts and days of stock', h: 0.56 },
  { kind: 'img', src: 'retail-market.jpg', title: 'Supplying shops and markets', note: 'Fast bills, returns and dues', h: 1.3 },
  { kind: 'video', src: 'insights-1.mp4', poster: 'insights-1.jpg', title: 'Reports that answer questions', note: 'Forecasts and unusual days', h: 0.56 },
]

const JOURNEY: { icon: IconName; title: string; text: string }[] = [
  { icon: 'factory', title: 'Order or open an LC', text: 'From a factory with an advance, or an LC with your bank.' },
  { icon: 'ship', title: 'Ship and clear customs', text: 'Steps confirmed in order; duty worked out for you.' },
  { icon: 'building', title: 'Check in at the warehouse', text: 'The warehouse confirms what arrived and what was short.' },
  { icon: 'truck', title: 'Sell and deliver', text: 'Bill the dealer, scan cartons onto the truck.' },
  { icon: 'wallet', title: 'Collect the money', text: 'Cash, bank or bKash; dues cleared and receipts kept.' },
]

const FAQ = [
  ['Does it work for a small trading company?', 'Yes. Start with sales, stock and dues, and switch on imports, exports, factory orders or accounts when your business needs them.'],
  ['Can my staff use it on their phones?', 'Every screen works on phones as well as computers. Each user signs in with their own login, and their role decides what they can see and change.'],
  ['Is it only for Bangladesh?', 'It is made in Bangladesh, with Taka, BIN, VAT, bKash and Nagad set up. Pick China, USA, India, UAE and more for their currency and tax rates.'],
  ['Is my data private?', 'Each company has its own private books. Staff see only what their role allows, and the AI analyst reads a rounded summary limited to the same.'],
]

/* ---------------------------------------------------------------- sections */

function Hero() {
  return (
    <section className="px-hero">
      <div className="px-hero-text">
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          Import, export and distribution software, from port to payment.
        </motion.h1>
        <motion.p className="px-hero-sub big" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}>
          LC and customs, warehouses, factory orders, dealer sales, dues and cash, with insights and an AI analyst that tell you what to do next.
        </motion.p>
        <motion.div className="px-actions" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}>
          <a className="px-btn" href="#/signup">Start free <Icon name="arrowRight" size={18} /></a>
          <a className="px-btn px-btn-ghost" href="#/signin">Try the live demo</a>
        </motion.div>
      </div>
      <div className="px-hero-cards">
        <motion.a href="#/signup" className="px-media-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }}>
          <VideoBg src={M + 'hero-trade.mp4'} small={M + 'hero-trade-sm.mp4'} poster={M + 'hero-trade.jpg'} label="Aerial view of a container terminal" />
          <span className="px-media-copy"><small><Icon name="clock" size={15} /> Free trial</small><b>Imports, exports and LC</b><em>Start free →</em></span>
        </motion.a>
        <motion.a href="#/signin" className="px-media-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.25 }}>
          <VideoBg src={M + 'insights-2.mp4'} poster={M + 'insights-2.jpg'} label="Reviewing sales charts on a phone" />
          <span className="px-media-copy"><small><Icon name="sparkle" size={15} /> New</small><b>Insights and AI analyst</b><em>See the demo →</em></span>
        </motion.a>
      </div>
    </section>
  )
}

function Industries() {
  return (
    <section id="industries" className="px-section px-tight">
      <div className="px-row-head">
        <h2>Made for your trade</h2>
        <a className="px-outline" href="#/signin">Try the demo <Icon name="chevron" size={14} /></a>
      </div>
      <ChipPanel title={<>Popular with traders in <span aria-hidden="true">🇧🇩</span> Bangladesh</>} more={{ label: 'All features', onClick: () => scrollToSection('features') }}>
        {TRADES.map((t) => (
          <a key={t.label} className="px-chip" href={t.to}><img src={T + t.thumb + '.jpg'} alt="" /><span>{t.label}</span><small>{t.note}</small></a>
        ))}
      </ChipPanel>
    </section>
  )
}

function Wall() {
  return (
    <section className="px-section px-tight">
      <div className="px-row-head">
        <h2>From the port to the shop shelf</h2>
      </div>
      <div className="px-wall">
        {WALL.map((w, i) => {
          const inner = (
            <>
              {w.kind === 'video'
                ? <VideoBg src={M + w.src} poster={M + w.poster} label={w.title} />
                : <img src={M + w.src} alt={w.title} loading="lazy" style={w.pos ? { objectPosition: w.pos } : undefined} />}
              <span className="px-wall-cap"><b>{w.title}</b><small>{w.note}</small></span>
              {w.kind === 'video' && <span className="px-wall-tag">Video</span>}
            </>
          )
          return (
            <Reveal key={w.src} delay={(i % 3) * 0.05} className="px-wall-item">
              <div className="px-wall-media" style={{ aspectRatio: `1 / ${w.h}` }}>
                {w.to ? <a href={w.to} aria-label={w.title}>{inner}</a> : inner}
              </div>
            </Reveal>
          )
        })}
      </div>
    </section>
  )
}

function Features() {
  return (
    <section id="features" className="px-section px-soft">
      <SectionHead kicker="Everything in one place" title="All the work of a trading company" text="Turn on the parts your trade needs. Everyone works in the same books, from the port to the dealer’s shop." />
      <div className="px-features">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={(i % 3) * 0.05} className="px-feature">
            <span className="px-feature-icon"><Icon name={f.icon} size={22} /></span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function Journey() {
  return (
    <section className="px-section">
      <SectionHead kicker="How goods move" title="One flow, five steps, nothing lost between them" text="Each step needs a confirmation with its date and a note, so the books always match what really happened." />
      <ol className="px-journey">
        {JOURNEY.map((j, i) => (
          <Reveal key={j.title} delay={i * 0.06} className="px-step">
            <span className="px-step-num">{i + 1}</span>
            <span className="px-step-icon"><Icon name={j.icon} size={20} /></span>
            <b>{j.title}</b>
            <small>{j.text}</small>
          </Reveal>
        ))}
      </ol>
    </section>
  )
}

function Insights() {
  const items: { icon: IconName; title: string; text: string }[] = [
    { icon: 'trend', title: 'Sales forecast', text: 'The next three months with a likely range, learned from your own sales.' },
    { icon: 'alert', title: 'Unusual days', text: 'Spikes and drops against the normal week, each with the reason.' },
    { icon: 'users', title: 'Dealer segments', text: 'Champions, loyal, at risk and lost, so you know who to visit.' },
    { icon: 'sparkle', title: 'AI briefing', text: 'A short report and ranked decisions; ask it questions in English or বাংলা.' },
  ]
  return (
    <section id="insights" className="px-section px-soft">
      <div className="px-split">
        <Reveal className="px-split-media">
          <div className="px-video-card"><VideoBg src={M + 'insights-2.mp4'} poster={M + 'insights-2.jpg'} label="Business owner reviewing sales charts on a phone" /></div>
        </Reveal>
        <div>
          <SectionHead center={false} kicker="Insights and AI analyst" title="Decide with data, not guesswork" text="Charts that answer real questions: what will sell next month, which dealer is slipping, why profit moved and whether cash will last." />
          <ul className="px-checks">
            {items.map((x) => <li key={x.title}><span className="px-feature-icon sm"><Icon name={x.icon} size={18} /></span><span><b>{x.title}</b><small>{x.text}</small></span></li>)}
          </ul>
          <a className="px-btn" href="#/signin">See it in the demo <Icon name="arrowRight" size={18} /></a>
        </div>
      </div>
    </section>
  )
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="px-section">
      <SectionHead kicker="Questions" title="Good to know" />
      <div className="px-faq">
        {FAQ.map(([q, a], i) => (
          <div key={q} className={`px-faq-item${open === i ? ' open' : ''}`}>
            <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}><span>{q}</span><Icon name="plus" size={18} /></button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }}><p>{a}</p></motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  )
}

function Closing() {
  return (
    <section className="px-section">
      <Reveal className="px-closing">
        <img src={M + 'container-terminal.jpg'} alt="" loading="lazy" />
        <div className="px-banner-shade center" />
        <div className="px-closing-copy">
          <h2>Bring your whole trade into one set of books</h2>
          <p>Free trial for every new company. Your data stays private to your company.</p>
          <div className="px-actions">
            <a className="px-btn px-btn-light" href="#/signup">Start your free trial <Icon name="arrowRight" size={18} /></a>
            <a className="px-btn px-btn-clear" href="#/signin">Try the demo</a>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

export default function LandingPage() {
  const tabs = useMemo(() => [
    { id: 'top', label: 'Home' }, { id: 'industries', label: 'Industries' }, { id: 'solutions', label: 'Solutions' }, { id: 'features', label: 'Features' },
    { id: 'insights', label: 'Insights and AI', badge: 'NEW' }, { id: 'faq', label: 'FAQ' },
  ], [])
  return (
    <MotionConfig reducedMotion="user">
      <div className="px" id="top">
        <SiteNav links={NAV} />
        <main>
          <Hero />
          <PillTabs tabs={tabs} />
          <Industries />
          <SolutionsShowcase />
          <Wall />
          <Features />
          <WarehouseCollage />
          <Journey />
          <Insights />
          <PhotoMarquee />
          <Faq />
          <Closing />
        </main>
        <SiteFooter />
      </div>
    </MotionConfig>
  )
}
