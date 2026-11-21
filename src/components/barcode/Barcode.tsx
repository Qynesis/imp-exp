import { code128Path } from '@shared/domain'

/** A Code 128 barcode as crisp SVG bars (prints sharp at any size), with the text under it if asked. */
export function Barcode({ value, height = 40, showText = true, className }: { value: string; height?: number; showText?: boolean; className?: string }) {
  let path: { d: string; width: number }
  try {
    path = code128Path(value, height)
  } catch {
    return <span className="t-warn">Cannot print “{value}” as a barcode</span>
  }
  const quiet = 10
  return (
    <span className={`barcode ${className || ''}`}>
      <svg viewBox={`${-quiet} 0 ${path.width + quiet * 2} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Barcode ${value}`}>
        <rect x={-quiet} y={0} width={path.width + quiet * 2} height={height} fill="#fff" />
        <path d={path.d} fill="#000" />
      </svg>
      {showText && <span className="barcode-text">{value}</span>}
    </span>
  )
}
