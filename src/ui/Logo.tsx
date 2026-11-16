import type { CSSProperties } from 'react'
import { BRAND, DEFAULT_LOGO } from '../config/brand'
import { cls } from './cls'

/**
 * Brand logo, or a company's own logo when `src` is given.
 * `light` puts it on a white tile so the colours read on dark backgrounds.
 */
export function Logo({ height = 44, src, light, className }: { height?: number; src?: string; light?: boolean; className?: string }) {
  return (
    <span className={cls('logo', light && 'light', className)} style={{ '--h': height + 'px' } as CSSProperties}>
      <img src={src || DEFAULT_LOGO} alt={src ? 'Company logo' : BRAND} height={height} decoding="async" />
    </span>
  )
}
