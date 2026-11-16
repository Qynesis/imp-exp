import type { Tone } from '@shared/domain'
import { tk } from '@shared/domain'
import { Button, cls } from '@/ui'

/** Name, note, amount and an optional action. Used for every dues list. */
export function DueRow({ name, meta, metaTone, amount, action, onAction, onClick }: {
  name: string
  meta: string
  metaTone?: Tone
  amount: number
  action?: string
  onAction?: () => void
  onClick?: () => void
}) {
  const body = (
    <>
      <span className="name">{name}</span>
      <span className={cls('meta', metaTone && `t-${metaTone}`)}>{meta}</span>
      <span className="amt">{tk(amount)}</span>
    </>
  )
  return (
    <div className="row-wrap">
      {onClick ? <button type="button" className="row click" onClick={onClick}>{body}</button> : <div className="row">{body}</div>}
      {action && <Button variant="secondary" size="sm" className="edit-only" onClick={onAction}>{action}</Button>}
    </div>
  )
}
