import type { SelectHTMLAttributes } from 'react'
import { PAYMENT_METHODS } from '@shared/domain'

/** Cash, bank transfer, bKash or cheque. */
export const MethodSelect = (props: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props}>
    {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
  </select>
)
