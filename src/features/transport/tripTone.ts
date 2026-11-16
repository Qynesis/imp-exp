import type { TripStatus } from '@shared/domain'

/** Pill colour for each trip status. */
export const STATUS_TONE: Record<TripStatus, 'info' | 'warn' | 'good' | 'muted'> = { planned: 'info', 'on-the-way': 'warn', done: 'good', cancelled: 'muted' }
