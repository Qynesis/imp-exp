import { fdate, fmt, siteStock, sourceStock } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { DataTable } from '@/ui'

/** One source's items: how much came from them into each warehouse, and how much we hold now. */
export function SourceStockTable({ kind, id, name }: { kind: 'supplier' | 'factory' | 'import'; id: string; name: string }) {
  const { db } = useBooks()
  const st = siteStock(db)
  const rows = sourceStock(db, kind, id)
  type R = (typeof rows)[number]
  return (
    <DataTable rows={rows} rowKey={(r) => r.productId} pageSize={10} exportName={`stock-from-${name.toLowerCase().replace(/\W+/g, '-')}`} empty="No goods from them yet."
      columns={[
        { label: 'Item', primary: true, render: (r) => <span className="two-line"><b>{r.name}</b><small className="t-muted">{r.code}{r.lastDate ? ` · last in ${fdate(r.lastDate)}` : ''}</small></span>, exportValue: (r) => r.name },
        { label: 'Received from them', align: 'right', render: (r) => <span className="two-line"><b>{fmt(r.received)} {r.unit}</b><small className="t-muted">{r.deliveries} deliver{r.deliveries === 1 ? 'y' : 'ies'}</small></span>, exportValue: (r) => r.received },
        ...(st.sites.length > 1 ? st.sites.map((w) => ({ label: `Into ${w.code || w.name}`, align: 'right' as const, render: (r: R) => { const v = r.receivedBySite[w.id] || 0; return <span className={v ? undefined : 't-muted'}>{fmt(v)}</span> }, exportValue: (r: R) => r.receivedBySite[w.id] || 0 })) : []),
        ...st.sites.map((w) => ({ label: `Now at ${w.code || w.name}`, align: 'right' as const, render: (r: R) => { const v = r.stockBySite[w.id] || 0; return <span className={v < 0 ? 't-warn' : v ? 'strong' : 't-muted'}>{fmt(v)}</span> }, exportValue: (r: R) => r.stockBySite[w.id] || 0 })),
        { label: 'In stock now', align: 'right', render: (r) => <b className={r.lowAt > 0 && r.stock <= r.lowAt ? 't-warn' : undefined}>{fmt(r.stock)} {r.unit}</b>, exportValue: (r) => r.stock },
      ]} />
  )
}
