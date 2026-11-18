import { byId, type Db } from '@shared/domain'
import { intlPhone } from '@shared/messaging'

export type ContactKind = 'Dealer' | 'Supplier' | 'Factory' | 'Staff' | 'Driver' | 'Customer' | 'Recent'
export interface Contact {
  key: string
  name: string
  phone: string
  kind: ContactKind
  /** For dealers: their messages can use their due and bills. */
  dealerId?: string
  sub?: string
}

/** A number is a usable Bangladeshi mobile when it comes out as 8801XXXXXXXXX. */
export const isMobile = (phone: string): boolean => /^8801[3-9]\d{8}$/.test(intlPhone(phone))

/**
 * Everyone in the books with a phone number, plus numbers messaged before that belong to no one:
 * typing a new number once is enough for it to come up again.
 */
export function contactsOf(db: Db): Contact[] {
  const out: Contact[] = []
  const seen = new Set<string>()
  const add = (c: Contact) => {
    const n = intlPhone(c.phone)
    if (!c.phone || seen.has(n)) return
    seen.add(n)
    out.push(c)
  }
  for (const d of db.dealers.filter((x) => !x.sample)) add({ key: 'd:' + d.id, name: d.name, phone: d.phone, kind: 'Dealer', dealerId: d.id, sub: [d.owner, d.area].filter(Boolean).join(' · ') })
  for (const s of db.suppliers) add({ key: 's:' + s.id, name: s.name, phone: s.phone, kind: 'Supplier', sub: s.contact })
  for (const f of db.factories) add({ key: 'f:' + f.id, name: f.name, phone: f.phone, kind: 'Factory', sub: f.contact })
  for (const e of db.employees) add({ key: 'e:' + e.id, name: e.name, phone: e.phone, kind: 'Staff', sub: e.role })
  for (const v of db.vehicles || []) if (!v.driverId && v.driverName) add({ key: 'v:' + v.id, name: v.driverName, phone: v.driverPhone, kind: 'Driver', sub: v.name })
  for (const p of db.parcels || []) if (!p.dealerId) add({ key: 'p:' + p.id, name: p.recipientName, phone: p.phone, kind: 'Customer', sub: p.address })
  for (const m of db.messages || []) if (!m.dealerId) add({ key: 'm:' + m.to, name: m.name || m.to, phone: m.to, kind: 'Recent', sub: 'Messaged before' })
  return out
}

export const contactLabel = (db: Db, c: Contact): string => (c.dealerId ? byId(db.dealers, c.dealerId)?.name || c.name : c.name)
