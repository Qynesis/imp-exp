import { tk } from '../lib/format.js'
import { Button, Icon, cls } from '../ui.jsx'

export function PageHead({ title, sub, actions, back, pill }) {
  return (
    <header className="page-head">
      <div className="page-title">
        {back && (
          <a className="back-link" href={'#/' + back.to}>
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

/** Name / note / amount / optional button. Used for dues lists everywhere. */
export function DueRow({ name, meta, metaTone, amount, action, onAction, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <div className="row-wrap">
      <Tag type={onClick ? 'button' : undefined} className={cls('row', onClick && 'click')} onClick={onClick}>
        <span className="name">{name}</span>
        <span className={cls('meta', metaTone && `t-${metaTone}`)}>{meta}</span>
        <span className="amt">{tk(amount)}</span>
      </Tag>
      {action && <Button variant="secondary" size="sm" className="edit-only" onClick={onAction}>{action}</Button>}
    </div>
  )
}
