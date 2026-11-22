import { useState } from 'react'
import { fdate, fmt, supplyRows, tk } from '@shared/domain'
import { useSee } from '@/app/useSee'
import { Hidden } from '@/components/Hidden'
import { go } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { DataTable, Segmented, Sheet, useSheetItem, type SheetComponent, SearchBox } from '@/ui'

type By = 'item' | 'supplier'

/** Which supplier gives us which item, how much and at what price: for the warehouse and for buying. */
export const SupplyOverviewSheet: SheetComponent<object> = () => {
  const { db } = useBooks()
  const see = useSee()
  const { close } = useSheetItem()
  const [q, setQ] = useState('')
  const [by, setBy] = useState<By>('item')
  const rows = supplyRows(db)
    .filter((r) => !q || `${r.productName} ${r.supplierName}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (by === 'item' ? a.productName.localeCompare(b.productName) || a.avgRate - b.avgRate : a.supplierName.localeCompare(b.supplierName) || a.productName.localeCompare(b.productName)))
  // the cheapest supplier of each item, on average price
  const cheapest = new Map<string, string>()
  for (const r of supplyRows(db)) {
    const best = cheapest.get(r.productId)
    const bestRow = supplyRows(db).find((x) => x.productId === r.productId && x.supplierId === best)
    if (!bestRow || r.avgRate < bestRow.avgRate) cheapest.set(r.productId, r.supplierId)
  }
  const m = (n: number) => (see.cost ? tk(n) : <Hidden />)
  return (
    <Sheet title="What we buy, by supplier" crumb="Suppliers" wide>
      <div className="labels-filters">
        <Segmented<By> label="Group by" value={by} onChange={setBy} options={[{ value: 'item', label: 'By item' }, { value: 'supplier', label: 'By supplier' }]} />
        <SearchBox value={q} onChange={setQ} placeholder="Item or supplier" label="Search" />
      </div>
      <DataTable rows={rows} rowKey={(r) => r.supplierId + r.productId} pageSize={25} onRow={(r) => { close(); go('suppliers/' + r.supplierId) }} empty="No purchases from suppliers yet."
        columns={[
          { label: by === 'item' ? 'Item' : 'Supplier', primary: true, render: (r) => <b>{by === 'item' ? r.productName : r.supplierName}</b> },
          { label: by === 'item' ? 'Supplier' : 'Item', render: (r) => <span className="two-line"><span>{by === 'item' ? r.supplierName : r.productName}</span>{see.cost && cheapest.get(r.productId) === r.supplierId && supplyRows(db).filter((x) => x.productId === r.productId).length > 1 && <small className="t-good">Best average price</small>}</span> },
          { label: 'Deliveries', align: 'right', render: (r) => r.purchases },
          { label: 'Total quantity', align: 'right', render: (r) => `${fmt(r.qty)} ${r.unit}` },
          { label: 'Last price', align: 'right', render: (r) => m(r.lastRate) },
          { label: 'Average', align: 'right', render: (r) => m(r.avgRate) },
          { label: 'Last delivery', align: 'right', render: (r) => fdate(r.lastDate) },
        ]} />
    </Sheet>
  )
}
SupplyOverviewSheet.readOnlySafe = true
