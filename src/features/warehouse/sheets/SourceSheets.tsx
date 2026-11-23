import { byId, fdate, importSourceName, fmt, inboundLog, shipmentCalc, supplierLedger, supplyRows, tk } from '@shared/domain'
import { useSee } from '@/app/useSee'
import { Hidden } from '@/components/Hidden'
import { PartyView } from '@/components/PartyFields'
import { go } from '@/core/router'
import { accessGuard, useBooks } from '@/core/store/context'
import { AddSupplierSheet } from '@/features/suppliers/sheets/AddSupplierSheet'
import { NewPurchaseSheet } from '@/features/suppliers/sheets/NewPurchaseSheet'
import { Button, DataTable, Pill, Sheet, useSheetItem, useSheets, type SheetComponent } from '@/ui'
import { SourceStockTable } from '../SourceStockTable'

/** A supplier as the warehouse sees it: who and where they are, and every item they send. */
export const SupplierSourceSheet: SheetComponent<{ supplierId: string }> = ({ supplierId }) => {
  const { db } = useBooks()
  const see = useSee()
  const sheets = useSheets()
  const { close } = useSheetItem()
  const s = byId(db.suppliers, supplierId)
  if (!s) return null
  const rows = supplyRows(db, s.id)
  const led = supplierLedger(db, s.id)
  const m = (n: number) => (see.cost ? tk(n) : <Hidden />)
  const canEdit = !accessGuard.readonly
  return (
    <Sheet title={s.name} crumb="Supplier" wide
      footer={
        <>
          <Button variant="secondary" onClick={() => { close(); go('suppliers/' + s.id) }}>Open supplier page</Button>
          {canEdit && <Button variant="secondary" icon="edit" onClick={() => sheets.open(AddSupplierSheet, { supplierId: s.id })}>Edit details</Button>}
          {canEdit && <Button icon="cart" onClick={() => sheets.open(NewPurchaseSheet, { supplierId: s.id })}>Receive goods</Button>}
        </>
      }>
      <p className="t-muted tight">{s.goods || 'No goods listed'} · {s.terms === 'credit' ? `Credit, ${s.days} days` : 'Cash'}{see.cost && led.due > 0 ? ` · we owe ${tk(led.due)}` : ''}</p>
      <PartyView p={s} name={s.name} />
      {s.note && <p className="t-muted">{s.note}</p>}
      <h3 className="sheet-h">What they send us</h3>
      <DataTable rows={rows} rowKey={(r) => r.productId} empty="Nothing bought from them yet."
        columns={[
          { label: 'Item', primary: true, render: (r) => <span className="two-line"><b>{r.productName}</b><small className="t-muted">last {fdate(r.lastDate)}</small></span> },
          { label: 'Deliveries', align: 'right', render: (r) => r.purchases },
          { label: 'Quantity', align: 'right', render: (r) => `${fmt(r.qty)} ${r.unit}` },
          { label: 'Last price', align: 'right', render: (r) => m(r.lastRate) },
          { label: 'Price range', align: 'right', render: (r) => (see.cost ? (r.minRate === r.maxRate ? tk(r.minRate) : `${tk(r.minRate)} – ${tk(r.maxRate)}`) : <Hidden />) },
        ]} />
      <h3 className="sheet-h">Their goods in our warehouses</h3>
      <SourceStockTable kind="supplier" id={s.id} name={s.name} />
    </Sheet>
  )
}
SupplierSourceSheet.readOnlySafe = true

/** An overseas supplier we import from: every shipment from them and where each stands. */
export const ImportSourceSheet: SheetComponent<{ name: string }> = ({ name }) => {
  const { db } = useBooks()
  const see = useSee()
  const { close } = useSheetItem()
  const key = name.trim().toLowerCase()
  const list = db.imports.filter((s) => s.direction !== 'export' && importSourceName(s).toLowerCase() === key).map((s) => ({ s, c: shipmentCalc(db, s) }))
  if (!list.length) return null
  const countries = [...new Set(list.map((x) => x.s.country).filter(Boolean))]
  const banks = [...new Set(list.map((x) => x.s.bank).filter(Boolean))]
  const received = inboundLog(db).filter((r) => r.kind === 'import' && list.some((x) => x.s.id === r.sourceId))
  return (
    <Sheet title={importSourceName(list[0].s)} crumb="Import source" wide>
      <div className="kv-list boxed">
        <div className="kv"><span>Country</span><b>{countries.join(', ') || '—'}</b></div>
        <div className="kv"><span>Shipments</span><b>{list.length} · {received.length} reached the warehouse</b></div>
        <div className="kv"><span>Items</span><b>{[...new Set(list.map((x) => x.c.productName))].join(', ')}</b></div>
        {banks.length > 0 && <div className="kv"><span>LC opened with</span><b>{banks.join(', ')}</b></div>}
      </div>
      <DataTable rows={list} rowKey={(x) => x.s.id} onRow={(x) => { close(); go('imports/' + x.s.id) }}
        columns={[
          { label: 'Shipment', primary: true, render: (x) => <span className="two-line"><b>{x.s.id}</b><small className="t-muted">{x.s.lcNo ? (/^lc/i.test(x.s.lcNo) ? x.s.lcNo : `LC ${x.s.lcNo}`) : 'No LC number'}</small></span> },
          { label: 'Item', render: (x) => x.c.productName },
          { label: 'Quantity', align: 'right', render: (x) => `${fmt(x.s.qty)} ${x.s.unit}` },
          { label: 'Landed cost / unit', align: 'right', render: (x) => (see.cost ? tk(x.c.perUnit) : <Hidden />) },
          { label: 'Status', align: 'right', render: (x) => <Pill tone={x.c.tone}>{x.s.steps.warehouse?.date ? `In warehouse ${fdate(x.s.steps.warehouse.date)}` : x.c.status}</Pill> },
        ]} />
      <h3 className="sheet-h">Their goods in our warehouses</h3>
      <SourceStockTable kind="import" id={name} name={name} />
    </Sheet>
  )
}
ImportSourceSheet.readOnlySafe = true
