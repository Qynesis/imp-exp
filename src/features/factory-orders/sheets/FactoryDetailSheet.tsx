import { factoryRows, fullAddress, fdate, fmt, foCalc, tk } from '@shared/domain'
import { useSee } from '@/app/useSee'
import { Hidden } from '@/components/Hidden'
import { PartyView } from '@/components/PartyFields'
import { PhoneLink } from '@/components/PhoneLink'
import { go } from '@/core/router'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, DataTable, Pill, Sheet, useSheetItem, useSheets, useToast, type SheetComponent } from '@/ui'
import { AddFactorySheet } from './AddFactorySheet'
import { NewFactoryOrderSheet } from './NewFactoryOrderSheet'

/** One factory: who they are, every order with them, and where the money stands. */
export const FactoryDetailSheet: SheetComponent<{ factoryId: string }> = ({ factoryId }) => {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const see = useSee()
  const { close } = useSheetItem()
  const row = factoryRows(db).find((r) => r.factory.id === factoryId)
  if (!row) return null
  const f = row.factory
  const orders = db.factoryOrders.filter((o) => o.factoryId === f.id).map((o) => ({ o, c: foCalc(db, o) })).sort((a, b) => (a.o.placed < b.o.placed ? 1 : -1))
  const canEdit = !accessGuard.readonly
  const money = (n: number) => (see.cost ? tk(n) : <Hidden />)
  return (
    <Sheet title={f.name} crumb={f.archived ? 'Factory · not in use' : 'Factory'} wide
      footer={canEdit ? (
        <>
          <Button variant="secondary" onClick={() => { if (!act('archiveFactory', { id: f.id, archived: !f.archived })) toast(f.archived ? 'Factory in use again' : 'Factory hidden from pickers') }}>{f.archived ? 'Use again' : 'Stop using'}</Button>
          <Button variant="secondary" icon="edit" onClick={() => sheets.open(AddFactorySheet, { factoryId: f.id })}>Edit</Button>
          {!f.archived && <Button icon="factory" onClick={() => sheets.open(NewFactoryOrderSheet, { factoryId: f.id })}>New order</Button>}
        </>
      ) : undefined}>
      <p className="t-muted tight">{[f.contact, f.makes].filter(Boolean).join(' · ')} <PhoneLink phone={f.phone} label={f.name} />{f.email ? ` · ${f.email}` : ''}</p>
      {fullAddress(f) && <p className="t-muted tight">{fullAddress(f)}</p>}
      <div className="mini-stats">
        <div><span>Orders</span><b>{row.orders}</b><small className="t-muted">{row.open} open · last {row.lastOrder ? fdate(row.lastOrder) : '—'}</small></div>
        <div><span>Still to come</span><b>{fmt(row.pendingQty)}</b><small className="t-muted">units on open orders</small></div>
        <div><span>Billed / paid</span><b>{money(row.billed)}</b><small className="t-muted">paid {see.cost ? tk(row.paid) : '•••'}</small></div>
        <div><span>{row.balance < 0 ? 'We owe' : row.balance > 0 ? 'Advance with them' : 'Balance'}</span><b className={row.balance < 0 ? 't-warn' : row.balance > 0 ? 't-good' : undefined}>{money(Math.abs(row.balance))}</b></div>
      </div>
      {row.products.length > 0 && <p className="tight"><b>Makes for us:</b> {row.products.join(', ')}</p>}
      <DataTable rows={orders} rowKey={(x) => x.o.id} pageSize={10} onRow={(x) => { close(); go('factory-orders/' + x.o.id) }} empty="No orders with this factory yet."
        columns={[
          { label: 'Order', primary: true, render: (x) => <span className="two-line"><b>{x.o.id}</b><small className="t-muted">{fdate(x.o.placed)}</small></span> },
          { label: 'Product', render: (x) => x.c.product?.name },
          { label: 'Received', align: 'right', render: (x) => `${fmt(x.c.received)} / ${fmt(x.o.qty)} ${x.c.unit}` },
          { label: 'Rate', align: 'right', render: (x) => money(x.o.rate) },
          { label: 'Status', align: 'right', render: (x) => <Pill tone={x.c.tone}>{x.c.status}</Pill> },
        ]} />
      <h3 className="sheet-h">Contact, address and papers</h3>
      <PartyView p={f} name={f.name} />
      {f.note && <p className="t-muted">{f.note}</p>}
    </Sheet>
  )
}
FactoryDetailSheet.readOnlySafe = true

