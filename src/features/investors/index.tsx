import { useState } from 'react'
import { fdate, fmonth, fmt, investorRows, profitPool, tk, type ProfitDistribution } from '@shared/domain'
import { PageHead } from '@/components/PageHead'
import { PhoneLink } from '@/components/PhoneLink'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, Card, DataTable, Pill, Segmented, Stat, useConfirm, useSheets, useToast } from '@/ui'
import { DistributeSheet } from './sheets/DistributeSheet'
import { InvestorMoneySheet } from './sheets/InvestorMoneySheet'
import { InvestorSheet } from './sheets/InvestorSheet'
import { InvestorStatementSheet } from './sheets/InvestorStatementSheet'

type Show = 'active' | 'exited' | 'all'

/** #/investors: who put money in, what they own, and profit shared with them. */
export default function InvestorsPage() {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const [show, setShow] = useState<Show>('active')
  const pool = profitPool(db)
  const all = investorRows(db)
  const rows = all.filter((r) => show === 'all' || r.investor.status === show)
  const dists = [...(db.distributions || [])].reverse()
  const canEdit = !accessGuard.readonly
  const last12 = pool.months.slice(-12)

  const undo = async (d: ProfitDistribution) => {
    if (await confirm({ title: `Undo ${d.id}?`, message: `Takes back the ${tk(d.amount)} shared for ${d.period}.`, confirmLabel: 'Undo', destructive: true })) {
      if (!act('undoDistribution', d.id)) toast(`${d.id} taken back`)
    }
  }

  return (
    <>
      <PageHead title="Investors" sub="Capital put into the business, each investor’s share, and profit shared out."
        actions={
          <>
            <Button variant="secondary" icon="pie" disabled={!all.some((r) => r.ownership > 0)} onClick={() => sheets.open(DistributeSheet)}>Distribute profit</Button>
            <Button icon="plus" onClick={() => sheets.open(InvestorSheet)}>Add investor</Button>
          </>
        } />
      <div className="stats">
        <Stat icon="trend" label="Total profit (all-time)" value={tk(pool.total)} tone={pool.total < 0 ? 'warn' : undefined} sub={pool.months.length ? `Since ${fmonth(pool.months[0].month)}` : undefined} />
        <Stat icon="arrowOut" label="Distributed to investors" value={tk(pool.distributed)} sub={`${dists.length} distribution${dists.length === 1 ? '' : 's'}`} />
        <Stat icon="pie" label="Undistributed profit pool" value={tk(pool.pool)} tone={pool.pool > 0 ? 'good' : pool.pool < 0 ? 'warn' : undefined} />
        <Stat icon="wallet" label="Total invested capital" value={tk(pool.capital)} sub={`${all.filter((r) => r.investor.status === 'active').length} active investor${all.length === 1 ? '' : 's'}`} />
      </div>

      <Card icon="users" title="Investor list" action={<Segmented<Show> label="Show" value={show} onChange={setShow} options={[{ value: 'active', label: 'Active' }, { value: 'exited', label: 'Left' }, { value: 'all', label: 'All' }]} />}>
        <DataTable pageSize={20} rows={rows} rowKey={(r) => r.investor.id} onRow={(r) => sheets.open(InvestorStatementSheet, { investorId: r.investor.id })}
          empty={show === 'exited' ? 'No investor has left.' : 'No investors added yet.'}
          columns={[
            { label: 'Name', primary: true, render: (r) => r.investor.name },
            { label: 'Mobile', render: (r) => <PhoneLink phone={r.investor.phone} label={r.investor.name} /> },
            { label: 'Capital balance', align: 'right', render: (r) => <b className="nowrap">{tk(r.capital)}</b> },
            { label: 'Ownership %', align: 'right', render: (r) => <span className="own-bar">{fmt(r.ownership * 100)}%<i><b style={{ width: `${Math.round(r.ownership * 100)}%` }} /></i></span> },
            { label: 'Profit available', align: 'right', render: (r) => <span className={`nowrap ${r.available > 0 ? 't-good' : 't-muted'}`}>{tk(r.available)}</span> },
            { label: 'Status', render: (r) => <Pill tone={r.investor.status === 'active' ? 'good' : 'neutral'}>{r.investor.status === 'active' ? 'Active' : 'Left'}</Pill> },
            { label: '', align: 'right', render: (r) => (canEdit && r.investor.status === 'active' ? (
              <span className="btn-row tight-row" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="secondary" onClick={() => sheets.open(InvestorMoneySheet, { investorId: r.investor.id, kind: 'invest' })}>Add capital</Button>
                {r.available > 0 && <Button size="sm" onClick={() => sheets.open(InvestorMoneySheet, { investorId: r.investor.id, kind: 'payout' })}>Pay profit</Button>}
              </span>
            ) : '') },
          ]} />
      </Card>

      <div className="grid2">
        <Card icon="chart" title="Net profit by month" sub="The profit pool is the sum of every month’s profit and loss">
          <DataTable pageSize={6} rows={[...last12].reverse()} rowKey={(m) => m.month} empty="No months with sales or expenses yet."
            columns={[
              { label: 'Month', primary: true, render: (m) => fmonth(m.month) },
              { label: 'Net profit', align: 'right', render: (m) => <b className={m.net < 0 ? 't-warn' : undefined}>{m.net < 0 ? `Loss ${tk(-m.net)}` : tk(m.net)}</b> },
            ]} />
        </Card>
        <Card icon="pie" title="Profit distributions">
          <DataTable rows={dists} rowKey={(d) => d.id} pageSize={10} empty="No profit shared out yet."
            columns={[
              { label: 'Distribution', primary: true, render: (d) => <span className="two-line"><b>{d.id} · {d.period}</b><small className="t-muted">{fdate(d.date)}{d.note ? ` · ${d.note}` : ''}</small></span> },
              { label: 'Amount', align: 'right', render: (d) => <b>{tk(d.amount)}</b> },
              { label: '', align: 'right', render: (d) => (canEdit ? <button type="button" className="link" onClick={() => void undo(d)}>Undo</button> : '') },
            ]} />
        </Card>
      </div>
    </>
  )
}
