import { useState } from 'react'
import { Pager } from './Pager'

/**
 * Splits a list into pages. Goes back to the first page when the list changes length (a new
 * filter or search), and never points past the last page.
 */
export function usePaged<R>(rows: readonly R[], size: number) {
  const [page, setPage] = useState(0)
  const [seen, setSeen] = useState(rows.length)
  if (seen !== rows.length) {
    setSeen(rows.length)
    setPage(0)
  }
  // no page size (or Infinity) means one page with everything; 0 × Infinity would be NaN
  if (!Number.isFinite(size) || size <= 0) return { rows, pager: null }
  const pages = Math.max(Math.ceil(rows.length / size), 1)
  const current = Math.min(page, pages - 1)
  return {
    rows: rows.slice(current * size, current * size + size),
    pager: rows.length > size ? <Pager page={current} pages={pages} total={rows.length} size={size} onPage={setPage} /> : null,
  }
}
