import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { Icon, type IconName } from '@/ui'
import { Reveal, SectionHead } from './parts'

/**
 * Photo-led sections for the public pages: an auto-rotating "solutions by industry" showcase whose
 * photos cross-fade with a slow zoom, a two-row moving photo strip, and a scroll-driven collage.
 * Everything stands still for visitors who ask for reduced motion.
 */

const M = '/media/'

/** Photos that cross-fade one after another with a slow zoom; dots below pick one. */
export function ImageStack({ images, every = 3500, paused = false, label }: { images: { src: string; alt: string; pos?: string }[]; every?: number; paused?: boolean; label: string }) {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [hover, setHover] = useState(false)
  const stop = paused || hover || !!reduce
  useEffect(() => {
    if (stop || images.length < 2) return
    const t = setInterval(() => setI((x) => (x + 1) % images.length), every)
    return () => clearInterval(t)
  }, [stop, every, images.length])
  const cur = images[i % images.length]
  return (
    <div className="px-stack" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} role="group" aria-roledescription="slideshow" aria-label={label}>
      <AnimatePresence initial={false} mode="sync">
        <motion.img key={cur.src} src={M + cur.src} alt={cur.alt} style={{ objectPosition: cur.pos }} className={reduce ? '' : 'kb'}
          initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
      </AnimatePresence>
      {images.length > 1 && (
        <div className="px-stack-dots">
          {images.map((im, k) => <button key={im.src} type="button" aria-label={`Show photo ${k + 1}: ${im.alt}`} aria-current={k === i % images.length} className={k === i % images.length ? 'on' : ''} onClick={() => setI(k)} />)}
        </div>
      )}
    </div>
  )
}

type Solution = { id: string; icon: IconName; title: string; text: string; points: string[]; images: { src: string; alt: string; pos?: string }[]; to: string; cta: string }

const SOLUTIONS: Solution[] = [
  {
    id: 'trade', icon: 'ship', title: 'Import and export', text: 'From the LC or sales contract to goods on your shelf, with every step dated and confirmed.',
    points: ['LC, shipped, port, customs and warehouse in order', 'Duty, VAT and AIT worked out per customs regime', 'Landed cost goes into stock cost by itself'],
    images: [{ src: 'port-aerial.jpg', alt: 'Cranes and cars at a port' }, { src: 'container-terminal.jpg', alt: 'Container ship being loaded' }, { src: 'hero-trade.jpg', alt: 'Container yard seen from above' }],
    to: '#/signup', cta: 'Start free',
  },
  {
    id: 'factory', icon: 'factory', title: 'Factory and manufacturing', text: 'Your own floor and your subcontractors: materials out, finished goods in, people paid.',
    points: ['Recipes say what one unit uses', 'Factory orders received in parts, wastage settled', 'Attendance, daily wages and contract pay'],
    images: [{ src: 'stock-check.jpg', alt: 'Checking rolls of material by phone', pos: '35% 50%' }, { src: 'forklift-store.jpg', alt: 'Raw materials stacked on pallets' }, { src: 'warehouse-racks.jpg', alt: 'Finished goods stored on racks' }],
    to: '#/signup', cta: 'Start free',
  },
  {
    id: 'warehouse', icon: 'building', title: 'Warehouse and inventory', text: 'Every godown with its own code and stock, and nothing counted until someone checks it in.',
    points: ['Stock per warehouse and per supplier', 'Goods confirmed in by the warehouse manager', 'Barcode labels for units and cartons'],
    images: [{ src: 'warehouse-racks.jpg', alt: 'High racks of boxed stock in a warehouse' }, { src: 'forklift-store.jpg', alt: 'Reach truck between pallets of goods' }, { src: 'supermarket-aisle.jpg', alt: 'Aisle of a cash-and-carry warehouse' }],
    to: '#/signup', cta: 'Start free',
  },
  {
    id: 'wholesale', icon: 'truck', title: 'Wholesale and distribution', text: 'Dealers on credit, goods delivered in parts, and money collected on time.',
    points: ['Credit limits checked before every bill', 'Part deliveries, trips, challans and courier', 'Dues by invoice with WhatsApp and SMS reminders'],
    images: [{ src: 'shelves-aerial.jpg', alt: 'Long rows of stocked shelves seen from above' }, { src: 'supermarket-aisle.jpg', alt: 'Pallets and shelves in a wholesale aisle' }, { src: 'forklift-store.jpg', alt: 'Bagged goods stacked on pallets' }],
    to: '#/signup', cta: 'Start free',
  },
  {
    id: 'retail', icon: 'store', title: 'Supplying shops and supermarkets', text: 'Fast bills for many small orders, returns handled cleanly, and margins you can see.',
    points: ['Scan a barcode to add goods to a bill', 'Returns with reasons, credited against dues', 'Daily sales, margins and best sellers'],
    images: [{ src: 'retail-market.jpg', alt: 'Fruit and bakery at a market entrance' }, { src: 'shelves-aerial.jpg', alt: 'Supermarket shelves full of goods' }, { src: 'stock-check.jpg', alt: 'Stock check on the phone', pos: '35% 50%' }],
    to: '#/signup', cta: 'Start free',
  },
]

/** ERP solutions by industry: the list rotates by itself with a progress bar; each has its own photos. */
export function SolutionsShowcase() {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [hold, setHold] = useState(false)
  const DURATION = 9000
  const auto = !reduce && !hold
  useEffect(() => {
    if (!auto) return
    const t = setTimeout(() => setI((x) => (x + 1) % SOLUTIONS.length), DURATION)
    return () => clearTimeout(t)
  }, [i, auto])
  const s = SOLUTIONS[i]
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // on phones the list scrolls sideways: keep the active solution in view as it changes
    const row = list.current
    const btn = row?.querySelector<HTMLElement>('button.on')
    if (!row || !btn || row.scrollWidth <= row.clientWidth) return
    row.scrollTo({ left: btn.offsetLeft - row.clientWidth / 2 + btn.offsetWidth / 2, behavior: 'smooth' })
  }, [i])
  return (
    <section id="solutions" className="px-section">
      <SectionHead kicker="ERP solutions" title="One system for every kind of trading business" text="Import and export houses, factories, warehouses and distributors each get the screens their work needs, in the same books." />
      <div className="px-solutions" onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)} onFocusCapture={() => setHold(true)} onBlurCapture={() => setHold(false)}>
        <div className="px-sol-list" ref={list} role="tablist" aria-label="Solutions">
          {SOLUTIONS.map((x, k) => (
            <button key={x.id} type="button" role="tab" aria-selected={k === i} className={k === i ? 'on' : ''} onClick={() => setI(k)}>
              <span className="px-feature-icon sm"><Icon name={x.icon} size={18} /></span>
              <span className="px-sol-title">{x.title}</span>
              {k === i && auto && <motion.i className="px-sol-bar" key={`bar-${i}`} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: DURATION / 1000, ease: 'linear' }} />}
            </button>
          ))}
        </div>
        <div className="px-sol-stage">
          <ImageStack key={s.id} images={s.images} label={s.title} paused={hold} every={3000} />
          <AnimatePresence mode="wait">
            <motion.div key={s.id} className="px-sol-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }}>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <ul>{s.points.map((pt) => <li key={pt}><Icon name="check" size={16} /> {pt}</li>)}</ul>
              <a className="px-btn px-btn-sm" href={s.to}>{s.cta} <Icon name="arrowRight" size={16} /></a>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

const STRIP_A = ['port-aerial.jpg', 'warehouse-racks.jpg', 'insights-1.jpg', 'shelves-aerial.jpg', 'container-terminal.jpg', 'retail-market.jpg']
const STRIP_B = ['forklift-store.jpg', 'stock-check.jpg', 'container-yard.jpg', 'supermarket-aisle.jpg', 'hero-trade.jpg', 'insights-2.jpg']

/** Two rows of photos gliding in opposite directions; hover stops them; reduced motion shows a still row. */
export function PhotoMarquee() {
  const row = (list: string[], dir: 'left' | 'right') => (
    <div className={`px-marquee ${dir}`}>
      <div className="px-marquee-track">
        {[...list, ...list].map((src, k) => <img key={k} src={M + src} alt="" loading="lazy" aria-hidden={k >= list.length} />)}
      </div>
    </div>
  )
  return (
    <section className="px-section px-marquee-wrap" aria-label="Photos from ports, warehouses and shops">
      <SectionHead kicker="Where Qyndms works" title="Ports, godowns, warehouses and shop shelves" />
      {row(STRIP_A, 'left')}
      {row(STRIP_B, 'right')}
    </section>
  )
}

/** Three photos that drift at different speeds as you scroll, beside the warehouse story. */
export function WarehouseCollage() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const a = useTransform(scrollYProgress, [0, 1], [40, -40])
  const b = useTransform(scrollYProgress, [0, 1], [90, -90])
  const c = useTransform(scrollYProgress, [0, 1], [-30, 50])
  const points: { icon: IconName; title: string; text: string }[] = [
    { icon: 'building', title: 'Godowns with codes', text: 'TNG-01, CTG-01: stock, moves and value per warehouse.' },
    { icon: 'check', title: 'Confirmed receiving', text: 'Supplier and factory goods count only after the manager checks them in.' },
    { icon: 'barcode', title: 'Scan at every step', text: 'Carton labels scanned at receiving, delivery and returns.' },
    { icon: 'alert', title: 'Reorder in time', text: 'Days of stock left and what to reorder, worked out for you.' },
  ]
  return (
    <section id="warehouse" className="px-section px-soft">
      <div className="px-split">
        <div className="px-collage" ref={ref}>
          <motion.img style={{ y: a }} className="c1" src={M + 'warehouse-racks.jpg'} alt="High racks of boxed stock in a warehouse" loading="lazy" />
          <motion.img style={{ y: b }} className="c2" src={M + 'forklift-store.jpg'} alt="Reach truck between pallets of bagged goods" loading="lazy" />
          <motion.img style={{ y: c }} className="c3" src={M + 'stock-check.jpg'} alt="Checking stock of material rolls on the phone" loading="lazy" />
        </div>
        <div>
          <SectionHead center={false} kicker="Warehouse and inventory" title="Every carton, every godown, always counted" text="Know what you hold, where it is, who it came from and when to reorder, without walking the aisles." />
          <ul className="px-checks">
            {points.map((x, k) => (
              <Reveal key={x.title} delay={k * 0.06}>
                <li><span className="px-feature-icon sm"><Icon name={x.icon} size={18} /></span><span><b>{x.title}</b><small>{x.text}</small></span></li>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
