import { useState } from 'react'
import { CATEGORICAL, OTHER } from './common'

export interface SharePart { id: string; name: string; value: number }

/**
 * Part of a whole as one tall bar split into segments (up to six named parts; the rest fold into
 * "Other"), with a legend that names each part and gives its value and share, so colour is never the only cue.
 */
export function ShareBar({ parts, format, limit = 6 }: { parts: SharePart[]; format: (n: number) => string; limit?: number }) {
  const [hover, setHover] = useState<string | null>(null)
  const sorted = parts.filter((p) => p.value > 0).sort((a, b) => b.value - a.value)
  const head = sorted.slice(0, limit)
  const rest = sorted.slice(limit)
  const shown = rest.length ? [...head, { id: '__other', name: `Other (${rest.length})`, value: rest.reduce((s, p) => s + p.value, 0) }] : head
  const total = shown.reduce((s, p) => s + p.value, 0)
  if (!total) return <p className="t-muted bar-empty">Nothing in this period.</p>
  const color = (i: number, id: string) => (id === '__other' ? OTHER : CATEGORICAL[i])
  return (
    <div className="chart share">
      <div className="share-bar" role="img" aria-label={shown.map((p) => `${p.name} ${Math.round((p.value / total) * 100)}%`).join(', ')}>
        {shown.map((p, i) => (
          <span key={p.id} style={{ flexGrow: p.value, background: color(i, p.id), opacity: hover === null || hover === p.id ? 1 : 0.4 }} title={`${p.name}: ${format(p.value)}`}
            onPointerEnter={() => setHover(p.id)} onPointerLeave={() => setHover(null)} />
        ))}
      </div>
      <ul className="share-legend">
        {shown.map((p, i) => (
          <li key={p.id} onPointerEnter={() => setHover(p.id)} onPointerLeave={() => setHover(null)} className={hover === p.id ? 'on' : ''}>
            <i style={{ background: color(i, p.id) }} />
            <span>{p.name}</span>
            <b>{format(p.value)}</b>
            <small>{Math.round((p.value / total) * 100)}%</small>
          </li>
        ))}
      </ul>
    </div>
  )
}
