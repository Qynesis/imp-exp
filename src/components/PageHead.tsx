import type { ReactNode } from 'react'
import { href } from '@/core/router'
import { Icon } from '@/ui'

export function PageHead({ title, sub, actions, back, pill }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; pill?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-title">
        {back && (
          <a className="back-link" href={href(back.to)}>
            <Icon name="back" size={16} />
            {back.label}
          </a>
        )}
        <h1>
          {title}
          {pill}
        </h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}
