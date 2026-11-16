import { useState, type PointerEvent } from 'react'
import { compact } from '@shared/domain'
import { INK, niceTicks, useWidth } from './common'

export interface LineSeries {
  name: string
  color: string
  values: (number | null)[]
  /** Label the last point with its value. */
  endLabel?: boolean
}

interface Props {
  labels: { short: string; long: string }[]
  series: LineSeries[]
  format: (n: number) => string
  /** A flat reference line, e.g. the target for the period. */
  target?: { value: number; label: string }
  height?: number
}

const PAD = { top: 18, right: 64, bottom: 26, left: 46 }

/** Lines on one axis with a crosshair that snaps to the nearest point and lists every series. */
export function LineChart({ labels, series, format, target, height = 240 }: Props) {
  const [box, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = labels.length
  const max = Math.max(...series.flatMap((s) => s.values.map((v) => v ?? 0)), target?.value ?? 0, 0)
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const plotW = Math.max(width - PAD.left - PAD.right, 10)
  const plotH = height - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (n > 1 ? (plotW * i) / (n - 1) : plotW / 2)
  const y = (v: number) => PAD.top + plotH - (Math.max(v, 0) / top) * plotH
  const every = Math.ceil(30 / (plotW / Math.max(n - 1, 1)))
  const path = (vals: (number | null)[]) => vals.reduce<string>((s, v, i) => (v == null ? s : s + (s && vals[i - 1] != null ? 'L' : 'M') + x(i) + ',' + y(v)), '')

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1))
    setHover(Math.min(Math.max(i, 0), n - 1))
  }

  return (
    <div className="chart">
      <div className="chart-legend" aria-hidden="true">
        {series.map((s) => <span key={s.name}><i className="key-line" style={{ background: s.color }} />{s.name}</span>)}
        {target && <span><i className="key-line target" />{target.label}</span>}
      </div>
      <div className="chart-box" ref={box} style={{ height }} onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={series.map((s) => s.name).join(' and ')}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.axis : INK.grid} shapeRendering="crispEdges" />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="chart-tick">{compact(t)}</text>
              </g>
            ))}
            {labels.map((l, i) => (i % every === 0 || i === n - 1) && <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="chart-tick">{l.short}</text>)}
            {target && target.value > 0 && (
              <g>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(target.value)} y2={y(target.value)} stroke={INK.label} strokeWidth={1} opacity={0.6} />
                <text x={width - PAD.right + 6} y={y(target.value)} dy="0.32em" className="chart-tick strong">{target.label}</text>
              </g>
            )}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke={INK.axis} />}
            {series.map((s) => <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
            {series.map((s) => {
              const last = s.values.reduce<number>((li, v, i) => (v != null ? i : li), -1)
              if (!s.endLabel || last < 0) return null
              const v = s.values[last] as number
              return (
                <g key={s.name + 'end'}>
                  <circle cx={x(last)} cy={y(v)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
                  {!target || Math.abs(y(v) - y(target.value)) > 14 ? <text x={x(last) + 8} y={y(v)} dy="0.32em" className="chart-tick strong">{compact(v)}</text> : null}
                </g>
              )
            })}
            {hover != null && series.map((s) => s.values[hover] != null && (
              <circle key={s.name + 'h'} cx={x(hover)} cy={y(s.values[hover] as number)} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} />
            ))}
            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} />
          </svg>
        )}
        {hover != null && (
          <div className="chart-tip" style={{ left: Math.min(Math.max(x(hover), 90), width - 90), top: PAD.top }}>
            <div className="tip-head">{labels[hover].long}</div>
            {series.map((s) => (
              <div key={s.name} className="tip-row"><i className="key-line" style={{ background: s.color }} /><b>{s.values[hover] == null ? '—' : format(s.values[hover] as number)}</b><span>{s.name}</span></div>
            ))}
            {target && <div className="tip-row plain"><b>{format(target.value)}</b><span>{target.label}</span></div>}
          </div>
        )}
      </div>
    </div>
  )
}
