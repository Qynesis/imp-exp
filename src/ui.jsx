/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { access } from './lib/store.jsx'

export const cls = (...a) => a.filter(Boolean).join(' ')

/* ---------- icons ---------- */
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  users: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.8M16 3.2a3.5 3.5 0 0 1 0 6.6',
}
export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

/** QynTrading mark: a Q drawn as a trade ring with a mint tail, on a deep green tile. */
export function Logo({ size = 32, wordmark, light }) {
  return (
    <span className={cls('logo', light && 'light')}>
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="11" fill="#0f7363" />
        <path d="M20 9.5a10.5 10.5 0 1 0 7.4 17.9" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />
        <path d="M20 9.5a10.5 10.5 0 0 1 9.6 14.7" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" opacity=".55" />
        <path d="M22.5 22.5 31 31" fill="none" stroke="#8ff0d8" strokeWidth="4.6" strokeLinecap="round" />
      </svg>
      {wordmark && <span className="logo-word"><b>Qyn</b>Trading</span>}
    </span>
  )
}

/* ---------- basics ---------- */
export function Button({ variant = 'primary', size, block, className, type = 'button', ...rest }) {
  return <button type={type} className={cls('btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className)} {...rest} />
}
export const Pill = ({ tone = 'neutral', children }) => <span className={cls('pill', tone)}>{children}</span>
export const Empty = ({ children }) => <div className="empty-state">{children}</div>

export function Card({ title, sub, action, children, className }) {
  return (
    <section className={cls('card', className)}>
      {(title || action) && (
        <header className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, sub, tone }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className={cls('stat-value', tone && `t-${tone}`)}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function Progress({ value }) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(value))
    return () => cancelAnimationFrame(id)
  }, [value])
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${w}%` }} />
    </div>
  )
}

/** iOS-style segmented control: the thumb slides to the active segment. */
export function Segmented({ options, value, onChange, label }) {
  const wrap = useRef(null)
  const [thumb, setThumb] = useState(null)
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector('[aria-pressed="true"]')
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value, options.length])
  useEffect(() => {
    const on = () => {
      const el = wrap.current?.querySelector('[aria-pressed="true"]')
      if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth })
    }
    window.addEventListener('resize', on)
    document.fonts?.ready.then(on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return (
    <div className="seg-scroll">
      <div className="seg" ref={wrap} role="group" aria-label={label}>
        {thumb && <span className="seg-thumb" style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }} />}
        {options.map((o) => (
          <button key={o.value} type="button" className="seg-btn" aria-pressed={o.value === value} disabled={o.disabled} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Table on wide screens, stacked label/value rows on phones (no sideways scrolling). */
export function DataTable({ columns, rows, onRow, empty = 'Nothing here yet.', rowKey = (r) => r.id, rowClass }) {
  if (!rows.length) return <Empty>{empty}</Empty>
  return (
    <table className="dt">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.label} className={c.align === 'right' ? 'r' : undefined}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={rowKey(r, i)}
            className={cls(onRow && 'click', rowClass?.(r))}
            onClick={onRow ? () => onRow(r) : undefined}
            tabIndex={onRow ? 0 : undefined}
            onKeyDown={onRow ? (e) => e.key === 'Enter' && onRow(r) : undefined}
          >
            {columns.map((c) => {
              const v = c.render(r)
              return (
                <td key={c.label} data-label={c.label} className={cls(c.align === 'right' && 'r', c.primary && 'primary', (v === '' || v == null) && 'empty')}>
                  {v}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ---------- forms ---------- */
export function Field({ label, hint, wide, children }) {
  return (
    <label className={cls('field', wide && 'wide')}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
export function useForm(init) {
  const [v, setV] = useState(init)
  const set = useCallback((k, val) => setV((s) => ({ ...s, [k]: val })), [])
  const bind = (k) => ({ className: 'in', value: v[k] ?? '', onChange: (e) => set(k, e.target.value) })
  const numBind = (k) => ({ ...bind(k), inputMode: 'decimal', autoComplete: 'off' })
  return [v, set, bind, numBind]
}

/* ---------- sheets, toasts, confirm, print ---------- */
const SheetCtx = createContext(null)
const SheetItemCtx = createContext({ close: () => {}, closing: false })
const ToastCtx = createContext(() => {})
const ConfirmCtx = createContext(() => Promise.resolve(false))
const PrintCtx = createContext(() => {})
export const useSheets = () => useContext(SheetCtx)
export const useSheetItem = () => useContext(SheetItemCtx)
export const useToast = () => useContext(ToastCtx)
export const useConfirm = () => useContext(ConfirmCtx)
export const usePrint = () => useContext(PrintCtx)

const READ_SHEETS = ['more', 'dealerStatement', 'viewInvoice']
let sheetKey = 0
const EXIT_MS = 300

export function UIProvider({ registry, children }) {
  const [stack, setStack] = useState([])
  const [toast, setToast] = useState(null)
  const [ask, setAsk] = useState(null)
  const [printDoc, setPrintDoc] = useState(null)
  const toastTimer = useRef(0)

  const closeKey = useCallback((key) => {
    setStack((s) => s.map((x) => (x.key === key ? { ...x, closing: true } : x)))
    setTimeout(() => setStack((s) => s.filter((x) => x.key !== key)), EXIT_MS)
  }, [])

  const showToast = useCallback((msg) => {
    clearTimeout(toastTimer.current)
    setToast({ msg, id: Date.now(), leaving: false })
    toastTimer.current = setTimeout(() => {
      setToast((t) => t && { ...t, leaving: true })
      toastTimer.current = setTimeout(() => setToast(null), 350)
    }, 2600)
  }, [])

  const sheets = useMemo(() => ({
    open: (name, props = {}) => {
      // a view-only role may open things to read, never forms that change the books
      if (access.readonly && !READ_SHEETS.includes(name)) return showToast('Your role can only view this screen')
      setStack((s) => [...s, { key: ++sheetKey, name, props, closing: false }])
    },
  }), [showToast])

  const confirm = useCallback((opts) => new Promise((resolve) => setAsk({ ...opts, resolve })), [])
  const answer = (ok) => {
    ask.resolve(ok)
    setAsk(null)
  }

  const live = stack.filter((x) => !x.closing)
  const topKey = live.length ? live[live.length - 1].key : null
  useEffect(() => {
    document.body.classList.toggle('lock', live.length > 0 || !!ask)
  }, [live.length, ask])
  useEffect(() => {
    if (topKey === null) return
    const onKey = (e) => e.key === 'Escape' && closeKey(topKey)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [topKey, closeKey])

  useEffect(() => {
    // moving to another screen (including the browser Back button) dismisses any open sheet
    const onNav = () => setStack((st) => { st.forEach((x) => !x.closing && closeKey(x.key)); return st })
    window.addEventListener('hashchange', onNav)
    return () => window.removeEventListener('hashchange', onNav)
  }, [closeKey])

  useEffect(() => {
    if (!printDoc) return
    const done = () => setPrintDoc(null)
    window.addEventListener('afterprint', done)
    const id = setTimeout(() => window.print(), 80)
    return () => {
      clearTimeout(id)
      window.removeEventListener('afterprint', done)
    }
  }, [printDoc])

  return (
    <SheetCtx.Provider value={sheets}>
      <ToastCtx.Provider value={showToast}>
        <ConfirmCtx.Provider value={confirm}>
          <PrintCtx.Provider value={setPrintDoc}>
            {children}
            {stack.map((item) => {
              const C = registry[item.name]
              return (
                <SheetItemCtx.Provider key={item.key} value={{ close: () => closeKey(item.key), closing: item.closing }}>
                  <C {...item.props} />
                </SheetItemCtx.Provider>
              )
            })}
            {ask && createPortal(
              <div className="alert-layer" role="alertdialog" aria-modal="true" aria-label={ask.title}>
                <div className="alert">
                  <h3>{ask.title}</h3>
                  {ask.message && <p>{ask.message}</p>}
                  <div className="alert-actions">
                    <button type="button" onClick={() => answer(false)}>Cancel</button>
                    <button type="button" className={ask.destructive ? 'destructive' : 'default'} onClick={() => answer(true)} autoFocus>{ask.confirmLabel || 'OK'}</button>
                  </div>
                </div>
              </div>,
              document.body,
            )}
            {toast && createPortal(
              <div key={toast.id} className={cls('toast', toast.leaving && 'leaving')} role="status">
                <span className="toast-tick"><Icon name="check" size={14} /></span>
                {toast.msg}
              </div>,
              document.body,
            )}
            {printDoc && createPortal(<div className="print-root">{printDoc}</div>, document.body)}
          </PrintCtx.Provider>
        </ConfirmCtx.Provider>
      </ToastCtx.Provider>
    </SheetCtx.Provider>
  )
}

/** Bottom sheet on phones (drag down to dismiss), centred dialog on larger screens. */
export function Sheet({ title, crumb, children, footer, onSubmit, wide }) {
  const { close, closing } = useSheetItem()
  const ref = useRef(null)
  const drag = useRef(null)

  useEffect(() => {
    const el = ref.current
    const fine = window.matchMedia('(min-width: 720px) and (pointer: fine)').matches
    const first = fine && el.querySelector('.sheet-body input:not([type=date]), .sheet-body select')
    ;(first || el).focus({ preventScroll: true })
  }, [])

  const onDown = (e) => {
    if (e.pointerType === 'mouse' || e.target.closest('button') || window.innerWidth >= 720) return
    drag.current = { y: e.clientY, dy: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e) => {
    if (!drag.current) return
    const dy = Math.max(0, e.clientY - drag.current.y)
    drag.current.dy = dy
    ref.current.style.transition = 'none'
    ref.current.style.transform = `translateY(${dy}px)`
  }
  const onUp = () => {
    if (!drag.current) return
    const { dy } = drag.current
    drag.current = null
    const el = ref.current
    if (dy > 110) {
      el.style.setProperty('--dy', `${dy}px`)
      el.style.transform = ''
      close()
    } else {
      el.style.transition = 'transform .4s cubic-bezier(.32,.72,0,1)'
      el.style.transform = ''
    }
  }

  const Tag = onSubmit ? 'form' : 'div'
  return createPortal(
    <div className={cls('sheet-layer', closing && 'closing')}>
      <div className="sheet-backdrop" onClick={close} />
      <Tag ref={ref} className={cls('sheet', wide && 'wide')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onSubmit={onSubmit} noValidate={onSubmit ? true : undefined}>
        <div className="sheet-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span className="sheet-grab" />
          <div className="sheet-title">
            {crumb && <div className="crumb">{crumb}</div>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </Tag>
    </div>,
    document.body,
  )
}

/** A sheet holding one form. onSubmit returns an error string to stay open, or nothing to close. */
export function FormSheet({ title, crumb, note, submit, onSubmit, children, wide }) {
  const { close } = useSheetItem()
  const [err, setErr] = useState('')
  const handle = (e) => {
    e.preventDefault()
    const problem = onSubmit()
    if (typeof problem === 'string') setErr(problem)
    else close()
  }
  return (
    <Sheet
      title={title}
      crumb={crumb}
      wide={wide}
      onSubmit={handle}
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button type="submit">{submit}</Button>
        </>
      }
    >
      {note && <div className="note">{note}</div>}
      {err && <div className="err" role="alert">{err}</div>}
      <div className="form-grid">{children}</div>
    </Sheet>
  )
}

/* ---------- tiny hash router ---------- */
export function useRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
}
export const go = (path) => {
  window.location.hash = '/' + path
}
