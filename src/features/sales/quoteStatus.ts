import type { QuoteStatus } from '@shared/domain'

export const QUOTE_TEXT: Record<QuoteStatus, string> = { draft: 'Draft', sent: 'Sent to dealer', approved: 'Approved', rejected: 'Rejected', invoiced: 'Billed' }
export const QUOTE_TONE: Record<QuoteStatus, 'neutral' | 'info' | 'good' | 'warn' | 'muted'> = { draft: 'neutral', sent: 'info', approved: 'good', rejected: 'warn', invoiced: 'muted' }
