import { SERIES } from './common'

export interface BarRow {
  id: string
  name: string
  sub?: string
  value: number
  /** Right-hand text under the value, e.g. "120 cartons · 18% margin". */
  note?: string
}

/** Ranked list with a thin bar under each name, sized against the largest. */
export function BarList({ rows, format, limit = 6, empty }: { rows: BarRow[]; format: (n: number) => string; limit?: number; empty: string }) {
  const shown = rows.slice(0, limit)
  const max = Math.max(...shown.map((r) => r.value), 0)
  const total = rows.reduce((s, r) => s + r.value, 0)
  if (!shown.length) return <p className="t-muted bar-empty">{empty}</p>
  return (
    <ol className="bar-list">
      {shown.map((r) => (
        <li key={r.id} title={`${r.name}: ${format(r.value)}`}>
          <div className="bar-top">
            <span className="bar-name">{r.name}{r.sub && <small> · {r.sub}</small>}</span>
            <b>{format(r.value)}</b>
          </div>
          <div className="bar-track"><span style={{ width: `${max > 0 ? Math.max((r.value / max) * 100, 1.5) : 0}%`, background: SERIES.sales }} /></div>
          <div className="bar-foot">
            <small>{total > 0 ? `${Math.round((r.value / total) * 100)}% of sales` : ''}</small>
            {r.note && <small>{r.note}</small>}
          </div>
        </li>
      ))}
      {rows.length > limit && <li className="bar-more t-muted">and {rows.length - limit} more</li>}
    </ol>
  )
}
