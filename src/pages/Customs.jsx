import { useState } from 'react'
import { fmt, plural, tk } from '../lib/format.js'
import { customsCalc, importCalc } from '../lib/selectors.js'
import { useStore } from '../lib/store.jsx'
import { Card, DataTable, Pill, Segmented, Stat, go } from '../ui.jsx'
import { PageHead } from './common.jsx'
import { CustomsCard } from './Imports.jsx'

export default function Customs({ id }) {
  const { db } = useStore()
  const [filter, setFilter] = useState('open')
  const all = db.imports.map((i) => ({ ...i, c: importCalc(db, i), cc: customsCalc(db, i) }))
  const open = all.filter((r) => !r.cc.released)
  const rows = filter === 'open' ? open : filter === 'done' ? all.filter((r) => r.cc.released) : all
  const dutyDue = open.filter((r) => !r.cc.dates.duty).reduce((s, r) => s + r.cc.dutyTotal, 0)
  const demurrage = open.reduce((s, r) => s + r.cc.demurrage, 0)
  const picked = all.find((r) => r.id === id) || rows[0]
  const missing = open.reduce((s, r) => s + (r.cc.docs.length - r.cc.docsOk), 0)

  return (
    <>
      <PageHead title="Customs clearance" sub="Every shipment going through customs: documents, Bill of Entry, duty and release." />
      <div className="stats">
        <Stat label="Shipments in clearance" value={plural(open.length, 'shipment')} sub={`${all.length - open.length} released`} />
        <Stat label="Duty still to pay (estimate)" value={tk(dutyDue)} tone={dutyDue > 0 ? 'warn' : undefined} />
        <Stat label="Documents still missing" value={fmt(missing)} tone={missing > 0 ? 'warn' : undefined} sub="Across open shipments" />
        <Stat label="Demurrage running" value={tk(demurrage)} tone={demurrage > 0 ? 'warn' : undefined} sub={demurrage > 0 ? 'Free time has ended' : 'Nothing overdue'} />
      </div>
      <Card>
        <div className="card-tools">
          <Segmented label="Which shipments" value={filter} onChange={setFilter} options={[{ value: 'open', label: 'In clearance' }, { value: 'done', label: 'Released' }, { value: 'all', label: 'All' }]} />
        </div>
        <DataTable
          rows={rows}
          onRow={(r) => go('customs/' + r.id)}
          rowClass={(r) => r.id === picked?.id && 'selected'}
          empty={filter === 'open' ? 'Nothing is waiting at customs.' : 'No shipments here.'}
          columns={[
            { label: 'Shipment', primary: true, render: (r) => `${r.id} · ${r.c.productName}` },
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
      {picked && <CustomsCard key={picked.id} imp={db.imports.find((i) => i.id === picked.id)} />}
    </>
  )
}
