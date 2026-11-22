import { useMemo, useState } from 'react'
import { customsCalc, fmt, plural, shipmentCalc, sum, tk } from '@shared/domain'
import type { FeatureRouteProps } from '@/app/features'
import { PageHead } from '@/components/PageHead'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Card, DataTable, Pill, Segmented, Stat, SearchBox } from '@/ui'
import { CustomsCard } from './CustomsCard'

type Filter = 'open' | 'done' | 'all'

/** #/customs and #/customs/<shipment id> */
export default function CustomsPage({ params: [id] }: FeatureRouteProps) {
  const { db } = useBooks()
  const [filter, setFilter] = useState<Filter>('open')
  const all = useMemo(() => db.imports.map((s) => ({ s, c: shipmentCalc(db, s), cc: customsCalc(db, s) })), [db])
  const open = all.filter((r) => !r.cc.released)
  const [q, setQ] = useState('')
  const n = q.trim().toLowerCase()
  const rows = (filter === 'open' ? open : filter === 'done' ? all.filter((r) => r.cc.released) : all)
    .filter((r) => !n || `${r.s.id} ${r.s.supplier} ${r.s.country} ${r.s.lcNo} ${r.c.productName} ${r.s.customs?.boeNo || ''}`.toLowerCase().includes(n))
  const picked = all.find((r) => r.s.id === id) || rows[0]
  const dutyDue = sum(open.filter((r) => !r.cc.dates.duty), (r) => r.cc.dutyTotal)
  const demurrage = sum(open, (r) => r.cc.demurrage)
  const missing = sum(open, (r) => r.cc.docs.length - r.cc.docsOk)

  return (
    <>
      <PageHead title="Customs clearance" sub="Every shipment going through customs: documents, Bill of Entry, duty and release." />
      <div className="stats">
        <Stat icon="ship" label="Shipments in clearance" value={plural(open.length, 'shipment')} sub={`${all.length - open.length} released`} />
        <Stat icon="money" label="Duty still to pay (estimate)" value={tk(dutyDue)} tone={dutyDue > 0 ? 'warn' : undefined} />
        <Stat icon="alert" label="Documents still missing" value={fmt(missing)} tone={missing > 0 ? 'warn' : undefined} sub="Across open shipments" />
        <Stat icon="clock" label="Demurrage running" value={tk(demurrage)} tone={demurrage > 0 ? 'warn' : undefined} sub={demurrage > 0 ? 'Free time has ended' : 'Nothing overdue'} />
      </div>
      <Card>
        <div className="card-tools filter-bar">
          <Segmented<Filter> label="Which shipments" value={filter} onChange={setFilter} options={[{ value: 'open', label: 'In clearance' }, { value: 'done', label: 'Released' }, { value: 'all', label: 'All' }]} />
          <SearchBox value={q} onChange={setQ} placeholder="Shipment, LC, B/E no. or item" label="Search shipments" />
        </div>
        <DataTable
            pageSize={25}
          rows={rows}
          rowKey={(r) => r.s.id}
          onRow={(r) => go('customs/' + r.s.id)}
          rowClass={(r) => r.s.id === picked?.s.id && 'selected'}
          empty={filter === 'open' ? 'Nothing is waiting at customs.' : 'No shipments here.'}
          columns={[
            { label: 'Shipment', primary: true, render: (r) => `${r.s.id} · ${r.c.productName}` },
            { label: 'Type', render: (r) => (r.c.exp ? 'Export' : 'Import') },
            { label: 'HS code', render: (r) => r.cc.cu.hsCode },
            { label: 'Bill of Entry', render: (r) => r.cc.cu.boeNo },
            { label: 'Documents', align: 'right', render: (r) => <span className={r.cc.docsOk < r.cc.docs.length ? 't-warn' : 't-good'}>{r.cc.docsOk} of {r.cc.docs.length}</span> },
            { label: 'Days at port', align: 'right', render: (r) => (r.cc.daysAtPort === null ? '' : <span className={r.cc.overDays > 0 ? 't-warn strong' : ''}>{r.cc.daysAtPort}{r.cc.overDays > 0 ? ` · ${r.cc.overDays} over free time` : ''}</span>) },
            { label: 'Duty estimate', align: 'right', render: (r) => (r.cc.dutyTotal ? tk(r.cc.dutyTotal) : '') },
            { label: 'Stage', render: (r) => <Pill tone={r.cc.tone}>{r.cc.stageText}</Pill> },
          ]}
        />
      </Card>
      {picked && <CustomsCard key={picked.s.id} shipment={picked.s} />}
    </>
  )
}
