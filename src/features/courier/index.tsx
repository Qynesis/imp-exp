import { addDays, tk, todayISO } from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { PageHead } from '@/components/PageHead'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Button, Segmented, Stat, useSheets } from '@/ui'
import { BookCourierSheet } from './BookCourierSheet'
import { CouriersPanel } from './CouriersPanel'
import { ParcelsCard } from './ParcelsCard'
import { isDone } from './parcelTone'
import { TrackPanel } from './TrackPanel'

type Tab = 'parcels' | 'track' | 'couriers'
const TABS: Tab[] = ['parcels', 'track', 'couriers']

/** #/courier, #/courier/track, #/courier/couriers */
export default function CourierPage({ params: [tabParam] }: FeatureRouteProps) {
  const { db } = useBooks()
  const sheets = useSheets()
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'parcels'
  const all = db.parcels || []
  const out = all.filter((p) => !isDone(p.status))
  const monthStart = `${todayISO().slice(0, 7)}-01`
  const deliveredMonth = all.filter((p) => p.status.startsWith('delivered') && (p.history.at(-1)?.date || p.date) >= monthStart)
  const returned = all.filter((p) => /cancel|return/.test(p.status) && p.date >= addDays(todayISO(), -30))
  return (
    <>
      <PageHead title="Courier" sub="Book parcels with Steadfast, Pathao or RedX, follow them to the door, and keep track of the cash they collect." actions={
        <>
          <Button variant="secondary" icon="search" onClick={() => go('courier/track')}>Track a parcel</Button>
          <Button icon="parcel" onClick={() => sheets.open(BookCourierSheet, {})}>Book a parcel</Button>
        </>
      } />
      <div className="stats">
        <Stat icon="truck" label="On the way" value={String(out.length)} sub={out.length ? `${out.filter((p) => p.status === 'in_review' || p.status === 'pickup-pending' || p.status === 'pickup_requested').length} waiting for pickup` : 'Nothing out right now'} />
        <Stat icon="check" label="Delivered this month" value={String(deliveredMonth.length)} sub={`${tk(deliveredMonth.reduce((s, p) => s + p.cod, 0))} collected by couriers`} />
        <Stat icon="wallet" label="Cash still to come" value={tk(out.reduce((s, p) => s + p.cod, 0))} sub="Cash on delivery on parcels still out" />
        <Stat icon="restore" label="Returned or cancelled" value={String(returned.length)} tone={returned.length ? 'warn' : undefined} sub="Last 30 days" />
      </div>
      <Segmented<Tab> label="Courier section" value={tab} onChange={(t) => go(t === 'parcels' ? 'courier' : 'courier/' + t)} options={[
        { value: 'parcels', label: 'Parcels' }, { value: 'track', label: 'Track' }, { value: 'couriers', label: 'Couriers' },
      ]} />
      {tab === 'parcels' && <ParcelsCard />}
      {tab === 'track' && <TrackPanel />}
      {tab === 'couriers' && <CouriersPanel />}
    </>
  )
}
