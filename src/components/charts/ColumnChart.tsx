import { useState, type KeyboardEvent } from 'react'
import { compact } from '@shared/domain'
import { columnPath, INK, niceTicks, SERIES, useWidth } from './common'

export interface ColumnDatum {
  key: string
  /** Axis label. */
  short: string
  /** Tooltip heading. */
  long: string
  value: number
  /** Optional second measure in the same unit, drawn as a line over the columns. */
  line?: number | null
  /** Shown faintly: a day still to come. */
  faded?: boolean
  /** Extra tooltip rows, e.g. invoice count. */
  extra?: [string, string][]
}

interface Props {
  data: ColumnDatum[]
  valueName: string
  lineName?: string
  format: (n: number) => string
  height?: number
  /** Clicking a column, e.g. to open that month's days. */
  onPick?: (d: ColumnDatum) => void
  pickHint?: string
}

const PAD = { top: 16, right: 8, bottom: 26, left: 46 }

/** Columns with an optional line on the same axis, a hover tooltip on every column, and keyboard focus. */
export function ColumnChart({ data, valueName, lineName, format, height = 260, onPick, pickHint }: Props) {
  const [box, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const hasLine = !!lineName && data.some((d) => d.line != null)
  const max = Math.max(...data.map((d) => Math.max(d.value, d.line ?? 0)), 0)
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const plotW = Math.max(width - PAD.left - PAD.right, 10)
  const plotH = height - PAD.top - PAD.bottom
  const band = plotW / Math.max(data.length, 1)
  const colW = Math.max(Math.min(24, band * 0.62), 2)
  const y = (v: number) => PAD.top + plotH - (Math.max(v, 0) / top) * plotH
  const cx = (i: number) => PAD.left + band * i + band / 2
  // thin out axis labels when the bands get narrow
  const every = Math.ceil(28 / band)
  const linePts = data.map((d, i) => (d.line == null || d.faded ? null : ([cx(i), y(d.line)] as const)))
  const linePath = linePts.reduce((s, p, i) => (p ? s + (s && linePts[i - 1] ? 'L' : 'M') + p[0] + ',' + p[1] : s), '')
  const h = hover != null ? data[hover] : null

  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = Math.min(Math.max(i + (e.key === 'ArrowRight' ? 1 : -1), 0), data.length - 1)
      ;(e.currentTarget.parentNode?.children[next] as SVGElement | undefined)?.focus()
    } else if ((e.key === 'Enter' || e.key === ' ') && onPick) {
      e.preventDefault()
      onPick(data[i])
    }
  }

  return (
    <div className="chart">
      {hasLine && (
        <div className="chart-legend" aria-hidden="true">
          <span><i className="key-rect" style={{ background: SERIES.sales }} />{valueName}</span>
          <span><i className="key-line" style={{ background: SERIES.profit }} />{lineName}</span>
        </div>
      )}
      <div className="chart-box" ref={box} style={{ height }} onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${valueName} chart`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.axis : INK.grid} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="chart-tick">{compact(t)}</text>
              </g>
            ))}
            {data.map((d, i) => (i % every === 0 || i === data.length - 1) && (
              <text key={d.key} x={cx(i)} y={height - 8} textAnchor="middle" className="chart-tick">{d.short}</text>
            ))}
            {hover != null && <rect x={PAD.left + band * hover} y={PAD.top} width={band} height={plotH} fill="#000" opacity={0.035} rx={4} />}
            {data.map((d, i) => (
              <path key={d.key} d={columnPath(cx(i) - colW / 2, y(d.value), colW, y(0) - y(d.value))} fill={SERIES.sales}
                opacity={d.faded ? 0.25 : hover == null || hover === i ? 1 : 0.55} className="chart-col" />
            ))}
            {hasLine && <path d={linePath} fill="none" stroke={SERIES.profit} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
            {hasLine && linePts.map((p, i) => p && (hover === i || data.length <= 16) && (
              <circle key={i} cx={p[0]} cy={p[1]} r={hover === i ? 5 : 4} fill={SERIES.profit} stroke="#fff" strokeWidth={2} />
            ))}
            <g>
              {data.map((d, i) => (
                <rect key={d.key} x={PAD.left + band * i} y={PAD.top} width={band} height={plotH + PAD.bottom} fill="transparent"
                  tabIndex={0} role="button" aria-label={`${d.long}: ${valueName} ${format(d.value)}${hasLine && d.line != null ? `, ${lineName} ${format(d.line)}` : ''}`}
                  style={{ cursor: onPick ? 'pointer' : 'default', outline: 'none' }}
                  onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                  onClick={() => onPick?.(d)} onKeyDown={(e) => onKey(e, i)} />
              ))}
            </g>
          </svg>
        )}
        {h && hover != null && (
          <div className="chart-tip" style={{ left: Math.min(Math.max(cx(hover), 90), width - 90), top: Math.max(y(Math.max(h.value, h.line ?? 0)) - 10, 0) }}>
            <div className="tip-head">{h.long}</div>
            <div className="tip-row"><i className="key-rect" style={{ background: SERIES.sales }} /><b>{format(h.value)}</b><span>{valueName}</span></div>
            {hasLine && h.line != null && <div className="tip-row"><i className="key-line" style={{ background: SERIES.profit }} /><b>{format(h.line)}</b><span>{lineName}</span></div>}
            {h.extra?.map(([k, v]) => <div key={k} className="tip-row plain"><b>{v}</b><span>{k}</span></div>)}
            {onPick && pickHint && <div className="tip-hint">{pickHint}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
