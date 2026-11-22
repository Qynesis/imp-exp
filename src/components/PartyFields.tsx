import type { ChangeEvent } from 'react'
import { fullAddress, type PartyDetails } from '@shared/domain'
import type { PartyForm } from './partyForm'
import { PhoneLink } from '@/components/PhoneLink'
import { Field } from '@/ui'

type Key = keyof PartyForm

type Bind = (k: Key) => { className: string; value: string; onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void }

/** Address, contact, registration and bank fields. Renders inside a form grid, after the name, phone and street address. */
export function PartyFields({ bind, kind }: { bind: Bind; kind: 'supplier' | 'factory' }) {
  return (
    <>
      <p className="form-sub">Where they are</p>
      <Field label="Area / thana"><input {...bind('area')} placeholder="e.g. Tongi" /></Field>
      <Field label="City"><input {...bind('city')} placeholder="e.g. Gazipur" /></Field>
      <Field label="District"><input {...bind('district')} placeholder="e.g. Gazipur" /></Field>
      <Field label="Post code"><input {...bind('postCode')} inputMode="numeric" placeholder="1710" /></Field>
      <Field label="Country"><input {...bind('country')} placeholder="Bangladesh" /></Field>
      <p className="form-sub">More contact</p>
      <Field label="Other phone"><input {...bind('altPhone')} inputMode="tel" placeholder="Second number" /></Field>
      <Field label="Email"><input {...bind('email')} inputMode="email" placeholder={kind === 'factory' ? 'name@factory.com' : 'name@shop.com'} /></Field>
      <Field label="Website"><input {...bind('website')} inputMode="url" placeholder="www.example.com" /></Field>
      <p className="form-sub">Papers and bank</p>
      <Field label="Trade licence no."><input {...bind('tradeLicense')} /></Field>
      <Field label="BIN / VAT / tax no."><input {...bind('taxNo')} /></Field>
      <Field label="Bank or mobile account" wide><input {...bind('bank')} placeholder="Bank, account name and number, branch — or bKash/Nagad number" /></Field>
      <Field label="Note" wide><input {...bind('note')} placeholder={kind === 'factory' ? 'Minimum order, lead time, quality notes…' : 'Delivery days, quality notes…'} /></Field>
    </>
  )
}

/** Read-only details for a supplier or factory: full address and every contact and paper we keep. */
export function PartyView({ p, name }: { p: PartyDetails & { contact?: string; phone?: string; address?: string }; name: string }) {
  const addr = fullAddress(p)
  const rows: [string, React.ReactNode][] = [
    ['Contact person', p.contact],
    ['Phone', p.phone ? <PhoneLink phone={p.phone} label={name} /> : ''],
    ['Other phone', p.altPhone ? <PhoneLink phone={p.altPhone} label={name} /> : ''],
    ['Email', p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : ''],
    ['Website', p.website ? <a href={/^https?:/.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer">{p.website}</a> : ''],
    ['Address', addr],
    ['Trade licence', p.tradeLicense],
    ['BIN / VAT / tax no.', p.taxNo],
    ['Bank', p.bank],
  ]
  const shown = rows.filter(([, x]) => x)
  return (
    <div className="kv-list boxed">
      {shown.length ? shown.map(([k, x]) => <div key={k} className="kv"><span>{k}</span><b>{x}</b></div>) : <div className="kv"><span>Details</span><b className="t-muted">None added yet</b></div>}
      {addr && <div className="kv"><span>Map</span><b><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer">Open in maps</a></b></div>}
    </div>
  )
}
