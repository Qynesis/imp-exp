import type { Key, ReactNode } from 'react'
import { cls } from './cls'
import { Empty } from './Card'
import { usePaged } from './usePaged'

export interface Column<R> {
  label: string
  render: (row: R) => ReactNode
  align?: 'right'
  /** Shown as the heading of the row on phones. */
  primary?: boolean
}

interface Props<R> {
  columns: Column<R>[]
  rows: readonly R[]
  onRow?: (row: R) => void
  empty?: ReactNode
  rowKey?: (row: R, index: number) => Key
  rowClass?: (row: R) => string | false | null | undefined
  /** Rows per page; the table pages itself when there are more. */
  pageSize?: number
}

const defaultKey = (row: unknown, i: number): Key => (row as { id?: Key }).id ?? i

/** Table on wide screens, stacked label/value rows on phones (no sideways scrolling). */
export function DataTable<R>({ columns, rows: all, onRow, empty = 'Nothing here yet.', rowKey = defaultKey, rowClass, pageSize = Infinity }: Props<R>) {
  const { rows, pager } = usePaged(all, pageSize)
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
