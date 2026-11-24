import { useState } from 'react'
import { compact } from '@shared/domain'
import { INK, niceRange, SERIES, STATUS, useWidth } from './common'

export interface WaterfallStep { key: string; label: string; value: number }

const PAD = { top: 22, right: 8, bottom: 40, left: 50 }

/**
 * From a starting total, each step adds or takes away, ending at the new total: why profit moved.
 * Start and end are grey columns from zero; steps float, + in green and − in orange, each labelled with its sign.
 */
export function WaterfallChart({ start, end, steps, format, height = 280 }: { start: { label: string; value: number }; end: { label: string; value: number }; steps: WaterfallStep[]; format: (n: number) => string; height?: number }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  // running total before each step, worked out without changing a variable during render
  const before = steps.map((_, i) => start.value + steps.slice(0, i).reduce((t, x) => t + x.value, 0))
  const bars = [
    { key: 'start', label: start.label, from: 0, to: start.value, kind: 'total' as const, value: start.value },
    ...steps.map((s, i) => ({ key: s.key, label: s.label, from: before[i], to: before[i] + s.value, kind: s.value >= 0 ? ('up' as const) : ('down' as const), value: s.value })),
    { key: 'end', label: end.label, from: 0, to: end.value, kind: 'total' as const, value: end.value },
  ]
  const lo = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)))
  const hi = Math.max(...bars.map((b) => Math.max(b.from, b.to)), 1)
  const ticks = niceRange(lo, hi)
  const tMin = ticks[0]
  const tMax = ticks[ticks.length - 1]
  const plotW = Math.max(width - PAD.left - PAD.right, 10)
  const plotH = height - PAD.top - PAD.bottom
  const y = (v: number) => PAD.top + plotH - ((v - tMin) / (tMax - tMin || 1)) * plotH
  const band = plotW / bars.length
  const colW = Math.min(46, band * 0.6)
  const cx = (i: number) => PAD.left + band * i + band / 2
  const fill = (k: string) => (k === 'up' ? STATUS.up : k === 'down' ? STATUS.down : SERIES.muted)
  return (
    <div className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span><i className="key-rect" style={{ background: SERIES.muted }} />Total</span>
        <span><i className="key-rect" style={{ background: STATUS.up }} />+ added</span>
        <span><i className="key-rect" style={{ background: STATUS.down }} />− taken away</span>
      </div>
      <div className="chart-box" ref={box} style={{ height }} onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${start.label} to ${end.label}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.axis : INK.grid} shapeRendering="crispEdges" />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="chart-tick">{t < 0 ? '−' : ''}{compact(Math.abs(t))}</text>
              </g>
            ))}
            {bars.map((b, i) => {
              const top = y(Math.max(b.from, b.to))
              const h = Math.max(Math.abs(y(b.from) - y(b.to)), 1.5)
              return (
                <g key={b.key} tabIndex={0} aria-label={`${b.label}: ${b.kind === 'total' ? '' : b.value >= 0 ? '+' : '−'}${format(Math.abs(b.value))}`}
                  onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} style={{ outline: 'none' }}>
                  <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH + PAD.bottom} fill="transparent" />
                  <rect x={cx(i) - colW / 2} y={top} width={colW} height={h} rx={3} fill={fill(b.kind)} opacity={hover == null || hover === i ? 1 : 0.55} />
                  {i < bars.length - 1 && <line x1={cx(i) + colW / 2} x2={cx(i + 1) - colW / 2} y1={y(b.to)} y2={y(b.to)} stroke={INK.axis} />}
                  <text x={cx(i)} y={top - 6} textAnchor="middle" className="chart-value small">{b.kind === 'total' ? '' : b.value >= 0 ? '+' : '−'}{compact(Math.abs(b.value))}</text>
                  <foreignObject x={PAD.left + band * i + 2} y={height - PAD.bottom + 6} width={band - 4} height={PAD.bottom - 6}>
                    <div className="chart-xlabel">{b.label}</div>
                  </foreignObject>
                </g>
              )
            })}
          </svg>
        )}
        {hover != null && (
          <div className="chart-tip" style={{ left: Math.min(Math.max(cx(hover), 90), width - 90), top: Math.max(y(Math.max(bars[hover].from, bars[hover].to)) - 12, 0) }}>
            <div className="tip-head">{bars[hover].label}</div>
            <div className="tip-row"><i className="key-rect" style={{ background: fill(bars[hover].kind) }} /><b>{bars[hover].kind === 'total' ? '' : bars[hover].value >= 0 ? '+' : '−'}{format(Math.abs(bars[hover].value))}</b></div>
            {bars[hover].kind !== 'total' && <div className="tip-row plain"><b>{format(bars[hover].to)}</b><span>running total</span></div>}
          </div>
        )}
      </div>
    </div>
  )
}
