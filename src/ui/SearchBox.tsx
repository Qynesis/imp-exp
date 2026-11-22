import { Icon } from './Icon'
import { cls } from './cls'

/**
 * The one search box used across the app: a magnifier, the text, and a clear button.
 * It keeps a sensible width beside a title and takes the full row on phones (or with `wide`).
 */
export function SearchBox({ value, onChange, placeholder = 'Search', label, wide, autoFocus }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** Read out by screen readers; defaults to the placeholder. */
  label?: string
  wide?: boolean
  autoFocus?: boolean
}) {
  return (
    <div className={cls('searchbox', wide && 'wide')} role="search">
      <Icon name="search" size={17} className="searchbox-icon" />
      <input className="in" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label || placeholder}
        autoComplete="off" spellCheck={false} autoFocus={autoFocus} onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.stopPropagation(); onChange('') } }} />
      {value && <button type="button" className="searchbox-clear" aria-label="Clear search" onClick={() => onChange('')}><Icon name="close" size={15} /></button>}
    </div>
  )
}
