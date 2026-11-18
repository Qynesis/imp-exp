/** Dealer form values: empty, from an existing dealer, and back to a dealer to save. */
import { num, type CustomValues, type Dealer, type DealerTerms } from '@shared/domain'

export interface DealerFormValues {
  id?: string
  name: string
  owner: string
  phone: string
  area: string
  address: string
  opening: string
  terms: DealerTerms
  limit: string
  days: string
  salesId: string
  courier: boolean
  custom: CustomValues
}

export const dealerInit = (cur?: Dealer): DealerFormValues =>
  cur
    ? { ...cur, opening: String(cur.opening || ''), limit: String(cur.limit || ''), days: String(cur.days || ''), courier: !!cur.courier, custom: cur.custom || {} }
    : { name: '', owner: '', phone: '', area: '', address: '', opening: '', terms: 'credit', limit: '', days: '30', salesId: '', courier: false, custom: {} }

/** The dealer to save, or an error message. */
export function dealerPayload(v: DealerFormValues): (Omit<Dealer, 'id'> & { id?: string }) | string {
  if (!v.name.trim()) return 'Enter the shop or business name.'
  const credit = v.terms === 'credit'
  return { ...v, name: v.name.trim(), opening: num(v.opening), limit: credit ? num(v.limit) : 0, days: credit ? num(v.days) : 0, courier: v.courier || undefined }
}
