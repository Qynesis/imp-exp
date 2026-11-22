import { isValidElement, type ReactNode } from 'react'
import { saveBlob, xlsxBlob } from './xlsx'

/**
 * The plain text a table cell shows, worked out from what it renders. Small display components
 * (pills, hidden prices) are asked for their output; ones that need the app around them fall back
 * to their text props.
 */
export function nodeText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  if (isValidElement(node)) {
    const props = (node.props || {}) as Record<string, unknown>
    if (typeof node.type === 'function') {
      try {
        return nodeText((node.type as (p: unknown) => ReactNode)(props))
      } catch {
        return nodeText((props.children ?? props.label ?? props.phone ?? props.value ?? '') as ReactNode)
      }
    }
    if (node.type === 'input' || node.type === 'button' || node.type === 'select') return ''
    // two-line cells: keep the parts apart
    const kids = props.children as ReactNode
    return Array.isArray(kids) ? kids.map(nodeText).filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim() : nodeText(kids)
  }
  return ''
}

/** "Tk 1,800", "-250.5", "৳ 12" become numbers in Excel; everything else stays text. */
export function asNumber(text: string): string | number {
  const m = /^(?:Tk|৳|\$|€|£|¥|₹|USD|BDT)?\s?(-?[\d,]*\d(?:\.\d+)?)$/.exec(text.trim())
  if (!m) return text
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) && m[1].replace(/[,.-]/g, '').length < 16 ? n : text
}

const stamp = () => new Date().toISOString().slice(0, 10)
const fileBase = (name: string) => (name || 'table').toLowerCase().replace(/[^a-z0-9ঀ-৿]+/g, '-').replace(/^-|-$/g, '') || 'table'

/** Save rows as CSV (UTF-8 with BOM, so Excel shows Bangla) or as a real Excel file. */
export function exportTable(kind: 'csv' | 'xlsx', name: string, header: string[], rows: (string | number)[][]) {
  // a name that already says its date or month does not get today's date as well
  const base = /\d{4}-\d{2}/.test(name) ? fileBase(name) : `${fileBase(name)}-${stamp()}`
  if (kind === 'xlsx') return saveBlob(xlsxBlob(name, header, rows), base + '.xlsx')
  const cell = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const text = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
  saveBlob(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }), base + '.csv')
}
