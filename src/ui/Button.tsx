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
}

export function Button({ variant = 'primary', size, block, icon, className, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className)} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} className="btn-icon" />}
      {children}
    </button>
  )
}
