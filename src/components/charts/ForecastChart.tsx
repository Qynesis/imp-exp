import { useState, type PointerEvent } from 'react'
import { compact } from '@shared/domain'
import { INK, niceTicks, SERIES, useWidth } from './common'

export interface ForecastDatum {
  key: string
  short: string
  long: string
  actual: number | null
  forecast: number | null
  low: number | null
  high: number | null
}

const PAD = { top: 16, right: 14, bottom: 26, left: 46 }

/**
 * Actual sales as a solid line, the forecast as a dashed line (the usual mark for "projected"), and its
 * likely range as a light band. A crosshair snaps to the nearest month and lists every value.
 */
export function ForecastChart({ data, format, height = 260 }: { data: ForecastDatum[]; format: (n: number) => string; height?: number }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = data.length
  const max = Math.max(...data.flatMap((d) => [d.actual ?? 0, d.high ?? 0, d.forecast ?? 0]), 0)
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const plotW = Math.max(width - PAD.left - PAD.right, 10)
  const plotH = height - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (n > 1 ? (plotW * i) / (n - 1) : plotW / 2)
  const y = (v: number) => PAD.top + plotH - (Math.max(v, 0) / top) * plotH
  const every = Math.ceil(34 / (plotW / Math.max(n - 1, 1)))
  const line = (pick: (d: ForecastDatum) => number | null) => data.reduce((s, d, i) => {
    const v = pick(d)
    return v == null ? s : s + (s && pick(data[i - 1]) != null ? 'L' : 'M') + x(i) + ',' + y(v)
  }, '')
  // the forecast line starts at the last full actual month so the two join up
  const firstF = data.findIndex((d) => d.forecast != null)
  const join = firstF > 0 ? firstF - 1 : -1
  const fPath = (join >= 0 && data[join].actual != null ? `M${x(join)},${y(data[join].actual!)}` : '') + data.reduce((s, d, i) => (d.forecast == null ? s : s + (s || join >= 0 ? 'L' : 'M') + x(i) + ',' + y(d.forecast)), '')
  const band = data.map((d, i) => (d.high == null ? null : [x(i), y(d.high), y(d.low ?? 0)] as const)).filter((p): p is readonly [number, number, number] => !!p)
  const bandPath = band.length > 1 ? `M${band.map((p) => `${p[0]},${p[1]}`).join('L')}L${[...band].reverse().map((p) => `${p[0]},${p[2]}`).join('L')}Z` : ''
  const h = hover != null ? data[hover] : null
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHover(Math.min(Math.max(Math.round(((e.clientX - r.left) / r.width) * (n - 1)), 0), n - 1))
  }
  return (
    <div className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span><i className="key-line" style={{ background: SERIES.sales }} />Actual sales</span>
        <span><i className="key-line dashed" style={{ borderColor: SERIES.sales }} />Forecast</span>
        <span><i className="key-band" />Likely range (80%)</span>
      </div>
      <div className="chart-box" ref={box} style={{ height }} onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label="Monthly sales with a three-month forecast">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.axis : INK.grid} shapeRendering="crispEdges" />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="chart-tick">{compact(t)}</text>
              </g>
            ))}
            {data.map((d, i) => (i % every === 0 || i === n - 1) && <text key={d.key} x={x(i)} y={height - 8} textAnchor="middle" className="chart-tick">{d.short}</text>)}
            {firstF > 0 && <rect x={x(firstF) - (plotW / Math.max(n - 1, 1)) / 2} y={PAD.top} width={width - PAD.right - x(firstF) + (plotW / Math.max(n - 1, 1)) / 2} height={plotH} fill={SERIES.sales} opacity={0.04} />}
            {bandPath && <path d={bandPath} fill={SERIES.sales} opacity={0.14} />}
            <path d={line((d) => (d.forecast != null && d.key === data[firstF]?.key ? null : d.actual))} fill="none" stroke={SERIES.sales} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {fPath && <path d={fPath} fill="none" stroke={SERIES.sales} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke={INK.axis} />}
            {h && [h.actual, h.forecast].map((v, k) => v != null && <circle key={k} cx={x(hover!)} cy={y(v)} r={5} fill={SERIES.sales} stroke="#fff" strokeWidth={2} opacity={k ? 0.7 : 1} />)}
            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} />
          </svg>
        )}
        {h && hover != null && (
          <div className="chart-tip" style={{ left: Math.min(Math.max(x(hover), 90), width - 90), top: Math.max(y(Math.max(h.actual ?? 0, h.high ?? 0)) - 10, 0) }}>
            <div className="tip-head">{h.long}</div>
            {h.actual != null && <div className="tip-row"><i className="key-line" style={{ background: SERIES.sales }} /><b>{format(h.actual)}</b><span>{h.forecast != null ? 'sold so far' : 'sold'}</span></div>}
            {h.forecast != null && <div className="tip-row"><i className="key-line dashed" style={{ borderColor: SERIES.sales }} /><b>{format(h.forecast)}</b><span>expected</span></div>}
            {h.low != null && h.high != null && <div className="tip-row plain"><b>{format(h.low)} – {format(h.high)}</b><span>likely</span></div>}
          </div>
        )}
      </div>
    </div>
  )
}
