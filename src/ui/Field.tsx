import type { ReactNode } from 'react'
import { moneySymbol } from '@shared/domain'
import { cls } from './cls'

export function Field({ label, hint, wide, children }: { label: ReactNode; hint?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <label className={cls('field', wide && 'wide')}>
      {/* "(Tk)" in a label shows the company's own currency */}
      <span className="field-label">{typeof label === 'string' ? label.replace('(Tk)', `(${moneySymbol()})`) : label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
