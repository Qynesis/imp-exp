import type { PartyDetails } from '@shared/domain'

/** The extra contact, address, registration and bank details kept for a supplier or factory, as form strings. */
export type PartyForm = Required<{ [K in keyof PartyDetails]: string }>
type Key = keyof PartyForm

export const partyForm = (p?: PartyDetails): PartyForm => ({
  altPhone: p?.altPhone || '', email: p?.email || '', website: p?.website || '', area: p?.area || '', city: p?.city || '', district: p?.district || '',
  country: p?.country || '', postCode: p?.postCode || '', tradeLicense: p?.tradeLicense || '', taxNo: p?.taxNo || '', bank: p?.bank || '', note: p?.note || '',
})

/** Trimmed details, leaving out empty ones. */
export const partyClean = (v: PartyForm): PartyDetails => {
  const out: PartyDetails = {}
  for (const k of Object.keys(v) as Key[]) {
    const x = v[k].trim()
    if (x) out[k] = x
  }
  return out
}

