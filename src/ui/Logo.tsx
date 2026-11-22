import { useId, type CSSProperties } from 'react'
import { BRAND } from '../config/brand'
import { cls } from './cls'

/** The Qyndms mark: a Q made of a ring and a route arrow, on a teal tile. */
export function BrandMark({ size = 32 }: { size?: number }) {
  const g = useId()
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#15967f" />
          <stop offset="1" stopColor="#0a4f45" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#${g})`} />
      <circle cx="22.5" cy="22.5" r="10.5" fill="none" stroke="#fff" strokeWidth="4.2" />
      <path d="M27.5 27.5 L36 36" stroke="#f5b83d" strokeWidth="4.6" strokeLinecap="round" />
      <circle cx="22.5" cy="22.5" r="3.2" fill="#f5b83d" />
    </svg>
  )
}

/** Qyndms mark with its name. `onDark` writes the name in white. */
export function ProductLogo({ height = 40, onDark, sub }: { height?: number; onDark?: boolean; sub?: string }) {
  return (
    <span className={cls('product-logo', onDark && 'on-dark')} style={{ '--h': height + 'px' } as CSSProperties}>
      <BrandMark size={height} />
      <span className="product-logo-text">
        <b>{BRAND}</b>
        {sub && <small>{sub}</small>}
      </span>
    </span>
  )
}

/**
 * A company's own logo when `src` is given, otherwise the Qyndms logo.
 * `light` puts a company logo on a white tile so its colours read on dark backgrounds.
 */
export function Logo({ height = 44, src, light, className }: { height?: number; src?: string; light?: boolean; className?: string }) {
  if (!src) return <span className={cls('logo', className)}><ProductLogo height={Math.round(height * 0.8)} onDark={light} /></span>
  return (
    <span className={cls('logo', light && 'light', className)} style={{ '--h': height + 'px' } as CSSProperties}>
      <img src={src} alt="Company logo" height={height} decoding="async" />
    </span>
  )
}
