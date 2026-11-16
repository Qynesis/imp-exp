import { useEffect, useRef, useState, type FormEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../Button'
import { cls } from '../cls'
import { Icon } from '../Icon'
import { useSheetItem } from './context'

const DESKTOP = 720
const DISMISS_PX = 110

interface SheetProps {
  title: string
  crumb?: string
  children: ReactNode
  footer?: ReactNode
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void
  wide?: boolean
}

/** Bottom sheet on phones (drag down to dismiss), centred dialog on larger screens. */
export function Sheet({ title, crumb, children, footer, onSubmit, wide }: SheetProps) {
  const { close, closing } = useSheetItem()
  const ref = useRef<HTMLFormElement & HTMLDivElement>(null)
  const drag = useRef<{ y: number; dy: number } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // on desktop, start typing in the first field; on phones, do not pop the keyboard up uninvited
    const fine = window.matchMedia(`(min-width: ${DESKTOP}px) and (pointer: fine)`).matches
    const first = fine ? el.querySelector<HTMLElement>('.sheet-body input:not([type=date]), .sheet-body select') : null
    ;(first || el).focus({ preventScroll: true })
  }, [])

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('button') || window.innerWidth >= DESKTOP) return
    drag.current = { y: e.clientY, dy: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!drag.current || !el) return
    const dy = Math.max(0, e.clientY - drag.current.y)
    drag.current.dy = dy
    el.style.transition = 'none'
    el.style.transform = `translateY(${dy}px)`
  }
  const onUp = () => {
    const el = ref.current
    if (!drag.current || !el) return
    const { dy } = drag.current
    drag.current = null
    if (dy > DISMISS_PX) {
      el.style.setProperty('--dy', `${dy}px`)
      el.style.transform = ''
      close()
    } else {
      el.style.transition = 'transform .4s cubic-bezier(.32,.72,0,1)'
      el.style.transform = ''
    }
  }

  const inner = (
    <>
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
    </>
  )
  const frame = { ref, className: cls('sheet', wide && 'wide'), role: 'dialog', 'aria-modal': true, 'aria-label': title, tabIndex: -1 } as const
  return createPortal(
    <div className={cls('sheet-layer', closing && 'closing')}>
      <div className="sheet-backdrop" onClick={close} />
      {onSubmit ? <form {...frame} onSubmit={onSubmit} noValidate>{inner}</form> : <div {...frame}>{inner}</div>}
    </div>,
    document.body,
  )
}

interface FormSheetProps {
  title: string
  crumb?: string
  note?: ReactNode
  submit: string
  /** Return an error message to keep the sheet open, or nothing to close it. */
  onSubmit: () => string | void
  children: ReactNode
  wide?: boolean
}

/** A sheet holding one form, with Cancel and a submit button. */
export function FormSheet({ title, crumb, note, submit, onSubmit, children, wide }: FormSheetProps) {
  const { close } = useSheetItem()
  const [err, setErr] = useState('')
  const handle = (e: FormEvent<HTMLFormElement>) => {
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
