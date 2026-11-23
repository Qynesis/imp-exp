import { useState, type ReactNode } from 'react'
import { Button } from '@/ui'

export interface Opt { value: string; label: string }

/** A labelled dropdown filter. The first option means "no filter". */
export function FilterSelect({ label, value, onChange, all, options, groups }: {
  label: string; value: string; onChange: (v: string) => void; all: string; options?: Opt[]; groups?: { label: string; options: Opt[] }[]
}) {
  return (
    <label className="field filter-field">
      <span className="field-label">{label}</span>
      <select className={'in' + (value ? ' is-set' : '')} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">{all}</option>
        {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        {groups?.filter((g) => g.options.length).map((g) => <optgroup key={g.label} label={g.label}>{g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>)}
      </select>
    </label>
  )
}

/** A from–to date filter. */
export function FilterDates({ label, from, to, onFrom, onTo }: { label: string; from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <div className="field filter-field filter-dates">
      <span className="field-label">{label}</span>
      <span className="filter-dates-row">
        <input className={'in' + (from ? ' is-set' : '')} type="date" value={from} max={to || undefined} onChange={(e) => onFrom(e.target.value)} aria-label={`${label} from`} />
        <span className="t-muted">to</span>
        <input className={'in' + (to ? ' is-set' : '')} type="date" value={to} min={from || undefined} onChange={(e) => onTo(e.target.value)} aria-label={`${label} to`} />
      </span>
    </div>
  )
}

/**
 * The always-visible filters (search, a segmented control…) followed by a "Filters" button that opens
 * the rest. Shows how many extra filters are on, and clears them.
 */
export function FilterPanel({ main, children, active, onReset, summary }: { main: ReactNode; children?: ReactNode; active: number; onReset: () => void; summary?: ReactNode }) {
  const [open, setOpen] = useState(active > 0)
  return (
    <div className="card-body pt0 filter-panel">
      <div className="filter-bar">
        {main}
        {children && (
          <Button size="sm" variant={active ? 'primary' : 'secondary'} icon="filter" onClick={() => setOpen((x) => !x)} aria-expanded={open}>
            {active ? `Filters (${active})` : 'Filters'}
          </Button>
        )}
        {active > 0 && <button type="button" className="link" onClick={onReset}>Clear</button>}
      </div>
      {children && open && <div className="filter-more">{children}</div>}
      {summary && <div className="filter-summary t-muted">{summary}</div>}
    </div>
  )
}
