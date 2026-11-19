import { byId, fdate, INVESTOR_TXN, investorRows, investorStatement, fmt, tk, type Db } from '@shared/domain'
import { PhoneLink } from '@/components/PhoneLink'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, DataTable, Pill, Sheet, useConfirm, usePrint, useSheets, useToast, type SheetComponent } from '@/ui'
import { InvestorMoneySheet } from './InvestorMoneySheet'
import { InvestorSheet } from './InvestorSheet'

/** One investor: capital, ownership, profit waiting, and every entry. */
export const InvestorStatementSheet: SheetComponent<{ investorId: string }> = ({ investorId }) => {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const print = usePrint()
  const row = investorRows(db).find((r) => r.investor.id === investorId)
  if (!row) return null
  const inv = row.investor
  const lines = investorStatement(db, investorId)
  const canEdit = !accessGuard.readonly
  const remove = async (id: string) => {
    if (await confirm({ title: 'Remove this entry?', confirmLabel: 'Remove', destructive: true })) {
      if (!act('removeInvestorTxn', id)) toast('Entry removed')
    }
  }
  const setStatus = () => {
    if (!act('setInvestorStatus', { id: inv.id, status: inv.status === 'active' ? 'exited' : 'active' })) toast(inv.status === 'active' ? `${inv.name} marked as left` : `${inv.name} is active again`)
  }
  return (
    <Sheet title={inv.name} crumb="Investor statement" wide
      footer={
        <>
          <Button variant="secondary" icon="print" onClick={() => print(<StatementDoc db={db} investorId={investorId} />)}>Print statement</Button>
          {canEdit && <Button variant="secondary" icon="edit" onClick={() => sheets.open(InvestorSheet, { investorId })}>Edit</Button>}
          {canEdit && <Button variant="secondary" onClick={setStatus}>{inv.status === 'active' ? 'Mark as left' : 'Make active'}</Button>}
          {canEdit && inv.status === 'active' && <Button icon="wallet" onClick={() => sheets.open(InvestorMoneySheet, { investorId, kind: row.available > 0 ? 'payout' : 'invest' })}>{row.available > 0 ? 'Pay profit' : 'Add capital'}</Button>}
        </>
      }>
      <p className="t-muted tight"><PhoneLink phone={inv.phone} label={inv.name} />{inv.address ? ` · ${inv.address}` : ''} · joined {fdate(inv.joined)} · <Pill tone={inv.status === 'active' ? 'good' : 'neutral'}>{inv.status === 'active' ? 'Active' : 'Left'}</Pill></p>
      <div className="mini-stats">
        <div><span>Capital balance</span><b>{tk(row.capital)}</b></div>
        <div><span>Ownership</span><b>{fmt(row.ownership * 100)}%</b></div>
        <div><span>Profit shared so far</span><b>{tk(row.shared)}</b></div>
        <div><span>Profit available</span><b className={row.available > 0 ? 't-good' : undefined}>{tk(row.available)}</b><small className="t-muted">{tk(row.taken)} paid or reinvested</small></div>
      </div>
      <DataTable rows={[...lines].reverse()} rowKey={(l) => l.id} pageSize={15} empty="No entries yet."
        columns={[
          { label: 'Date', primary: true, render: (l) => fdate(l.date) },
          { label: 'Entry', render: (l) => <span className="two-line"><span>{INVESTOR_TXN[l.kind]}</span><small className="t-muted">{[l.method, l.note].filter(Boolean).join(' · ')}</small></span> },
          { label: 'Amount', align: 'right', render: (l) => <b className={l.kind === 'withdraw' || l.kind === 'payout' ? 't-warn' : 't-good'}>{tk(l.amount)}</b> },
          { label: 'Capital after', align: 'right', render: (l) => tk(l.capital) },
          { label: 'Profit waiting', align: 'right', render: (l) => tk(l.available) },
          { label: '', align: 'right', render: (l) => (canEdit && l.kind !== 'share' ? <button type="button" className="icon-btn" aria-label="Remove entry" onClick={() => void remove(l.id)}>×</button> : '') },
        ]} />
      {inv.note && <p className="t-muted">{inv.note}</p>}
    </Sheet>
  )
}
InvestorStatementSheet.readOnlySafe = true

function StatementDoc({ db, investorId }: { db: Db; investorId: string }) {
  const co = db.company
  const row = investorRows(db).find((r) => r.investor.id === investorId)
  const inv = byId(db.investors || [], investorId)
  if (!row || !inv) return null
  return (
    <div className="invoice">
      <div className="inv-top">
        <div className="inv-brand">
          {co.logo && <img className="inv-logo" src={co.logo} alt="" />}
          <div><div className="inv-co">{co.name || 'Your company'}</div><div className="inv-muted">{[co.address, co.phone].filter(Boolean).join(' · ')}</div></div>
        </div>
        <div className="inv-right"><div className="inv-title">Investor statement</div><div className="inv-muted">{inv.name}{inv.phone ? ` · ${inv.phone}` : ''}</div></div>
      </div>
      <table className="inv-lines">
        <thead><tr><th>Date</th><th>Entry</th><th className="r">Amount</th><th className="r">Capital</th><th className="r">Profit waiting</th></tr></thead>
        <tbody>
          {investorStatement(db, investorId).map((l) => (
            <tr key={l.id}><td>{fdate(l.date)}</td><td>{INVESTOR_TXN[l.kind]}{l.note ? ` · ${l.note}` : ''}</td><td className="r">{fmt(l.amount)}</td><td className="r">{fmt(l.capital)}</td><td className="r">{fmt(l.available)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="inv-note">Capital Tk {fmt(row.capital)} · ownership {fmt(row.ownership * 100)}% · profit shared Tk {fmt(row.shared)} · paid or reinvested Tk {fmt(row.taken)} · waiting Tk {fmt(row.available)}</p>
      <div className="inv-sign"><span>Investor</span><span>For {co.name || 'the company'}</span></div>
    </div>
  )
}
