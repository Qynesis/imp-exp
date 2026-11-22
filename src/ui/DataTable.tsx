import type { Key, ReactNode } from 'react'
import { cls } from './cls'
import { Empty } from './Card'
import { asNumber, exportTable, nodeText } from './tableExport'
import { usePaged } from './usePaged'

export interface Column<R> {
  label: string
  render: (row: R) => ReactNode
  align?: 'right'
  /** Shown as the heading of the row on phones. */
  primary?: boolean
  /** The value written to CSV and Excel, when the screen text is not right for a file. */
  exportValue?: (row: R) => string | number
}

interface Props<R> {
  columns: Column<R>[]
  rows: readonly R[]
  onRow?: (row: R) => void
  empty?: ReactNode
  rowKey?: (row: R, index: number) => Key
  rowClass?: (row: R) => string | false | null | undefined
  /** Rows per page to start with (25 unless set); people can change it under the table. */
  pageSize?: number
  /** File name for CSV and Excel export; set to false to hide export. */
  exportName?: string | false
}

const defaultKey = (row: unknown, i: number): Key => (row as { id?: Key }).id ?? i

/** A sensible file name when a table does not give one: the screen, e.g. "employees-leave". */
const screenName = () => (typeof location !== 'undefined' ? location.hash.replace(/^#\/?/, '').replace(/\//g, '-') : '') || 'table'

/**
 * Table on wide screens, stacked label/value rows on phones (no sideways scrolling). Pages itself
 * (page numbers, rows per page) and exports every matching row, not just the page, to CSV or Excel.
 */
export function DataTable<R>({ columns, rows: all, onRow, empty = 'Nothing here yet.', rowKey = defaultKey, rowClass, pageSize = 25, exportName }: Props<R>) {
  const { rows, pager } = usePaged(all, pageSize, exportName !== false && all.length >= 5 ? (kind) => {
    // columns without a heading hold buttons: nothing to export
    const cols = columns.filter((c) => c.label)
    const data = all.map((r) => cols.map((c) => (c.exportValue ? c.exportValue(r) : asNumber(nodeText(c.render(r))))))
    exportTable(kind, exportName || screenName(), cols.map((c) => c.label), data)
  } : undefined)
  if (!all.length) return <Empty>{empty}</Empty>
  return (
    <>
    <table className="dt">
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={c.label || i} className={c.align === 'right' ? 'r' : undefined}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={rowKey(r, i)}
            className={cls(onRow && 'click', rowClass?.(r))}
            onClick={onRow ? () => onRow(r) : undefined}
            tabIndex={onRow ? 0 : undefined}
            onKeyDown={onRow ? (e) => e.key === 'Enter' && onRow(r) : undefined}
          >
            {columns.map((c, ci) => {
              const v = c.render(r)
              return (
                <td key={c.label || ci} data-label={c.label} className={cls(c.align === 'right' && 'r', c.primary && 'primary', (v === '' || v == null || v === false) && 'empty')}>
                  {v}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
    {pager}
    </>
  )
}
