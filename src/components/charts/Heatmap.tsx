import { useState } from 'react'
import { SEQUENTIAL } from './common'

export interface HeatRow { label: string; cells: { key: string; label: string; value: number | null }[] }

/**
 * A grid shaded by size in one hue, light for little and dark for a lot, with its scale below. Days
 * still to come stay blank. Hovering or focusing a cell shows its exact value.
 */
export function Heatmap({ rows, columns, format, max }: { rows: HeatRow[]; columns: string[]; format: (n: number) => string; max: number }) {
  const [hover, setHover] = useState<string | null>(null)
  const step = (v: number) => (max <= 0 || v <= 0 ? -1 : Math.min(Math.floor((v / max) * SEQUENTIAL.length), SEQUENTIAL.length - 1))
  const all = rows.flatMap((r) => r.cells)
  const h = all.find((c) => c.key === hover)
  return (
    <div className="chart heat">
      <div className="heat-grid" style={{ gridTemplateColumns: `minmax(56px, auto) repeat(${columns.length}, minmax(0, 1fr))` }} role="table" aria-label="Sales by day">
        <span />
        {columns.map((c) => <span key={c} className="heat-col">{c}</span>)}
        {rows.map((r) => (
          <div key={r.label} className="heat-row" role="row">
            <span className="heat-label">{r.label}</span>
            {r.cells.map((c) => {
              const s = c.value == null ? null : step(c.value)
              return (
                <span key={c.key} role="cell" tabIndex={c.value == null ? -1 : 0} className="heat-cell"
                  aria-label={`${c.label}: ${c.value == null ? 'not yet' : format(c.value)}`}
                  style={{ background: s == null ? 'transparent' : s < 0 ? 'var(--fill)' : SEQUENTIAL[s], outline: hover === c.key ? '2px solid var(--ink)' : undefined }}
                  onPointerEnter={() => setHover(c.key)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(c.key)} onBlur={() => setHover(null)} />
              )
            })}
          </div>
        ))}
      </div>
      <div className="heat-foot">
        <span className="t-muted">{h ? <><b>{h.label}</b> · {h.value == null ? 'not yet' : format(h.value)}</> : 'Point at a day to see its sales'}</span>
        <span className="heat-scale" aria-hidden="true"><small>Less</small>{SEQUENTIAL.map((c) => <i key={c} style={{ background: c }} />)}<small>More</small></span>
      </div>
    </div>
  )
}
