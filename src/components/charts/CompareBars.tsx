import { useState } from 'react'
import { barPath, SERIES, useWidth } from './common'

export interface CompareRow { id: string; name: string; now: number; before: number }

/**
 * Horizontal bars for this period with a thin grey bar under each for the period before, so ranking and
 * change read together. Values are written at the end of each bar.
 */
export function CompareBars({ rows, format, limit = 8, nowName = 'This period', beforeName = 'Period before', empty, onPick }: {
  rows: CompareRow[]; format: (n: number) => string; limit?: number; nowName?: string; beforeName?: string; empty: string; onPick?: (r: CompareRow) => void
}) {
  const [box, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<string | null>(null)
  const shown = rows.slice(0, limit)
  if (!shown.length) return <p className="t-muted bar-empty">{empty}</p>
  const max = Math.max(...shown.flatMap((r) => [r.now, r.before]), 1)
  const ROW = 44
  const labelW = Math.min(150, Math.max(width * 0.3, 90))
  const valueW = 84
  const plotW = Math.max(width - labelW - valueW, 40)
  const sx = (v: number) => labelW + (Math.max(v, 0) / max) * plotW
  return (
    <div className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span><i className="key-rect" style={{ background: SERIES.sales }} />{nowName}</span>
        <span><i className="key-rect" style={{ background: SERIES.muted }} />{beforeName}</span>
      </div>
      <div className="chart-box" ref={box} style={{ height: shown.length * ROW }}>
        {width > 0 && (
          <svg width={width} height={shown.length * ROW} role="img" aria-label={`${nowName} against ${beforeName}`}>
            {shown.map((r, i) => {
              const yy = i * ROW
              const ch = r.before > 0 ? (r.now - r.before) / r.before : null
              return (
                <g key={r.id} tabIndex={0} role={onPick ? 'button' : undefined} aria-label={`${r.name}: ${format(r.now)}, before ${format(r.before)}`}
                  onPointerEnter={() => setHover(r.id)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(r.id)} onBlur={() => setHover(null)}
                  onClick={() => onPick?.(r)} onKeyDown={(e) => { if (onPick && e.key === 'Enter') onPick(r) }} style={{ cursor: onPick ? 'pointer' : 'default', outline: 'none' }}
                  opacity={hover === null || hover === r.id ? 1 : 0.5}>
                  <rect x={0} y={yy} width={width} height={ROW} fill={hover === r.id ? '#000' : 'transparent'} opacity={0.035} rx={6} />
                  <text x={labelW - 10} y={yy + 18} dy="0.32em" textAnchor="end" className="chart-label">{r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name}</text>
                  <path d={barPath(labelW, sx(r.now), yy + 9, 14)} fill={SERIES.sales} />
                  <path d={barPath(labelW, sx(r.before), yy + 27, 6)} fill={SERIES.muted} />
                  <text x={width - 4} y={yy + 16} dy="0.32em" textAnchor="end" className="chart-value">{format(r.now)}</text>
                  <text x={width - 4} y={yy + 31} dy="0.32em" textAnchor="end" className={ch == null ? 'chart-tick' : ch >= 0 ? 'chart-tick up' : 'chart-tick down'}>{ch == null ? 'new' : `${ch >= 0 ? '+' : '−'}${Math.round(Math.abs(ch) * 100)}%`}</text>
                  <title>{`${r.name}: ${format(r.now)} (before ${format(r.before)})`}</title>
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}
