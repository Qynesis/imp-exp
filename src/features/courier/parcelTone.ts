import type { Tone } from '@shared/domain'
import { PARCEL_STATUS } from '@shared/courier'

export const parcelStatusText = (s: string): string => PARCEL_STATUS[s] || s.replace(/[_-]/g, ' ')
/** Delivered, returned or cancelled: nothing more will happen to it. */
export const isDone = (s: string): boolean => /^(delivered|partial_delivered|cancel|returned|return|paid_return)/.test(s) && !s.endsWith('approval_pending')
export const parcelTone = (s: string): Tone => (s.startsWith('delivered') ? 'good' : /cancel|return/.test(s) ? 'muted' : /partial|hold|fail/.test(s) ? 'warn' : 'info')
