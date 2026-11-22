import { useState } from 'react'
import { byId, fshort, tk, todayISO, type CourierProvider } from '@shared/domain'
import { courierLabel } from '@shared/courier'
import { PhoneLink } from '@/components/PhoneLink'
import { useBooks } from '@/core/store/context'
import { Button, Card, DataTable, Pill, Segmented, useSheets, useToast, SearchBox } from '@/ui'
import { isDone } from './parcelTone'
import { ParcelDetailSheet } from './ParcelDetailSheet'
import { parcelStatusText, parcelTone } from './parcelTone'
import { useCourier } from './useCourier'

type Show = 'open' | 'done' | 'all'

/** Every courier parcel, filtered by state and courier, with a button to fetch the latest status of those still out. */
export function ParcelsCard() {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const { refresh } = useCourier()
  const [show, setShow] = useState<Show>('open')
  const [courier, setCourier] = useState<CourierProvider | ''>('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const all = db.parcels || []
  const used = [...new Set(all.map((p) => p.provider))]
  const needle = q.trim().toLowerCase()
  const rows = all.filter((p) =>
    (show === 'all' || (show === 'done') === isDone(p.status)) && (!courier || p.provider === courier) &&
    (!needle || `${p.consignmentId} ${p.trackingCode} ${p.invoiceId} ${p.reference || ''} ${p.recipientName} ${p.phone}`.toLowerCase().includes(needle)))

  const refreshAll = async () => {
    setBusy(true)
    let ok = 0
    let failed = ''
    for (const p of all.filter((x) => !isDone(x.status) && x.provider !== 'manual')) {
      try {
        await refresh(p.id)
        ok++
      } catch (e) {
        failed = e instanceof Error ? e.message : 'failed'
      }
    }
    setBusy(false)
    toast(failed ? `Updated ${ok}. ${failed}` : `Updated ${ok} parcel${ok === 1 ? '' : 's'}`)
  }

  return (
    <Card icon="parcel" title="Parcels" sub="Tap a parcel for its status history and tracking link."
      action={<Button size="sm" variant="secondary" icon="restore" className="edit-only" disabled={busy} onClick={() => void refreshAll()}>{busy ? 'Checking…' : 'Update all statuses'}</Button>}>
      <div className="card-body pt0 tools-row">
        <Segmented<Show> label="Show parcels" value={show} onChange={setShow} options={[
          { value: 'open', label: `On the way (${all.filter((p) => !isDone(p.status)).length})` }, { value: 'done', label: 'Finished' }, { value: 'all', label: 'All' },
        ]} />
        <div className="tools-right">
          {used.length > 1 && (
            <select className="in narrow-select" value={courier} onChange={(e) => setCourier(e.target.value as CourierProvider | '')} aria-label="Courier">
              <option value="">All couriers</option>
              {used.map((p) => <option key={p} value={p}>{courierLabel(p)}</option>)}
            </select>
          )}
          <SearchBox value={q} onChange={setQ} placeholder="Consignment, invoice, name or phone" label="Search parcels" />
        </div>
      </div>
      {!all.length && (
        <div className="card-body pt0">
          <div className="next-step">
            <span>No parcels yet. Load sample parcels to see how booking, tracking and cash collection look.</span>
            <Button size="sm" icon="parcel" className="edit-only" onClick={() => { act('loadSampleParcels', { today: todayISO() }); toast('Sample parcels loaded, test mode on') }}>Load sample parcels</Button>
          </div>
        </div>
      )}
      <DataTable pageSize={25} rows={rows} rowKey={(p) => p.id} onRow={(p) => sheets.open(ParcelDetailSheet, { parcelId: p.id })}
        empty={all.length ? 'No parcels here.' : 'No parcels yet. Use Book a parcel, or Book courier on an invoice.'}
        columns={[
          { label: 'Parcel', primary: true, render: (p) => <span className="two-line"><b>{p.consignmentId}{p.test && <span className="test-tag">test</span>}</b><small>{courierLabel(p.provider).split(' (')[0]} · {fshort(p.date)}{p.invoiceId || p.reference ? ` · ${p.invoiceId || p.reference}` : ''}</small></span> },
          { label: 'To', render: (p) => <span className="two-line"><span>{byId(db.dealers, p.dealerId)?.name || p.recipientName}</span><small><PhoneLink phone={p.phone} label={p.recipientName} /></small></span> },
          { label: 'Address', render: (p) => <span className="t-muted">{p.address}{p.areaName ? ` · ${p.areaName}` : ''}</span> },
          { label: 'Cash to collect', align: 'right', render: (p) => (p.cod ? tk(p.cod) : <span className="t-muted">None</span>) },
          { label: 'Status', align: 'right', render: (p) => <Pill tone={parcelTone(p.status)}>{parcelStatusText(p.status)}</Pill> },
        ]} />
    </Card>
  )
}
