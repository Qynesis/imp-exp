import { byId, dealerLedger, invTotal, todayISO, type CourierProvider, type Db, type Invoice } from '@shared/domain'
import type { Area, BookRequest, BookResult, TrackResult } from '@shared/courier'
import { useBooks } from '@/core/store/context'

/** Who and what to send for an invoice: the dealer's details and what they still owe on it. */
export function parcelDefaults(db: Db, inv: Invoice): BookRequest {
  const d = byId(db.dealers, inv.dealerId)
  // an invoice saved a moment ago is not in the ledger yet: then it is what was not paid on the spot
  const due = (d && dealerLedger(db, d.id).open.find((o) => o.id === inv.id)?.out) ?? Math.max(invTotal(inv) - (inv.received || 0), 0)
  return {
    invoice: inv.id,
    name: d ? (d.owner ? `${d.owner} (${d.name})` : d.name) : '',
    phone: d?.phone || '',
    address: d ? [d.address, d.area].filter(Boolean).join(', ') : '',
    cod: inv.terms === 'credit' ? 0 : Math.round(due),
    note: inv.lines.map((l) => `${l.qty} ${l.unit || ''}`.trim()).join(', '),
    quantity: inv.lines.reduce((s, l) => s + l.qty, 0),
  }
}

/** The couriers offered when booking: the enabled ones, default first. */
export function enabledCouriers(db: Db): CourierProvider[] {
  const c = db.company.courier
  const def = c?.provider || 'demo'
  return [def, ...(c?.enabled || []).filter((p) => p !== def)]
}

/** Book parcels, track them and look up courier areas, through the books API. */
export function useCourier() {
  const { db, act, call } = useBooks()
  const provider: CourierProvider = db.company.courier?.provider || 'demo'

  /** Book with a courier and save the parcel; `invoice` links it to a sale (any customer when absent). */
  async function book(req: BookRequest, opts: { provider?: CourierProvider; invoice?: Invoice } = {}): Promise<string> {
    const p = opts.provider || provider
    const r = await call<BookResult>('POST', 'courier/book', { ...req, provider: p })
    act('saveParcel', {
      date: todayISO(), invoiceId: opts.invoice?.id || '', dealerId: opts.invoice?.dealerId || '', provider: p, consignmentId: r.consignmentId, trackingCode: r.trackingCode,
      trackingUrl: r.trackingUrl, status: r.status, cod: req.cod, recipientName: req.name, phone: req.phone, address: req.address, note: req.note,
      weight: req.weight, areaName: req.areaName, charge: r.charge, reference: req.invoice, history: [{ date: todayISO(), status: r.status }],
    })
    return r.consignmentId
  }

  async function refresh(parcelId: string): Promise<string> {
    const p = byId(db.parcels || [], parcelId)
    if (!p || p.provider === 'manual') return p?.status || ''
    const r = await call<{ status: string }>('POST', 'courier/status', { consignmentId: p.consignmentId, provider: p.provider })
    act('setParcelStatus', { id: p.id, status: r.status, date: todayISO() })
    return r.status
  }

  const track = (p: CourierProvider, code: string) => call<TrackResult>('POST', 'courier/track', { provider: p, code })
  const areas = (p: CourierProvider, parentId = '') => call<{ areas: Area[] }>('POST', 'courier/areas', { provider: p, parentId }).then((r) => r.areas)

  return { provider, book, refresh, track, areas }
}
