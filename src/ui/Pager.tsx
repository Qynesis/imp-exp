import { useState } from 'react'
import { cls } from './cls'
import { Icon } from './Icon'

export type ExportKind = 'csv' | 'xlsx'
const SIZES = [10, 25, 50, 100]

/** Page numbers to show: always the first and last, the current page and its neighbours, gaps as null. */
function pageList(page: number, pages: number): (number | null)[] {
  const want = new Set([0, pages - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < pages))
  const sorted = [...want].sort((a, b) => a - b)
  const out: (number | null)[] = []
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push(null)
    out.push(p)
  })
  return out
}

/** Under a table: which rows are shown, rows per page, page numbers, and export to CSV or Excel. */
export function Pager({ page, pages, total, size, onPage, onSize, onExport }: {
  page: number; pages: number; total: number; size: number; onPage: (p: number) => void; onSize?: (n: number) => void; onExport?: (k: ExportKind) => void
}) {
  const [busy, setBusy] = useState<ExportKind | null>(null)
  const from = total ? page * size + 1 : 0
  const to = Math.min(total, page * size + size)
  const run = (k: ExportKind) => {
    if (!onExport) return
    setBusy(k)
    // let the button show it is working before a big file is built
    setTimeout(() => { try { onExport(k) } finally { setBusy(null) } }, 30)
  }
  return (
    <nav className="pager" aria-label="Pages">
      <span className="pager-info">{from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')} <span>of</span> {total.toLocaleString('en-IN')}</span>
      {onSize && (
        <label className="pager-size">
          <span>Rows</span>
          <select className="in" value={size} onChange={(e) => onSize(Number(e.target.value))} aria-label="Rows per page">
            {[...new Set([...SIZES, size])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
      {pages > 1 && (
        <div className="pager-btns">
          <button type="button" className="icon-btn bordered" aria-label="First page" disabled={page === 0} onClick={() => onPage(0)}><Icon name="back" size={14} /><Icon name="back" size={14} /></button>
          <button type="button" className="icon-btn bordered" aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)}><Icon name="back" size={16} /></button>
          {pageList(page, pages).map((p, i) => p === null
            ? <span key={'gap' + i} className="pager-gap">…</span>
            : <button key={p} type="button" className={cls('pager-num', p === page && 'on')} aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>{p + 1}</button>)}
          <button type="button" className="icon-btn bordered" aria-label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}><Icon name="chevron" size={16} /></button>
          <button type="button" className="icon-btn bordered" aria-label="Last page" disabled={page >= pages - 1} onClick={() => onPage(pages - 1)}><Icon name="chevron" size={14} /><Icon name="chevron" size={14} /></button>
        </div>
      )}
      {onExport && (
        <div className="pager-export" role="group" aria-label={`Export all ${total} rows`}>
          <Icon name="download" size={15} />
          <button type="button" disabled={!!busy} onClick={() => run('xlsx')} title={`All ${total} rows as an Excel file`}>{busy === 'xlsx' ? 'Saving…' : 'Excel'}</button>
          <button type="button" disabled={!!busy} onClick={() => run('csv')} title={`All ${total} rows as a CSV file`}>{busy === 'csv' ? 'Saving…' : 'CSV'}</button>
        </div>
      )}
    </nav>
  )
}
