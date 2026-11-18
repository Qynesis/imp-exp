import { useEffect, useState, type ReactNode } from 'react'
import type { Tone } from '@shared/domain'
import { cls } from './cls'
import { IconBadge, type IconName } from './Icon'

export function Card({ title, sub, action, children, className, icon }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; icon?: IconName }) {
  return (
    <section className={cls('card', className)}>
      {(title || action) && (
        <header className="card-head">
          {icon && <IconBadge name={icon} size={17} />}
          <div className="card-head-text">
            {title && <h2>{title}</h2>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

/** A figure with its label. With `href` the whole card is a link to the screen behind the number. */
export function Stat({ label, value, sub, tone, icon, href }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: IconName; href?: string }) {
  const body = (
    <>
      {icon && <IconBadge name={icon} tone={tone === 'warn' ? 'warn' : tone === 'info' ? 'info' : 'brand'} />}
      <div className="stat-label">{label}</div>
      <div className={cls('stat-value', tone && `t-${tone}`)}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </>
  )
  if (href) return <a className={cls('card stat stat-link', icon && 'has-icon')} href={href}>{body}<span className="stat-go" aria-hidden="true">→</span></a>
  return <div className={cls('card stat', icon && 'has-icon')}>{body}</div>
}

export const Pill = ({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) => <span className={cls('pill', tone)}>{children}</span>

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty-state">{children}</div>

/** Progress bar that grows into place. */
export function Progress({ value }: { value: number }) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(value))
    return () => cancelAnimationFrame(id)
  }, [value])
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${w}%` }} />
    </div>
  )
}
