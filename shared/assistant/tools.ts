/**
 * Read-only questions the assistant can ask the books. The same tools serve the AI model (on the
 * server) and the built-in answerer (offline). Each tool belongs to a screen, and a person only gets
 * the tools for screens their role can open, so the assistant never tells anyone more than the app would.
 */
import {
  accountBalances, assetSummary, byId, canSee, cashForDay, dealerLedger, fmonth, foCalc, investorRows, invoiceDelivery, invTotal, levelFor, notifications,
  payables, pendingDeliveries, profitAndLoss, profitPool, receivables, reservedQty, saleFacts, thisMonth, todayISO, totalsBetween, tradeOverview, type Db, type PageId,
} from '../domain'

export interface ToolDef {
  name: string
  description: string
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties: false }
  /** Any of these screens gives access. */
  pages: PageId[]
  run: (db: Db, input: Record<string, unknown>, can: (page: PageId) => boolean) => unknown
}

const r0 = (n: number) => Math.round(n)
const r2 = (n: number) => Math.round(n * 100) / 100
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const matches = (q: string, ...hay: (string | undefined)[]) => !q || hay.some((h) => (h || '').toLowerCase().includes(q.toLowerCase()))
/** Find one record by id or (part of) its name. */
function pick<T extends { id: string; name: string }>(list: T[], q: string): T | undefined {
  if (!q) return undefined
  const l = q.toLowerCase()
  return list.find((x) => x.id.toLowerCase() === l) || list.find((x) => x.name.toLowerCase() === l) || list.find((x) => x.name.toLowerCase().includes(l))
}

export const TOOLS: ToolDef[] = [
  {
    name: 'business_snapshot',
    description: 'Today at a glance: sales today and this month, cash in and out today, money in each account, dues to collect and to pay, low-stock count, bills waiting for delivery, and the top alerts. Use first for general questions like "how is business today".',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    pages: ['dashboard'],
    run: (db) => {
      const t = todayISO()
      const today = totalsBetween(db, t, t)
      const month = totalsBetween(db, t.slice(0, 7) + '-01', t)
      const cash = cashForDay(db, t)
      return {
        date: t, company: db.company.name,
        salesToday: { amount: r0(today.sales), bills: today.invoices, profit: r0(today.profit), collected: r0(today.collected) },
        salesThisMonth: { amount: r0(month.sales), bills: month.invoices, profit: r0(month.profit), target: db.company.salesTarget || null },
        cashToday: { opening: r0(cash.opening), in: r0(cash.in), out: r0(cash.out), closing: r0(cash.closing) },
        accounts: accountBalances(db, t).map((a) => ({ account: a.account, balance: r0(a.balance) })),
        dealerDuesToCollect: r0(receivables(db).total), weOwe: r0(payables(db).total),
        lowStockProducts: db.products.filter((p) => !p.archived && p.lowAt > 0 && p.stock <= p.lowAt).length,
        billsWaitingDelivery: pendingDeliveries(db).filter((x) => !x.inv.sample).length,
        topAlerts: notifications(db).slice(0, 6).map((n) => n.title),
      }
    },
  },
  {
    name: 'find_dealers',
    description: 'List dealers (customers) with what each owes, overdue status, credit limit, area and phone. Optional search by name, area or phone; optional onlyOwing.',
    input_schema: { type: 'object', properties: { query: { type: 'string' }, onlyOwing: { type: 'boolean' } }, additionalProperties: false },
    pages: ['dealers', 'sell', 'cashbook'],
    run: (db, i) => db.dealers.filter((d) => !d.sample && matches(str(i.query), d.name, d.area, d.phone, d.owner))
      .map((d) => ({ d, l: dealerLedger(db, d.id) })).filter((x) => !i.onlyOwing || x.l.due > 0)
      .sort((a, b) => b.l.due - a.l.due).slice(0, 25)
      .map(({ d, l }) => ({ id: d.id, name: d.name, area: d.area, phone: d.phone, terms: d.terms, creditLimit: d.limit, due: r0(l.due), status: l.statusText, overdue: l.overdue, unpaidBills: l.open.length })),
  },
  {
    name: 'dealer_statement',
    description: 'One dealer in detail: unpaid bills with dates and due dates, recent payments, total due. Give the dealer name or id.',
    input_schema: { type: 'object', properties: { dealer: { type: 'string' } }, required: ['dealer'], additionalProperties: false },
    pages: ['dealers', 'sell', 'cashbook'],
    run: (db, i) => {
      const d = pick(db.dealers.filter((x) => !x.sample), str(i.dealer))
      if (!d) return { error: `No dealer matches "${str(i.dealer)}".` }
      const l = dealerLedger(db, d.id)
      return {
        name: d.name, phone: d.phone, area: d.area, terms: d.terms, creditDays: d.days, creditLimit: d.limit, due: r0(l.due), status: l.statusText,
        unpaidBills: l.open.map((b) => ({ bill: b.label, date: b.date, dueDate: b.dueDate, total: r0(b.total), unpaid: r0(b.out) })),
        recentPayments: l.payments.slice(0, 8).map((p) => ({ date: p.date, amount: r0(p.amount), how: p.label })),
      }
    },
  },
  {
    name: 'find_products',
    description: 'Products and raw materials with stock, stock held for undelivered bills, available stock, cost, price and reorder level. Optional search, kind (finished, raw, packaging) and lowOnly.',
    input_schema: { type: 'object', properties: { query: { type: 'string' }, kind: { type: 'string', enum: ['finished', 'raw', 'packaging'] }, lowOnly: { type: 'boolean' } }, additionalProperties: false },
    pages: ['products', 'raw-materials', 'sell'],
    run: (db, i) => db.products.filter((p) => !p.archived && matches(str(i.query), p.name, p.code) && (!i.kind || p.kind === i.kind) && (!i.lowOnly || (p.lowAt > 0 && p.stock <= p.lowAt)))
      .slice(0, 40).map((p) => {
        const held = reservedQty(db, p.id)
        return { name: p.name, code: p.code, kind: p.kind, unit: p.unit, stock: p.stock, heldForBills: held, available: r2(p.stock - held), cost: p.cost, price: p.price, reorderAt: p.lowAt, stockValue: r0(p.stock * p.cost) }
      }),
  },
  {
    name: 'sales_summary',
    description: 'Sales between two dates (YYYY-MM-DD, inclusive): total, profit, bills, collections, and the top products, dealers and sales staff. Defaults to this month.',
    input_schema: { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } }, additionalProperties: false },
    pages: ['sales-analytics', 'reports', 'sell'],
    run: (db, i, can) => {
      // profit is only for people whose screens show it
      const seesProfit = can('reports') || can('sales-analytics')
      const to = isDate(i.to) ? i.to : todayISO()
      const from = isDate(i.from) ? i.from : to.slice(0, 7) + '-01'
      const t = totalsBetween(db, from, to)
      const facts = saleFacts(db).filter((f) => f.date >= from && f.date <= to)
      const top = (key: (f: (typeof facts)[number]) => string) => {
        const m = new Map<string, number>()
        for (const f of facts) m.set(key(f), (m.get(key(f)) || 0) + f.total)
        return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount: r0(amount) }))
      }
      const lines = new Map<string, number>()
      for (const inv of db.invoices.filter((x) => x.status === 'final' && !x.sample && x.date >= from && x.date <= to)) {
        for (const l of inv.lines) lines.set(l.productId, (lines.get(l.productId) || 0) + l.qty * l.price)
      }
      return {
        from, to, sales: r0(t.sales), profit: seesProfit ? r0(t.profit) : 'not available to this role', bills: t.invoices, units: t.units, collected: r0(t.collected),
        topDealers: top((f) => byId(db.dealers, f.dealerId)?.name || f.dealerId),
        topStaff: top((f) => byId(db.employees, f.soldBy)?.name || 'Not set'),
        topProducts: [...lines.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, amount]) => ({ name: byId(db.products, id)?.name || id, amount: r0(amount) })),
      }
    },
  },
  {
    name: 'find_invoice',
    description: 'One sale bill by its number (e.g. INV-2311): dealer, lines, total, paid, delivery status and what is still to deliver.',
    input_schema: { type: 'object', properties: { invoice: { type: 'string' } }, required: ['invoice'], additionalProperties: false },
    pages: ['sell', 'deliveries', 'dealers'],
    run: (db, i) => {
      const q = str(i.invoice).toLowerCase()
      const inv = db.invoices.find((x) => x.id.toLowerCase() === q) || db.invoices.find((x) => x.id.toLowerCase().endsWith(q))
      if (!inv) return { error: `No bill numbered "${str(i.invoice)}".` }
      const d = inv.status === 'final' ? invoiceDelivery(db, inv) : null
      return {
        bill: inv.id, status: inv.status, date: inv.date, dealer: byId(db.dealers, inv.dealerId)?.name, total: r0(invTotal(inv)), paidWithBill: inv.received, terms: inv.terms,
        lines: inv.lines.map((l) => ({ product: byId(db.products, l.productId)?.name || l.name, qty: l.qty, price: l.price })),
        delivery: d ? { status: d.status, stillToGo: d.lines.filter((x) => x.remaining > 0).map((x) => ({ product: x.name, qty: x.remaining })) } : null,
      }
    },
  },
  {
    name: 'pending_deliveries',
    description: 'Bills whose goods have not all been delivered yet, oldest first, with what is left on each.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    pages: ['deliveries', 'sell'],
    run: (db) => pendingDeliveries(db).filter((x) => !x.inv.sample).slice(0, 30).map((x) => ({
      bill: x.inv.id, date: x.inv.date, dealer: byId(db.dealers, x.inv.dealerId)?.name, status: x.d.status, unitsLeft: x.d.remainingUnits,
    })),
  },
  {
    name: 'cashbook',
    description: 'Money in and out on one day (YYYY-MM-DD, default today) with each entry, plus the balance of every account (cash, bank, bKash, Nagad) at the end of that day.',
    input_schema: { type: 'object', properties: { date: { type: 'string' } }, additionalProperties: false },
    pages: ['cashbook'],
    run: (db, i) => {
      const d = isDate(i.date) ? i.date : todayISO()
      const c = cashForDay(db, d)
      return {
        date: d, opening: r0(c.opening), in: r0(c.in), out: r0(c.out), closing: r0(c.closing),
        accounts: accountBalances(db, d).map((a) => ({ account: a.account, balance: r0(a.balance) })),
        entries: c.entries.slice(0, 40).map((e) => ({ details: e.details, head: e.head, method: e.method, in: r0(e.in), out: r0(e.out) })),
      }
    },
  },
  {
    name: 'what_we_owe',
    description: 'Who the company owes money to: suppliers, factories and transporters, with amounts. Also advances lying with factories.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    pages: ['cashbook', 'suppliers', 'reports'],
    run: (db) => {
      const p = payables(db)
      return { total: r0(p.total), rows: p.rows.map((r) => ({ to: r.name, what: r.meta, due: r0(r.due) })), factoryAdvances: p.advances.map((a) => ({ factory: a.name, order: a.orderId, amount: r0(a.amount) })) }
    },
  },
  {
    name: 'profit_and_loss',
    description: 'Profit and loss for a month (YYYY-MM, default this month): sales, cost of goods, gross profit, each expense, depreciation and net profit.',
    input_schema: { type: 'object', properties: { month: { type: 'string', description: 'YYYY-MM' } }, additionalProperties: false },
    pages: ['reports'],
    run: (db, i) => {
      const m = typeof i.month === 'string' && /^\d{4}-\d{2}$/.test(i.month) ? i.month : thisMonth()
      const r = profitAndLoss(db, m)
      return { month: fmonth(m), sales: r0(r.sales), exportSales: r0(r.exportSales), costOfGoods: r0(r.cogs), grossProfit: r0(r.gross), expenses: r.expenses.map((e) => ({ name: e.label, amount: r0(e.amount) })), assetSaleGainOrLoss: r0(r.assetGain), netProfit: r0(r.net), bills: r.invoices }
    },
  },
  {
    name: 'factory_orders',
    description: 'Factory orders still open (goods pending or money unsettled): factory, product, received vs ordered, expected date, billed, paid and balance.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false },
    pages: ['factory-orders'],
    run: (db, i) => db.factoryOrders.map((o) => ({ o, c: foCalc(db, o) })).filter(({ o, c }) => (c.pending > 0 || c.balance !== 0) && matches(str(i.query), o.id, c.factory?.name, c.product?.name)).slice(0, 25)
      .map(({ o, c }) => ({ order: o.id, factory: c.factory?.name, product: c.product?.name, ordered: o.qty, received: c.received, pending: c.pending, unit: c.unit, expected: o.expected, billed: r0(c.billed), paid: r0(c.paid), balance: c.balanceText })),
  },
  {
    name: 'shipments',
    description: 'Import LCs and export orders in progress: stage, next step and expected date, value, plus customs duty due, demurrage and missing documents.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    pages: ['imports', 'customs'],
    run: (db) => {
      const t = tradeOverview(db)
      const row = (r: (typeof t.imports)[number]) => ({ id: r.s.id, goods: r.name, stage: r.stageText, next: r.next, expected: r.expected, daysToNext: r.daysTo, usd: r.s.usd })
      return { imports: t.imports.map(row), exports: t.exports.map(row), customsDutyDue: r0(t.dutyDue), demurrage: r0(t.demurrage), documentsMissing: t.docsMissing }
    },
  },
  {
    name: 'assets_and_investors',
    description: 'Fixed assets (cost, depreciation, book value) and investors (capital, ownership, profit waiting), with the undistributed profit pool.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    pages: ['fixed-assets', 'investors'],
    run: (db) => {
      const a = assetSummary(db)
      const p = profitPool(db)
      return {
        assets: { count: a.count, cost: r0(a.cost), depreciationSoFar: r0(a.accumulated), bookValue: r0(a.nbv), perMonth: r0(a.monthly), byCategory: a.byCategory.map((c) => ({ ...c, cost: r0(c.cost), nbv: r0(c.nbv) })) },
        investors: investorRows(db).map((r) => ({ name: r.investor.name, status: r.investor.status, capital: r0(r.capital), ownershipPercent: r2(r.ownership * 100), profitWaiting: r0(r.available) })),
        profitPool: { allTimeProfit: r0(p.total), distributed: r0(p.distributed), notYetShared: r0(p.pool) },
      }
    },
  },
  {
    name: 'alerts',
    description: 'Everything that needs attention now: overdue dues, low stock, late factory orders, shipments due, expiring vehicle papers, deliveries waiting, and so on.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    pages: ['dashboard'],
    run: (db) => notifications(db).slice(0, 25).map((n) => ({ title: n.title, detail: n.body, area: n.kind, urgent: n.tone === 'warn' })),
  },
]

/** The tools this person may use, from their role. */
export const toolsFor = (db: Db, userId: string): ToolDef[] => TOOLS.filter((t) => t.pages.some((p) => levelFor(db, userId, p) !== 'none'))

const COST_KEYS = ['cost', 'stockValue', 'costOfGoods', 'unitCost', 'lastRate', 'avgRate']
const PROFIT_KEYS = ['profit', 'grossProfit', 'netProfit', 'margin']
/** A copy of a tool's answer without the fields this person may not see. */
function strip(v: unknown, hide: Set<string>): unknown {
  if (Array.isArray(v)) return v.map((x) => strip(x, hide))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !hide.has(k)).map(([k, x]) => [k, strip(x, hide)]))
  return v
}

/** Run one tool for one person. Never throws: problems come back as `{ error }` for the model to read. */
export function runTool(db: Db, userId: string, name: string, input: unknown): string {
  const tool = toolsFor(db, userId).find((t) => t.name === name)
  if (!tool) return JSON.stringify({ error: 'That information is not available to your role.' })
  try {
    const out = tool.run(db, input && typeof input === 'object' ? (input as Record<string, unknown>) : {}, (p) => levelFor(db, userId, p) !== 'none')
    // the same special permissions as the screens: no buying prices or profit for roles without them
    const hide = new Set([...(canSee(db, userId, 'cost') ? [] : COST_KEYS), ...(canSee(db, userId, 'profit') ? [] : PROFIT_KEYS)])
    return JSON.stringify(hide.size ? strip(out, hide) : out)
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : 'Could not read that.' })
  }
}

