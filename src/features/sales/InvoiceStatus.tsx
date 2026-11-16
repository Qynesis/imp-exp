import { tk, type Invoice } from '@shared/domain'
import { Pill } from '@/ui'

export const InvoiceStatus = ({ inv, due }: { inv: Pick<Invoice, 'status'>; due: number }) =>
  inv.status === 'draft' ? <Pill tone="info">Draft</Pill> : due > 0 ? <Pill tone="warn">Due {tk(due)}</Pill> : <Pill tone="good">Paid</Pill>
