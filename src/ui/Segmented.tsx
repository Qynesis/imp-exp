import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export interface SegmentOption<V extends string> {
  value: V
  label: ReactNode
  disabled?: boolean
}

/** iOS-style segmented control: the thumb slides to the active segment. */
export function Segmented<V extends string>({ options, value, onChange, label }: { options: SegmentOption<V>[]; value: V; onChange: (v: V) => void; label: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)

  const measure = useCallback(() => {
    const el = wrap.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth })
  }, [])
  useLayoutEffect(measure, [measure, value, options.length])
  useEffect(() => {
    // labels can change width without a new value (another language, a late font), so watch them
    const ro = new ResizeObserver(measure)
    wrap.current?.querySelectorAll('.seg-btn').forEach((b) => ro.observe(b))
    window.addEventListener('resize', measure)
    void document.fonts?.ready.then(measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure, options.length])

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
