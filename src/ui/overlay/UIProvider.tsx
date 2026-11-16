import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { accessGuard } from '../../core/store/context'
import { cls } from '../cls'
import { Icon } from '../Icon'
import { ConfirmContext, PrintContext, SheetItemContext, SheetsContext, ToastContext, type ConfirmOptions, type SheetComponent, type SheetsApi } from './context'

interface StackItem {
  key: number
  C: ComponentType<object>
  props: object
  closing: boolean
}
const EXIT_MS = 300
const TOAST_MS = 2600

let nextKey = 0

/** Hosts sheets, toasts, confirm dialogs and printing for everything inside it. */
export function UIProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<StackItem[]>([])
  const [toast, setToast] = useState<{ msg: string; id: number; leaving: boolean } | null>(null)
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  const [printDoc, setPrintDoc] = useState<ReactNode>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const closeKey = useCallback((key: number) => {
    setStack((s) => s.map((x) => (x.key === key ? { ...x, closing: true } : x)))
    setTimeout(() => setStack((s) => s.filter((x) => x.key !== key)), EXIT_MS)
  }, [])

  const showToast = useCallback((msg: string) => {
    clearTimeout(toastTimer.current)
    setToast({ msg, id: Date.now(), leaving: false })
    toastTimer.current = setTimeout(() => {
      setToast((t) => t && { ...t, leaving: true })
      toastTimer.current = setTimeout(() => setToast(null), 350)
    }, TOAST_MS)
  }, [])

  const sheets = useMemo<SheetsApi>(() => ({
    open: <P extends object>(C: SheetComponent<P>, ...rest: [props?: P]) => {
      // a view-only role may open things to read, never forms that change the books
      if (accessGuard.readonly && !C.readOnlySafe) return showToast('Your role can only view this screen')
      setStack((s) => [...s, { key: ++nextKey, C: C as ComponentType<object>, props: rest[0] ?? {}, closing: false }])
    },
  }), [showToast])

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setAsk({ ...opts, resolve })), [])
  const answer = (ok: boolean) => {
    ask?.resolve(ok)
    setAsk(null)
  }

  const live = stack.filter((x) => !x.closing)
  const topKey = live.length ? live[live.length - 1].key : null
  useEffect(() => {
    document.body.classList.toggle('lock', live.length > 0 || !!ask)
  }, [live.length, ask])
  useEffect(() => {
    if (topKey === null) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeKey(topKey)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [topKey, closeKey])
  useEffect(() => {
    // moving to another screen (including the browser Back button) dismisses every open sheet
    const onNav = () => setStack((s) => s.map((x) => ({ ...x, closing: true })))
    const clear = () => setTimeout(() => setStack((s) => s.filter((x) => !x.closing)), EXIT_MS)
    const both = () => {
      onNav()
      clear()
    }
    window.addEventListener('hashchange', both)
    return () => window.removeEventListener('hashchange', both)
  }, [])
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
    <SheetsContext.Provider value={sheets}>
      <ToastContext.Provider value={showToast}>
        <ConfirmContext.Provider value={confirm}>
          <PrintContext.Provider value={setPrintDoc}>
            {children}
            {stack.map(({ key, C, props, closing }) => (
              <SheetItemContext.Provider key={key} value={{ close: () => closeKey(key), closing }}>
                <C {...props} />
              </SheetItemContext.Provider>
            ))}
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
          </PrintContext.Provider>
        </ConfirmContext.Provider>
      </ToastContext.Provider>
    </SheetsContext.Provider>
  )
}
