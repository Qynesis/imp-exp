import type { ReactNode } from 'react'
import { accountBalances, accountOf, cashForDay, investorRows, invTotal, payables, receivables, sum, tk, todayISO, totalsBetween } from '@shared/domain'
import { useAccess } from '@/app/useAccess'
import { FEATURES } from '@/app/features'
import { go, href } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { Button, Card, cls, DataTable, IconBadge, type IconName } from '@/ui'

/** One line of a glance card: label left, figure right, coloured when it matters. */
const Line = ({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'warn' }) => (
  <div className="kv"><span>{label}</span><b className={cls(tone && value !== 0 && `t-${tone}`)}>{tk(value)}</b></div>
)

function Glance({ icon, title, to, children }: { icon: IconName; title: string; to?: string; children: ReactNode }) {
  const head = <><IconBadge name={icon} size={18} /><h2>{title}</h2></>
  return (
    <section className="card glance">
      {to ? <a className="glance-head" href={to}>{head}<span aria-hidden="true">→</span></a> : <div className="glance-head">{head}</div>}
      <div className="kv-list">{children}</div>
    </section>
  )
}

/** Welcome bar with quick links, as the top of the dashboard. */
export function WelcomeBar({ sub, children }: { sub?: string; children?: ReactNode }) {
  const { db } = useBooks()
  const { allowed, level } = useAccess()
  return (
    <div className="welcome-bar">
      <div><h1>Welcome to {db.company.name || 'your company'}</h1>{sub && <p>{sub}</p>}</div>
      <div className="btn-row tight-row">
        {children}
        <select className="in quick-link" value="" aria-label="Quick link" onChange={(e) => e.target.value && go(e.target.value)}>
          <option value="">Quick link</option>
          {FEATURES.filter((f) => f.id !== 'dashboard' && allowed.some((a) => a.id === f.id)).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        {level('sell') === 'edit' && <Button icon="cart" className="order-btn" onClick={() => go('sell')}>Order</Button>}
      </div>
    </div>
  )
}

/** Today in numbers: stock and profit, sales, cash, balances, and every taka in and out. */
export function TodayPanel() {
  const { db } = useBooks()
  const { level } = useAccess()
  const today = todayISO()
  const can = (p: Parameters<typeof level>[0]) => level(p) !== 'none'
  const t = totalsBetween(db, today, today)
  const bills = db.invoices.filter((i) => i.status === 'final' && !i.sample && i.date === today)
  const cashSales = sum(bills, (i) => Math.min(i.received || 0, invTotal(i)))
  const stockValue = sum(db.products.filter((p) => !p.archived && p.stock > 0), (p) => p.stock * (p.cost || 0))
  const cash = cashForDay(db, today)
  const accounts = accountBalances(db, today)
  const pay = payables(db)
  const rec = receivables(db)
  const due = (k: string) => sum(pay.rows.filter((r) => r.kind === k), (r) => r.due)
  const owedInvestors = sum(investorRows(db), (r) => Math.max(r.available, 0))
  const ins = cash.entries.filter((e) => e.in > 0)
  const outs = cash.entries.filter((e) => e.out > 0)
  const link = (p: Parameters<typeof level>[0]) => (can(p) ? href(p) : undefined)
  const money = can('cashbook')

  return (
    <>
      <div className="glance-grid">
        <Glance icon="box" title="Stock and profit" to={link('reports')}>
          <Line label="Stock value" value={stockValue} />
          <Line label="Today’s sales" value={t.sales} />
          <Line label="Today’s cost of goods" value={t.cost} />
          <Line label="Today’s profit" value={t.profit} tone={t.profit < 0 ? 'warn' : 'good'} />
        </Glance>
        <Glance icon="cart" title="Sales today" to={link('sales-analytics') || link('sell')}>
          <Line label="Total sales" value={t.sales} />
          <Line label="Cash sales" value={cashSales} tone="good" />
          <Line label="Due sales" value={t.sales - cashSales} tone="warn" />
          <div className="kv"><span>Bills</span><b>{t.invoices}</b></div>
        </Glance>
        {money && (
          <Glance icon="wallet" title="Cash today" to={link('cashbook')}>
            <Line label="Money received" value={cash.in} tone="good" />
            <Line label="Money paid" value={cash.out} tone="warn" />
            <Line label="Net today" value={cash.in - cash.out} tone={cash.in - cash.out < 0 ? 'warn' : 'good'} />
            <Line label="Cash, bank and wallets" value={cash.closing} tone={cash.closing < 0 ? 'warn' : undefined} />
          </Glance>
        )}
        {money && (
          <Glance icon="grid" title="Overall balance" to={link('cashbook')}>
            <Line label="Dealer dues (to collect)" value={rec.total} tone="good" />
            <Line label="Supplier dues (to pay)" value={due('supplier')} tone="warn" />
            <Line label="Factory dues (to pay)" value={due('factory')} tone="warn" />
            {can('investors') ? <Line label="Profit owed to investors" value={owedInvestors} tone="warn" /> : <Line label="Transport hire due" value={due('transport')} tone="warn" />}
          </Glance>
        )}
      </div>

      {money && (
        <div className="grid2">
          <Card icon="wallet" title="Balance" sub="Money in each account now" action={<a className="link" href={href('cashbook')}>Cashbook</a>}>
            <DataTable rows={[...accounts, { account: 'Total' as const, balance: sum(accounts, (a) => a.balance), in: 0, out: 0 }]} rowKey={(a) => a.account}
              rowClass={(a) => (a.account === ('Total' as string) ? 'total-row' : undefined)}
              columns={[
                { label: 'Account', primary: true, render: (a) => (a.account === 'Cash' ? 'Cash in hand' : a.account) },
                { label: 'Balance', align: 'right', render: (a) => <b className={cls('nowrap', a.balance < 0 && 't-warn')}>{tk(a.balance)}</b> },
              ]} />
          </Card>
          <div className="stack">
            <CashList title="Cash received today" icon="arrowIn" rows={ins.map((e) => ({ ...e, amount: e.in }))} tone="good" />
            <CashList title="Cash paid today" icon="arrowOut" rows={outs.map((e) => ({ ...e, amount: e.out }))} tone="warn" />
          </div>
        </div>
      )}
    </>
  )
}

function CashList({ title, icon, rows, tone }: { title: string; icon: IconName; rows: { details: string; head: string; method: string; amount: number; ts: number }[]; tone: 'good' | 'warn' }) {
  return (
    <Card icon={icon} title={title} action={<b className={`t-${tone}`}>{tk(sum(rows, (r) => r.amount))}</b>}>
      <DataTable pageSize={5} rows={rows} rowKey={(r, i) => `${r.ts}-${i}`} empty="Nothing yet today."
        columns={[
          { label: 'Details', primary: true, render: (r) => <span className="two-line"><span>{r.details}</span><small className="t-muted">{r.head}</small></span> },
          { label: 'Account', render: (r) => <span className="t-muted">{accountOf(r.method)}</span> },
          { label: 'Amount', align: 'right', render: (r) => <b className="nowrap">{tk(r.amount)}</b> },
        ]} />
    </Card>
  )
}
