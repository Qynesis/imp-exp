import type { ChangeArea } from '@shared/domain'

export const CHANGE_AREAS: Record<ChangeArea, string> = { vat: 'VAT', tax: 'Tax', costing: 'Costing', currency: 'Currency', expense: 'Expense', other: 'Other' }
