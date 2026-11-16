import type { ReactNode } from 'react'
import { cls } from './cls'

export function Field({ label, hint, wide, children }: { label: ReactNode; hint?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <label className={cls('field', wide && 'wide')}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
