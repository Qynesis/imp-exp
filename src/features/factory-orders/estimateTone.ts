import type { EstimateStatus } from '@shared/domain'

/** Pill colour for each estimate status. */
export const ESTIMATE_TONE: Record<EstimateStatus, 'neutral' | 'info' | 'good' | 'warn' | 'muted'> = { draft: 'neutral', sent: 'info', approved: 'good', rejected: 'warn', ordered: 'muted' }
