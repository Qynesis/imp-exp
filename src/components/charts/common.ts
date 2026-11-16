import { useLayoutEffect, useRef, useState } from 'react'

/** Chart colours. Checked with the palette validator on the white card surface: lightness band, chroma, colour-blind separation and contrast all pass. */
export const SERIES = { sales: '#119a80', profit: '#e8603a', muted: '#a9a79f' } as const
export const INK = { grid: '#ebe9e2', axis: '#c9c7be', label: '#6b716d' } as const

/** Width of an element, kept up to date as it resizes. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** A round top for the axis and evenly spaced ticks: 0, 2.5L, 5L, 7.5L, 10L. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const top = Math.ceil(max / step) * step
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
}

/** Column path: square at the baseline, 4px rounded at the data end. */
export function columnPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return ''
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}
