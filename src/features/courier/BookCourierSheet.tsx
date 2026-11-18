import { useEffect, useState, type FormEvent } from 'react'
import { byId, fshort, num, todayISO, tk, type CourierProvider } from '@shared/domain'
import { areaKind, courierLabel, type Area } from '@shared/courier'
import { ApiError } from '@/core/api/client'
import { useBooks } from '@/core/store/context'
import { Button, Field, Segmented, Sheet, useForm, useSheetItem, useToast } from '@/ui'
import { enabledCouriers, parcelDefaults, useCourier } from './useCourier'

type For = 'invoice' | 'other'

/** Book a parcel with any enabled courier, for an invoice or for any other customer; or record one booked outside. */
export function BookCourierSheet({ invoiceId }: { invoiceId?: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const { close } = useSheetItem()
  const { book, areas } = useCourier()
  const couriers = enabledCouriers(db)
  const recent = db.invoices.filter((i) => i.status === 'final').slice(-40).reverse()
  const first = byId(db.invoices, invoiceId)
  const start = first ? parcelDefaults(db, first) : null
  const [v, set, bind, nbind] = useForm({
    // a trader's parcels usually carry a sale, so start there; Other customer is one tap away
    provider: couriers[0], for: (recent.length ? 'invoice' : 'other') as For, invoiceId: first?.id || '',
    name: start?.name || '', phone: start?.phone || '', address: start?.address || '', cod: start ? String(start.cod) : '', note: start?.note || '', weight: '1', quantity: start?.quantity ? String(start.quantity) : '1',
    reference: '', cityId: '', zoneId: '', areaId: '', consignmentId: '', trackingCode: '', trackingUrl: '',
  })
  // `for` says which courier the lists belong to, so a switch shows loading until its own lists arrive
  const [list, setList] = useState<{ for: string; cities: Area[]; zones: Area[]; areas: Area[]; error: string }>({ for: '', cities: [], zones: [], areas: [], error: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const kind = areaKind(v.provider)
  const manual = v.provider === 'manual'
  const inv = byId(db.invoices, v.invoiceId)
  const loading = !!kind && list.for !== v.provider
  const mine = list.for === v.provider
  const cities = mine ? list.cities : []
  const zones = mine ? list.zones : []
  const areaList = mine ? list.areas : []

  // the courier's own delivery areas: Pathao cities then zones, RedX areas
  useEffect(() => {
    if (!kind) return
    let live = true
    areas(v.provider)
      .then((a) => live && setList({ for: v.provider, zones: [], error: '', cities: kind === 'city-zone' ? a : [], areas: kind === 'area' ? a : [] }))
      .catch((e: unknown) => live && setList({ for: v.provider, cities: [], zones: [], areas: [], error: e instanceof ApiError ? e.message : 'Could not load the areas.' }))
    return () => {
      live = false
    }
  }, [kind, v.provider]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (kind !== 'city-zone' || !v.cityId) return
    let live = true
    areas(v.provider, v.cityId)
      .then((z) => live && setList((l) => ({ ...l, zones: z })))
      .catch(() => live && setList((l) => ({ ...l, zones: [] })))
    return () => {
      live = false
    }
  }, [kind, v.cityId, v.provider]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickInvoice = (id: string) => {
    set('invoiceId', id)
    const i = byId(db.invoices, id)
    if (!i) return
    const d = parcelDefaults(db, i)
    for (const [k, val] of [['name', d.name], ['phone', d.phone], ['address', d.address], ['cod', String(d.cod)], ['note', d.note], ['quantity', String(d.quantity || 1)]] as const) set(k, val)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (v.for === 'invoice' && !inv) return setErr('Pick the invoice, or choose Other customer.')
    if (!v.name.trim() || !v.phone.trim() || !v.address.trim()) return setErr('Name, phone and address are needed for the courier.')
    if (kind === 'city-zone' && (!v.cityId || !v.zoneId)) return setErr('Pick the city and zone.')
    if (kind === 'area' && !v.areaId) return setErr('Pick the delivery area.')
    if (manual && !v.consignmentId.trim()) return setErr('Enter the consignment number the courier gave you.')
    const city = cities.find((c) => c.id === v.cityId)?.name
    const zone = zones.find((z) => z.id === v.zoneId)?.name
    const area = areaList.find((a) => a.id === v.areaId)?.name
    const reference = v.for === 'invoice' && inv ? inv.id : v.reference.trim() || `P-${Date.now().toString(36).toUpperCase()}`
    const req = {
      invoice: reference, name: v.name.trim(), phone: v.phone.trim(), address: v.address.trim(), cod: num(v.cod), note: v.note.trim(), weight: num(v.weight) || undefined,
      quantity: num(v.quantity) || 1, cityId: v.cityId, zoneId: v.zoneId, areaId: v.areaId, areaName: kind === 'city-zone' ? [zone, city].filter(Boolean).join(', ') : area,
    }
    const invoice = v.for === 'invoice' ? inv : undefined
    if (manual) {
      act('saveParcel', {
        date: todayISO(), invoiceId: invoice?.id || '', dealerId: invoice?.dealerId || '', provider: 'manual', consignmentId: v.consignmentId.trim(), trackingCode: v.trackingCode.trim(),
        trackingUrl: v.trackingUrl.trim(), status: 'manual', cod: req.cod, recipientName: req.name, phone: req.phone, address: req.address, note: req.note, weight: req.weight, reference,
        history: [{ date: todayISO(), status: 'manual' }],
      })
      toast(`Parcel ${v.consignmentId.trim()} recorded`)
      return close()
    }
    setBusy(true)
    setErr('')
    try {
      const id = await book(req, { provider: v.provider, invoice })
      toast(`Booked with ${courierLabel(v.provider)} · ${id}`)
      close()
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : 'Booking failed. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Book a parcel" crumb={inv ? `Invoice ${inv.id}` : 'Courier'} wide onSubmit={(e) => void submit(e)}
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" icon="parcel" disabled={busy}>{busy ? 'Booking…' : manual ? 'Save parcel' : `Book with ${courierLabel(v.provider).split(' ')[0]}`}</Button></>}>
      {err && <div className="err" role="alert">{err}</div>}
      <div className="form-grid">
        <Field label="Courier">
          <select className="in" value={v.provider} onChange={(e) => { set('provider', e.target.value as CourierProvider); set('cityId', ''); set('zoneId', ''); set('areaId', '') }}>
            {couriers.map((p) => <option key={p} value={p}>{courierLabel(p)}</option>)}
          </select>
        </Field>
        <div className="field">
          <span className="field-label">Parcel for</span>
          <Segmented<For> label="Parcel for" value={v.for} onChange={(f) => set('for', f)} options={[{ value: 'invoice', label: 'An invoice' }, { value: 'other', label: 'Other customer' }]} />
        </div>
        {v.for === 'invoice' ? (
          <Field label="Invoice" wide>
            <select className="in" value={v.invoiceId} onChange={(e) => pickInvoice(e.target.value)}>
              <option value="">Pick an invoice</option>
              {recent.map((i) => <option key={i.id} value={i.id}>{i.id} · {byId(db.dealers, i.dealerId)?.name} · {fshort(i.date)}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Your reference" hint="Order or memo number; made up for you when empty"><input {...bind('reference')} placeholder="e.g. WEB-1042" /></Field>
        )}
        <Field label="Recipient name"><input {...bind('name')} /></Field>
        <Field label="Recipient phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXXXXXXXX" /></Field>
        <Field label="Delivery address" wide><input {...bind('address')} placeholder="House, road, area, district" /></Field>
        {kind === 'city-zone' && (
          <>
            <Field label="City" hint={loading ? 'Loading from the courier…' : list.error || undefined}>
              <select className="in" value={v.cityId} onChange={(e) => { set('cityId', e.target.value); set('zoneId', '') }}>
                <option value="">Pick the city</option>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Zone">
              <select {...bind('zoneId')} disabled={!v.cityId}>
                <option value="">{v.cityId ? 'Pick the zone' : 'Pick the city first'}</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </Field>
          </>
        )}
        {kind === 'area' && (
          <Field label="Delivery area" wide hint={loading ? 'Loading from the courier…' : list.error || undefined}>
            <select {...bind('areaId')}>
              <option value="">Pick the area</option>
              {areaList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Cash to collect (Tk)" hint={inv ? (inv.terms === 'credit' ? 'Credit sale: usually 0, the dealer pays us later.' : `Due on this invoice ${tk(num(start?.cod ?? 0))}`) : '0 if already paid'}><input {...nbind('cod')} placeholder="0" /></Field>
        <Field label="Weight (kg)"><input {...nbind('weight')} placeholder="1" /></Field>
        <Field label="Items in the parcel"><input {...nbind('quantity')} placeholder="1" /></Field>
        <Field label="Note for the courier"><input {...bind('note')} placeholder="e.g. 5 cartons, handle with care" /></Field>
        {manual && (
          <>
            <Field label="Consignment number"><input {...bind('consignmentId')} /></Field>
            <Field label="Tracking code"><input {...bind('trackingCode')} placeholder="Optional" /></Field>
            <Field label="Tracking link" wide><input {...bind('trackingUrl')} placeholder="Optional" /></Field>
          </>
        )}
      </div>
    </Sheet>
  )
}
