import { useState } from 'react'
import { barPath, STATUS, useWidth } from './common'

export interface DivergingRow { id: string; name: string; value: number; note?: string }

/**
 * Gains to the right of zero, losses to the left: who or what moved a total. The colour means better
 * or worse, so every value also carries its + or − sign and sits on its own side of the line.
 */
export function DivergingBars({ rows, format, limit = 8, empty, onPick }: { rows: DivergingRow[]; format: (n: number) => string; limit?: number; empty: string; onPick?: (r: DivergingRow) => void }) {
  const [box, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<string | null>(null)
  const shown = rows.slice(0, limit)
  if (!shown.length) return <p className="t-muted bar-empty">{empty}</p>
  const max = Math.max(...shown.map((r) => Math.abs(r.value)), 1)
  const ROW = 34
  const labelW = Math.min(150, Math.max(width * 0.32, 90))
  const valueW = 78
  const plotW = Math.max(width - labelW - valueW, 40)
  const zero = labelW + plotW / 2
  const sx = (v: number) => zero + (v / max) * (plotW / 2 - 4)
  const height = shown.length * ROW
  return (
    <div className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span><i className="key-rect" style={{ background: STATUS.up }} />+ more than before</span>
        <span><i className="key-rect" style={{ background: STATUS.down }} />− less than before</span>
      </div>
      <div className="chart-box" ref={box} style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label="Changes against the period before">
            <line x1={zero} x2={zero} y1={0} y2={height} stroke="#c9c7be" shapeRendering="crispEdges" />
            {shown.map((r, i) => {
              const yy = i * ROW
              const up = r.value >= 0
              const on = hover === null || hover === r.id
              return (
                <g key={r.id} tabIndex={0} role={onPick ? 'button' : undefined} aria-label={`${r.name}: ${up ? '+' : '−'}${format(Math.abs(r.value))}`}
                  onPointerEnter={() => setHover(r.id)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(r.id)} onBlur={() => setHover(null)}
                  onClick={() => onPick?.(r)} onKeyDown={(e) => { if (onPick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick(r) } }}
                  style={{ cursor: onPick ? 'pointer' : 'default', outline: 'none' }} opacity={on ? 1 : 0.5}>
                  <rect x={0} y={yy} width={width} height={ROW} fill={hover === r.id ? '#000' : 'transparent'} opacity={0.035} rx={6} />
                  <text x={labelW - 10} y={yy + ROW / 2} dy="0.32em" textAnchor="end" className="chart-label">{r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name}</text>
                  <path d={barPath(zero, sx(r.value), yy + 9, ROW - 18)} fill={up ? STATUS.up : STATUS.down} />
                  <text x={width - 4} y={yy + ROW / 2} dy="0.32em" textAnchor="end" className="chart-value">{up ? '+' : '−'}{format(Math.abs(r.value))}</text>
                  <title>{`${r.name}: ${up ? '+' : '−'}${format(Math.abs(r.value))}${r.note ? ` · ${r.note}` : ''}`}</title>
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}
