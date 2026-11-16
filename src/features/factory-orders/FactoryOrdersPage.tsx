import { useMemo, useState } from 'react'
import { fmt, foCalc } from '@shared/domain'
import { PageHead } from '@/components/PageHead'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Button, Card, DataTable, Pill, Segmented, useSheets } from '@/ui'
import { AddFactorySheet } from './sheets/AddFactorySheet'
import { NewFactoryOrderSheet } from './sheets/NewFactoryOrderSheet'

type Filter = 'all' | '1' | '2'

export function FactoryOrdersPage() {
  const { db } = useBooks()
  const sheets = useSheets()
  const [filter, setFilter] = useState<Filter>('all')
  const rows = useMemo(
    () => db.factoryOrders.filter((o) => filter === 'all' || String(o.type) === filter).map((o) => ({ ...o, c: foCalc(db, o) })),
    [db, filter],
  )
  return (
    <>
      <PageHead title="Factory orders" sub="Every order placed with a factory, what has arrived and what is still due." actions={
        <>
          <Button icon="plus" variant="secondary" onClick={() => sheets.open(AddFactorySheet)}>Add factory</Button>
          <Button icon="factory" onClick={() => sheets.open(NewFactoryOrderSheet)}>New factory order</Button>
        </>
      } />
      <div className="grid2 tight">
        <div className="card explain">
          <b>Type 1 · Raw material supplied</b>
          <p>We buy raw materials, hand them to the factory and receive finished goods. The factory bills only its making charge.</p>
        </div>
        <div className="card explain">
          <b>Type 2 · Direct order</b>
          <p>The factory uses its own materials. We order finished goods and the factory bills the full product price.</p>
        </div>
      </div>
      <Card>
        <div className="card-tools">
          <Segmented<Filter> label="Order type" value={filter} onChange={setFilter} options={[
            { value: 'all', label: 'All orders' },
            { value: '1', label: 'Raw material supplied' },
            { value: '2', label: 'Direct order' },
          ]} />
        </div>
        <DataTable
            pageSize={25}
          rows={rows}
          onRow={(r) => go('factory-orders/' + r.id)}
          empty="No factory orders yet. Place the first one with New factory order."
          columns={[
            { label: 'Order', primary: true, render: (r) => <span className="order-id">{r.id}</span> },
            { label: 'Factory', render: (r) => r.c.factory?.name },
            { label: 'Product', render: (r) => r.c.product?.name },
            { label: 'Type', render: (r) => <span className="t-muted">{r.c.typeLabel}</span> },
            { label: 'Ordered', align: 'right', render: (r) => `${fmt(r.qty)} ${r.c.unit}` },
            { label: 'Received', align: 'right', render: (r) => fmt(r.c.received) },
            { label: 'Pending', align: 'right', render: (r) => <b className={r.c.pending > 0 ? 't-warn' : 't-muted'}>{fmt(r.c.pending)}</b> },
            { label: 'Money balance', align: 'right', render: (r) => <span className={`t-${r.c.balanceTone}`}>{r.c.balanceText}</span> },
            { label: 'Status', render: (r) => <Pill tone={r.c.tone}>{r.c.status}</Pill> },
          ]}
        />
      </Card>
    </>
  )
}
