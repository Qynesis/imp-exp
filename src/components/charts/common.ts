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

/**
 * Categorical colours for up to six named parts (validated on the white card: lightness band, chroma,
 * colour-blind and normal-vision separation pass; three slots sit under 3:1 contrast, so charts using
 * them always show their values as text). Assigned in this order, never cycled; the rest fold into "Other".
 */
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'] as const
export const OTHER = SERIES.muted
/** One-hue ramp, light to dark, for magnitude (heatmaps). */
export const SEQUENTIAL = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'] as const
/** Up and down, when the colour means better or worse; always shown with a + or − sign too. */
export const STATUS = { up: '#1f8a4c', down: '#c2410c' } as const

/** Bar path for a horizontal bar: square at the start, 4px rounded at the data end (either direction). */
export function barPath(x0: number, x1: number, y: number, h: number): string {
  const w = Math.abs(x1 - x0)
  if (w <= 0) return ''
  const r = Math.min(4, h / 2, w)
  if (x1 >= x0) return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - r},${y + h}H${x0}Z`
  return `M${x0},${y}H${x1 + r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 + r},${y + h}H${x0}Z`
}

/** Ticks for a range that may go below zero, e.g. a cash balance. */
export function niceRange(min: number, max: number, count = 4): number[] {
  if (min >= 0) return niceTicks(max, count)
  const span = max - min || 1
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  return Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step)
}
