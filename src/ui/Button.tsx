import type { ButtonHTMLAttributes } from 'react'
import { cls } from './cls'
import { Icon, type IconName } from './Icon'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dashed' | 'danger'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm'
  block?: boolean
  /** Icon shown before the label. */
  icon?: IconName
  /** Working on it: shows a spinner, and the button cannot be pressed again. */
  loading?: boolean
}

/** A small turning ring, for buttons and places that wait on the server. */
export const Spinner = ({ size = 16, label }: { size?: number; label?: string }) => (
  <span className="spinner" style={{ width: size, height: size }} role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
)

export function Button({ variant = 'primary', size, block, icon, loading, className, type = 'button', children, disabled, ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', loading && 'is-loading', className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size={size === 'sm' ? 14 : 16} /> : icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} className="btn-icon" />}
      {children}
    </button>
  )
}
