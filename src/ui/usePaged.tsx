import { useState } from 'react'
import { Pager, type ExportKind } from './Pager'

const SIZE_KEY = 'table-rows-per-page'
const readSize = (): number | null => {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY))
    return n > 0 ? n : null
  } catch {
    return null
  }
}

/**
 * Splits a list into pages (offset paging: page numbers over rows already loaded). Goes back to the
 * first page when the list changes length (a new filter or search), and never points past the last
 * page. Rows per page is the viewer's choice, remembered in this browser.
 */
export function usePaged<R>(rows: readonly R[], size: number, onExport?: (kind: ExportKind) => void) {
  const [page, setPage] = useState(0)
  const [seen, setSeen] = useState(rows.length)
  // a table asking for a small page (a short list in a sheet) keeps it; others follow the viewer's choice
  const [chosen, setChosen] = useState<number | null>(() => (size >= 25 && Number.isFinite(size) ? readSize() : null))
  if (seen !== rows.length) {
    setSeen(rows.length)
    setPage(0)
  }
  const per = chosen || size
  const choose = (n: number) => {
    setChosen(n)
    setPage(0)
    try { localStorage.setItem(SIZE_KEY, String(n)) } catch { /* private window: lasts this visit */ }
  }
  // no page size (or Infinity) means one page with everything; 0 × Infinity would be NaN
  if (!Number.isFinite(per) || per <= 0) return { rows, pager: onExport ? <Pager page={0} pages={1} total={rows.length} size={rows.length} onPage={setPage} onExport={onExport} /> : null }
  const pages = Math.max(Math.ceil(rows.length / per), 1)
  const current = Math.min(page, pages - 1)
  const show = rows.length > Math.min(per, 10) || !!onExport
  return {
    rows: rows.slice(current * per, current * per + per),
    pager: show && rows.length ? <Pager page={current} pages={pages} total={rows.length} size={per} onPage={setPage} onSize={rows.length > 10 ? choose : undefined} onExport={onExport} /> : null,
  }
}
