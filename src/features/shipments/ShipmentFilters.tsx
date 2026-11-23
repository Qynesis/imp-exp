import type { ReactNode } from 'react'
import type { Db } from '@shared/domain'
import { FilterDates, FilterPanel, FilterSelect } from '@/components/filters/Filters'
import type { useFilters } from '@/components/filters/filterState'
import { SearchBox, Segmented } from '@/ui'
import { shipmentFilterOptions, type ShipFilter } from './shipmentFilter'

/** Search, direction and state up front; step, transport, country, party, terms, bank, warehouse and dates behind "Filters". */
export function ShipmentFilters({ db, f, q, setQ, summary }: { db: Db; f: ReturnType<typeof useFilters<ShipFilter>>; q: string; setQ: (x: string) => void; summary?: ReactNode }) {
  const o = shipmentFilterOptions(db)
  const { v, set } = f
  return (
    <FilterPanel active={f.active} onReset={() => { f.reset(); setQ('') }} summary={summary}
      main={<>
        <SearchBox value={q} onChange={setQ} placeholder="ID, LC, party, B/L, container, HS, note" label="Search shipments" />
        <Segmented label="Direction" value={v.dir} onChange={(x) => set('dir', x)} options={[{ value: 'all', label: 'All' }, { value: 'import', label: 'Imports' }, { value: 'export', label: 'Exports' }]} />
        <Segmented label="State" value={v.state} onChange={(x) => set('state', x)} options={[{ value: 'all', label: 'Any state' }, { value: 'open', label: 'In progress' }, { value: 'done', label: 'Completed' }]} />
      </>}>
      <FilterSelect label="Waiting for step" value={v.step} onChange={(x) => set('step', x)} all="Any step" groups={o.steps.filter((g) => v.dir === 'all' || g.label.toLowerCase().startsWith(v.dir))} />
      <FilterSelect label="Transport" value={v.mode} onChange={(x) => set('mode', x)} all="Every transport" options={o.modes} />
      <FilterSelect label="Country" value={v.country} onChange={(x) => set('country', x)} all="Every country" options={o.countries} />
      <FilterSelect label="Supplier or buyer" value={v.party} onChange={(x) => set('party', x)} all="Everyone" options={o.parties} />
      <FilterSelect label="Payment terms" value={v.pay} onChange={(x) => set('pay', x)} all="Any terms" options={o.pays} />
      <FilterSelect label="Bank" value={v.bank} onChange={(x) => set('bank', x)} all="Every bank" options={o.banks} />
      {o.sites.length > 1 && <FilterSelect label="Received into" value={v.site} onChange={(x) => set('site', x)} all="Any warehouse" options={o.sites} />}
      <FilterSelect label="Alerts" value={v.late} onChange={(x) => set('late', x)} all="With or without" options={[{ value: 'warn', label: 'Needs attention only' }]} />
      <FilterDates label="Started (LC or contract)" from={v.from} to={v.to} onFrom={(x) => set('from', x)} onTo={(x) => set('to', x)} />
    </FilterPanel>
  )
}
