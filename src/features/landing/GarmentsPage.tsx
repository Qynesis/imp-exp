/**
 * #/garments: the public page for garment factories and textile exporters, in the same bright style as
 * the landing page, led by a video of a sewing floor. Every claim matches a screen in the app.
 */
import { MotionConfig, motion } from 'framer-motion'
import { BUSINESS_TYPES, customsDocs } from '@shared/domain'
import { Icon, type IconName } from '@/ui'
import { PillTabs, Reveal, SectionHead, SiteFooter, SiteNav, VideoBg } from './parts'
import { ImageStack } from './Solutions'
import '@fontsource-variable/plus-jakarta-sans'
import './landing.css'

const M = '/media/'
const TABS = [
  { id: 'top', label: 'Overview' }, { id: 'g-features', label: 'What you get' }, { id: 'g-flow', label: 'How it flows' },
  { id: 'g-docs', label: 'Documents' }, { id: 'g-money', label: 'Export and money' }, { id: 'home', label: 'Home page', to: '#/' },
]
const NAV = [
  { label: 'Home', to: '#/' },
  { label: 'What you get', to: 'g-features' },
  { label: 'How it flows', to: 'g-flow' },
  { label: 'Documents', to: 'g-docs' },
]

const PAINS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'tag', title: 'Styles, buyers and POs', text: 'Every item carries its style number, buyer, season, colour, size, fabric, GSM and HS code, so a search finds the exact lot.' },
  { icon: 'layers', title: 'Fabric, yarn and trims', text: 'Raw materials with their own stock, and a recipe per garment, so you know what one piece or one dozen uses.' },
  { icon: 'building', title: 'Goods in, confirmed', text: 'Mills and trims suppliers send bills; your store manager confirms what really arrived, short or damaged, before it counts.' },
  { icon: 'factory', title: 'In-house and subcontract', text: 'Record production in your own floor, or send materials to a subcontract factory and receive finished goods in parts.' },
  { icon: 'ship', title: 'Export LC and shipments', text: 'Contract or LC, ready, shipped and paid at the bank rate, with buyer PO, back-to-back LC and UD numbers on the shipment.' },
  { icon: 'badge', title: 'Workers and wages', text: 'Phone check-in at the factory gate, leave, monthly salaries, daily wages and contract pay, with written reports from supervisors.' },
  { icon: 'wallet', title: 'Costs and cash', text: 'Supplier dues, factory bills, expenses, VAT and the profit on each export, with cash, bank, bKash and Nagad in one cashbook.' },
  { icon: 'sparkle', title: 'Insights and AI', text: 'What will ship next month, which buyer is slowing, what material to reorder, and a plain-words briefing whenever you ask.' },
]

const FLOW: { title: string; text: string }[] = [
  { title: 'Buyer order and style', text: 'Add the style with its buyer, PO, sizes and fabric; set what one piece uses.' },
  { title: 'Fabric and trims in', text: 'Bills from the mill and trims suppliers; the store confirms each delivery.' },
  { title: 'Make it', text: 'Production on your own floor, or a subcontract order with materials handed over.' },
  { title: 'Finished goods to the warehouse', text: 'Cartons counted in, stock and cost updated by themselves.' },
  { title: 'Ship and get paid', text: 'Export steps confirmed in order; LC money received at the bank rate.' },
]

export default function GarmentsPage() {
  const g = BUSINESS_TYPES.garments
  const docs = [...new Set([...customsDocs({ businessTypes: [] }, { direction: 'export' }), ...g.docs])]
  const fields = g.fields.filter((f) => f.entity === 'product').map((f) => f.label)
  return (
    <MotionConfig reducedMotion="user">
      <div className="px" id="top">
        <SiteNav links={NAV} />
        <main>
          <section className="px-hero">
            <div className="px-hero-text">
              <motion.span className="px-badge" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>For garment factories and textile exporters</motion.span>
              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
                From fabric in to cartons shipped, in one set of books.
              </motion.h1>
              <motion.p className="px-hero-sub big" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}>
                Styles and buyer POs, fabric and trims, your floor and your subcontractors, export LC, workers’ wages and cash, on the phone and the computer.
              </motion.p>
              <motion.div className="px-actions" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}>
                <a className="px-btn" href="#/signup/garments">Start free, set up for garments <Icon name="arrowRight" size={18} /></a>
                <a className="px-btn px-btn-ghost" href="#/signin">Try the demo</a>
              </motion.div>
            </div>
            <motion.div className="px-hero-cards one" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }}>
              <div className="px-media-card tall">
                <VideoBg src={M + 'garments-factory.mp4'} poster={M + 'garments-factory.jpg'} label="Workers on the sewing floor of a garment factory" />
                <span className="px-media-copy"><small><Icon name="sparkle" size={15} /> Garments and textiles</small><b>Made for the factory floor</b></span>
              </div>
            </motion.div>
          </section>

          <PillTabs tabs={TABS} />

          <section id="g-features" className="px-section">
            <SectionHead kicker="What you get" title="Built around how a garment factory really works" text="Pick “Garments and textiles” when you sign up and these are switched on for you." />
            <div className="px-features four">
              {PAINS.map((p, i) => (
                <Reveal key={p.title} delay={(i % 4) * 0.06} className="px-feature">
                  <span className="px-feature-icon"><Icon name={p.icon} size={22} /></span>
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                </Reveal>
              ))}
            </div>
          </section>

          <section id="g-flow" className="px-section px-soft">
            <div className="px-split">
              <Reveal className="px-split-media"><ImageStack label="Garment factory photos" images={[{ src: 'garments-floor.jpg', alt: 'Workers finishing towels and mats on sewing machines' }, { src: 'stock-check.jpg', alt: 'Checking rolls of fabric and trims by phone', pos: '35% 50%' }, { src: 'garments-factory.jpg', alt: 'Sewing floor of a garment factory' }, { src: 'warehouse-racks.jpg', alt: 'Finished cartons stored on warehouse racks' }]} /></Reveal>
              <div>
                <SectionHead center={false} kicker="How it flows" title="Five steps, each confirmed" text="Nothing moves in the books until someone confirms it happened, with the date and a note." />
                <ol className="px-flow">
                  {FLOW.map((f, i) => (
                    <Reveal key={f.title} delay={i * 0.06}>
                      <li><span className="px-step-num">{i + 1}</span><span><b>{f.title}</b><small>{f.text}</small></span></li>
                    </Reveal>
                  ))}
                </ol>
              </div>
            </div>
          </section>

          <section id="g-docs" className="px-section">
            <div className="px-two">
              <Reveal className="px-card">
                <span className="px-feature-icon"><Icon name="tag" size={22} /></span>
                <h3>Fields on every item</h3>
                <p>Added for you, and you can add your own.</p>
                <div className="px-chips">{fields.map((f) => <span key={f}>{f}</span>)}</div>
              </Reveal>
              <Reveal className="px-card" delay={0.08}>
                <span className="px-feature-icon"><Icon name="clip" size={22} /></span>
                <h3>Export papers ticked off</h3>
                <p>Attach each one to the shipment; customs shows what is still missing.</p>
                <ul className="px-doclist">{docs.map((d) => <li key={d}><Icon name="check" size={16} /> {d}</li>)}</ul>
              </Reveal>
            </div>
          </section>

          <section id="g-money" className="px-section px-soft">
            <div className="px-split reverse">
              <Reveal className="px-split-media"><img className="px-photo" src={M + 'container-terminal.jpg'} alt="Container terminal with cranes loading a ship" loading="lazy" /></Reveal>
              <div>
                <SectionHead center={false} kicker="Export and money" title="Know what each shipment really earned" text="Goods cost, freight, C&F and bank charges against what the buyer paid, at the rate the bank gave you." />
                <ul className="px-checks">
                  {['Buyer, Incoterm, port and vessel on each export', 'Payment received in parts, at the bank’s rate', 'Margin on each export shipment after every cost', 'LCs close to expiry and late steps flagged for you'].map((t) => <li key={t}><Icon name="check" size={18} /><span>{t}</span></li>)}
                </ul>
              </div>
            </div>
          </section>

          <section className="px-section">
            <Reveal className="px-closing">
              <img src={M + 'garments-floor.jpg'} alt="" loading="lazy" />
              <div className="px-banner-shade center" />
              <div className="px-closing-copy">
                <h2>Set up your factory in an afternoon</h2>
                <p>Start free with the garments fields switched on, or open the demo to look around first.</p>
                <div className="px-actions">
                  <a className="px-btn px-btn-light" href="#/signup/garments">Start your free trial <Icon name="arrowRight" size={18} /></a>
                  <a className="px-btn px-btn-clear" href="#/signin">Try the demo</a>
                </div>
              </div>
            </Reveal>
          </section>
        </main>
        <SiteFooter />
      </div>
    </MotionConfig>
  )
}
