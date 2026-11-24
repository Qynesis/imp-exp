import { useState } from 'react'
import { INK, SERIES, useWidth } from './common'

export interface ScatterPoint { id: string; name: string; x: number; y: number; size: number; note?: string }

const PAD = { top: 14, right: 14, bottom: 34, left: 48 }

/**
 * Each item placed by two measures (e.g. growth across, margin up), sized by a third (sales), with
 * the plot cut into four quadrants at given lines and each quadrant named in its corner.
 */
export function ScatterChart({ points, xLabel, yLabel, xFormat, yFormat, sizeFormat, xCut = 0, yCut, quadrants, height = 320, onPick }: {
  points: ScatterPoint[]; xLabel: string; yLabel: string; xFormat: (n: number) => string; yFormat: (n: number) => string; sizeFormat: (n: number) => string
  xCut?: number; yCut: number; quadrants: [string, string, string, string]; height?: number; onPick?: (p: ScatterPoint) => void
}) {
  const [box, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<string | null>(null)
  if (!points.length) return <p className="t-muted bar-empty">Not enough sales to place items yet.</p>
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const pad = (lo: number, hi: number) => { const s = (hi - lo) * 0.12 || Math.abs(hi) * 0.2 || 0.1; return [lo - s, hi + s] }
  const [x0, x1] = pad(Math.min(...xs, xCut), Math.max(...xs, xCut))
  const [y0, y1] = pad(Math.min(...ys, yCut), Math.max(...ys, yCut))
  const plotW = Math.max(width - PAD.left - PAD.right, 10)
  const plotH = height - PAD.top - PAD.bottom
  const sx = (v: number) => PAD.left + ((v - x0) / (x1 - x0)) * plotW
  const sy = (v: number) => PAD.top + plotH - ((v - y0) / (y1 - y0)) * plotH
  const maxS = Math.max(...points.map((p) => p.size), 1)
  const r = (s: number) => 5 + Math.sqrt(s / maxS) * 15
  const h = points.find((p) => p.id === hover)
  // top-left, top-right, bottom-left, bottom-right
  const corners: [number, number, 'start' | 'end'][] = [[PAD.left + 6, PAD.top + 14, 'start'], [width - PAD.right - 6, PAD.top + 14, 'end'], [PAD.left + 6, PAD.top + plotH - 8, 'start'], [width - PAD.right - 6, PAD.top + plotH - 8, 'end']]
  return (
    <div className="chart">
      <div className="chart-legend" aria-hidden="true"><span><i className="key-dot" style={{ background: SERIES.sales }} />Item · bigger circle = more sales</span></div>
      <div className="chart-box" ref={box} style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${yLabel} against ${xLabel}`}>
            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="none" stroke={INK.grid} />
            <line x1={sx(xCut)} x2={sx(xCut)} y1={PAD.top} y2={PAD.top + plotH} stroke={INK.axis} />
            <line x1={PAD.left} x2={PAD.left + plotW} y1={sy(yCut)} y2={sy(yCut)} stroke={INK.axis} />
            {quadrants.map((q, i) => <text key={q} x={corners[i][0]} y={corners[i][1]} textAnchor={corners[i][2]} className="chart-quadrant">{q}</text>)}
            <text x={PAD.left + plotW / 2} y={height - 6} textAnchor="middle" className="chart-tick">{xLabel} →</text>
            <text x={12} y={PAD.top + plotH / 2} textAnchor="middle" className="chart-tick" transform={`rotate(-90 12 ${PAD.top + plotH / 2})`}>{yLabel} →</text>
            <text x={PAD.left - 6} y={sy(yCut)} dy="0.32em" textAnchor="end" className="chart-tick">{yFormat(yCut)}</text>
            <text x={sx(xCut)} y={PAD.top + plotH + 14} textAnchor="middle" className="chart-tick">{xFormat(xCut)}</text>
            {[...points].sort((a, b) => b.size - a.size).map((p) => (
              <circle key={p.id} cx={sx(p.x)} cy={sy(p.y)} r={r(p.size)} fill={SERIES.sales} fillOpacity={hover === null || hover === p.id ? 0.55 : 0.2} stroke="#fff" strokeWidth={2}
                tabIndex={0} role={onPick ? 'button' : undefined} aria-label={`${p.name}: ${xLabel} ${xFormat(p.x)}, ${yLabel} ${yFormat(p.y)}, ${sizeFormat(p.size)}`}
                onPointerEnter={() => setHover(p.id)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(p.id)} onBlur={() => setHover(null)}
                onClick={() => onPick?.(p)} onKeyDown={(e) => { if (onPick && e.key === 'Enter') onPick(p) }} style={{ cursor: onPick ? 'pointer' : 'default', outline: 'none' }} />
            ))}
            {/* name the biggest few so the chart reads without hovering */}
            {[...points].sort((a, b) => b.size - a.size).slice(0, 4).map((p) => <text key={'l' + p.id} x={sx(p.x)} y={sy(p.y) - r(p.size) - 5} textAnchor="middle" className="chart-label small">{p.name.length > 18 ? p.name.slice(0, 17) + '…' : p.name}</text>)}
          </svg>
        )}
        {h && (
          <div className="chart-tip" style={{ left: Math.min(Math.max(sx(h.x), 90), width - 90), top: Math.max(sy(h.y) - r(h.size) - 8, 0) }}>
            <div className="tip-head">{h.name}</div>
            <div className="tip-row plain"><b>{xFormat(h.x)}</b><span>{xLabel.toLowerCase()}</span></div>
            <div className="tip-row plain"><b>{yFormat(h.y)}</b><span>{yLabel.toLowerCase()}</span></div>
            <div className="tip-row plain"><b>{sizeFormat(h.size)}</b><span>sales</span></div>
            {h.note && <div className="tip-hint">{h.note}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
