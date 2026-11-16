import { cls } from './cls'
import { Icon } from './Icon'

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

export function Pager({ page, pages, total, size, onPage }: { page: number; pages: number; total: number; size: number; onPage: (p: number) => void }) {
  const from = page * size + 1
  const to = Math.min(total, from + size - 1)
  return (
    <nav className="pager" aria-label="Pages">
      <span className="pager-info">{from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')} <span>of</span> {total.toLocaleString('en-IN')}</span>
      <div className="pager-btns">
        <button type="button" className="icon-btn bordered" aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)}><Icon name="back" size={16} /></button>
        {pageList(page, pages).map((p, i) => p === null
          ? <span key={'gap' + i} className="pager-gap">…</span>
          : <button key={p} type="button" className={cls('pager-num', p === page && 'on')} aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>{p + 1}</button>)}
        <button type="button" className="icon-btn bordered" aria-label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}><Icon name="chevron" size={16} /></button>
      </div>
    </nav>
  )
}
