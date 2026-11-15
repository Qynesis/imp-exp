import { addDays, daysBetween, fmonth, todayISO } from './format.js'
import { customsDocs } from './presets.js'

export const byId = (list, id) => list.find((x) => x.id === id)
const sum = (list, f) => list.reduce((s, x) => s + f(x), 0)
const byDateTs = (a, b) => (a.date === b.date ? a.ts - b.ts : a.date < b.date ? -1 : 1)
export const newestFirst = (a, b) => -byDateTs(a, b)

export const METHODS = ['Cash', 'Bank transfer', 'bKash', 'Cheque']
export const UNITS = ['cartons', 'jars', 'pouches', 'pcs', 'units', 'sets', 'kg', 'litres', 'MT', 'boxes', 'bags', 'drums', 'rolls']
export const KINDS = { finished: 'Finished goods', raw: 'Raw material', packaging: 'Packaging' }
export const EXPENSE_HEADS = ['Transport', 'Office', 'Employee', 'Other']
export const COST_TYPES = ['Sea freight', 'Insurance', 'Customs duty and VAT', 'C&F agent', 'Port charge', 'Transport to warehouse', 'Bank charge', 'Other']
/* ---------- roles and access ---------- */
export function levelFor(db, userId, page) {
  const user = byId(db.users, userId)
  const role = user && byId(db.roles, user.roleId)
  if (!role) return 'none'
  if (role.id === 'owner') return 'edit'
  return role.perms[page] || 'none'
}
export const roleName = (db, roleId) => byId(db.roles, roleId)?.name || 'No role'

/* ---------- categories and products ---------- */
export function catPath(db, id) {
  const c = byId(db.categories, id)
  if (!c) return 'Uncategorised'
  const p = c.parentId && byId(db.categories, c.parentId)
  return p ? `${p.name} › ${c.name}` : c.name
}
export const productName = (db, id) => byId(db.products, id)?.name || 'Deleted product'
export const isLow = (p) => p.lowAt > 0 && p.stock <= p.lowAt

/* ---------- invoices and dealers ---------- */
export const invSubtotal = (inv) => sum(inv.lines, (l) => l.qty * l.price)
export const invTotal = (inv) => invSubtotal(inv) - (inv.discount || 0)

export function dealerLedger(db, dealerId) {
  const dealer = byId(db.dealers, dealerId)
  const today = todayISO()
  const debts = []
  if (dealer.opening > 0) debts.push({ id: 'opening', label: 'Opening due', date: null, dueDate: null, total: dealer.opening, out: dealer.opening })
  const invs = db.invoices.filter((i) => i.dealerId === dealerId && i.status === 'final').sort(byDateTs)
  for (const inv of invs) {
    const total = invTotal(inv)
    debts.push({
      id: inv.id, label: inv.id, date: inv.date, total, out: total - (inv.received || 0),
      dueDate: inv.terms === 'credit' ? addDays(inv.date, dealer.days || 0) : inv.date,
    })
  }
  const cols = db.collections.filter((c) => c.dealerId === dealerId).sort(byDateTs)
  for (const c of cols) {
    let amt = c.amount
    const target = c.invoiceId && debts.find((d) => d.id === c.invoiceId)
    if (target) {
      const take = Math.min(amt, Math.max(target.out, 0))
      target.out -= take
      amt -= take
    }
    for (const d of debts) {
      if (amt <= 0) break
      const take = Math.min(amt, Math.max(d.out, 0))
      d.out -= take
      amt -= take
    }
    if (amt > 0 && debts.length) debts[debts.length - 1].out -= amt
  }
  const due = sum(debts, (d) => d.out)
  const open = debts.filter((d) => d.out > 0)
  const oldest = open.find((d) => d.dueDate)
  const days = oldest ? daysBetween(today, oldest.dueDate) : null
  let statusText = 'Settled'
  if (due > 0) {
    if (days === null) statusText = 'Opening due'
    else if (days < 0) statusText = `${-days} day${days === -1 ? '' : 's'} overdue`
    else if (days === 0) statusText = 'Due today'
    else statusText = `Due in ${days} day${days === 1 ? '' : 's'}`
  }
  const pays = [
    ...cols.map((c) => ({ amount: c.amount, date: c.date, ts: c.ts, label: `Collection · ${c.method}` })),
    ...invs.filter((i) => i.received > 0).map((i) => ({ amount: i.received, date: i.date, ts: i.ts, label: `Received on ${i.id}` })),
  ].sort(newestFirst)
  return { dealer, debts, open, due, days, overdue: due > 0 && days !== null && days < 0, statusText, payments: pays, lastPayment: pays[0] || null }
}

export function receivables(db) {
  const rows = db.dealers.map((d) => dealerLedger(db, d.id)).filter((l) => l.due > 0).sort((a, b) => b.due - a.due)
  return { rows, total: sum(rows, (r) => r.due) }
}

/* ---------- suppliers ---------- */
export function supplierLedger(db, supplierId) {
  const supplier = byId(db.suppliers, supplierId)
  const bills = []
  if (supplier.opening > 0) bills.push({ id: 'opening', billNo: 'Opening', date: null, items: 'Opening balance', terms: 'credit', amount: supplier.opening, paid: 0 })
  for (const p of db.purchases.filter((p) => p.supplierId === supplierId).sort(byDateTs)) {
    const prod = byId(db.products, p.productId)
    bills.push({ id: p.id, billNo: p.billNo, date: p.date, ts: p.ts, terms: p.terms, amount: p.qty * p.rate, paid: 0, items: `${prod?.name || 'Item'}, ${nfmt(p.qty)} ${prod?.unit || ''}`.trim() })
  }
  const pays = db.supplierPayments.filter((p) => p.supplierId === supplierId).sort(byDateTs)
  for (const pay of pays) {
    let amt = pay.amount
    const target = pay.purchaseId && bills.find((b) => b.id === pay.purchaseId)
    if (target) {
      const take = Math.min(amt, target.amount - target.paid)
      target.paid += take
      amt -= take
    }
    for (const b of bills) {
      if (amt <= 0) break
      const take = Math.min(amt, b.amount - b.paid)
      b.paid += take
      amt -= take
    }
    if (amt > 0 && bills.length) bills[bills.length - 1].paid += amt
  }
  const purchased = sum(bills, (b) => b.amount)
  const paid = sum(bills, (b) => b.paid)
  return { supplier, bills: [...bills].reverse(), payments: [...pays].reverse(), purchased, paid, due: purchased - paid }
}
const nfmt = (n) => new Intl.NumberFormat('en-IN').format(n)

/* ---------- factory orders ---------- */
export function foCalc(db, o) {
  const product = byId(db.products, o.productId)
  const factory = byId(db.factories, o.factoryId)
  const received = sum(o.receipts, (r) => r.qty)
  const pending = Math.max(o.qty - received, 0)
  const billed = sum(o.bills, (b) => b.amount)
  const paid = sum(o.payments, (p) => p.amount)
  const balance = paid - billed // positive: factory owes us, negative: we owe the factory
  const status = received <= 0 ? 'Ordered' : pending > 0 ? 'Partly received' : 'Received in full'
  const tone = received <= 0 ? 'info' : pending > 0 ? 'warn' : 'good'
  let balanceText = 'Settled'
  let balanceTone = 'muted'
  if (balance > 0) { balanceText = `Factory owes us Tk ${nfmt(balance)}`; balanceTone = 'good' }
  else if (balance < 0) { balanceText = `We owe Tk ${nfmt(-balance)}`; balanceTone = 'warn' }
  else if (billed === 0) balanceText = 'Nothing billed yet'
  const materials = (o.materials || []).map((m) => {
    const p = byId(db.products, m.productId)
    const used = o.qty > 0 ? Math.round((m.given * Math.min(received, o.qty)) / o.qty) : 0
    return { ...m, name: p?.name || 'Material', unit: p?.unit || '', used, left: m.given - used }
  })
  const unbilled = Math.max(o.qty * o.rate - billed, 0)
  return {
    product, factory, unit: product?.unit || 'units', received, pending, billed, paid, balance, status, tone,
    balanceText, balanceTone, materials, unbilled, pct: o.qty > 0 ? Math.min(100, Math.round((received / o.qty) * 100)) : 0,
    typeLabel: o.type === 1 ? 'Raw material supplied' : 'Direct order',
  }
}

/** For the products screen: what is still due from factories, or lying there as our material. */
export function atFactory(db, productId) {
  let due = 0
  const lying = []
  for (const o of db.factoryOrders) {
    const c = foCalc(db, o)
    if (o.productId === productId) due += c.pending
    for (const m of c.materials) if (m.productId === productId && m.left > 0) lying.push({ qty: m.left, factory: c.factory?.name || 'factory' })
  }
  return { due, lying, lyingQty: sum(lying, (l) => l.qty) }
}

export function payables(db) {
  const suppliers = db.suppliers.map((s) => supplierLedger(db, s.id)).filter((l) => l.due > 0)
    .map((l) => ({ key: l.supplier.id, kind: 'supplier', name: l.supplier.name, meta: `Supplier · ${l.supplier.terms === 'cash' ? 'cash' : 'credit'}`, due: l.due, supplierId: l.supplier.id }))
  const factories = []
  const advances = []
  for (const o of db.factoryOrders) {
    const c = foCalc(db, o)
    if (c.balance < 0) factories.push({ key: o.id, kind: 'factory', name: c.factory?.name || 'Factory', meta: `Factory bill · ${o.id}`, due: -c.balance, orderId: o.id })
    if (c.balance > 0) advances.push({ orderId: o.id, name: c.factory?.name || 'Factory', amount: c.balance })
  }
  const rows = [...suppliers, ...factories].sort((a, b) => b.due - a.due)
  return { rows, advances, total: sum(rows, (r) => r.due), advanceTotal: sum(advances, (a) => a.amount) }
}

/* ---------- shipments (import and export) ---------- */
const IMPORT_STEPS = ['lc', 'shipped', 'port', 'customs', 'warehouse']
const EXPORT_STEPS = ['contract', 'ready', 'customs', 'shipped', 'paid']
export const stepKeys = (imp) => (imp.direction === 'export' ? EXPORT_STEPS : IMPORT_STEPS)
export function stepLabel(key, imp) {
  const exp = imp.direction === 'export'
  return {
    lc: 'LC opened at bank',
    contract: 'Export LC or contract received',
    ready: 'Goods ready and packed',
    shipped: exp ? `Shipped to ${imp.country || 'buyer'}` : `Shipped from ${imp.country || 'origin'}`,
    port: `Arrived at ${imp.customs?.port || 'port'}`,
    customs: exp ? 'Export customs cleared' : 'Customs cleared',
    warehouse: 'Received in warehouse',
    paid: 'Payment realised at bank',
  }[key]
}
const STATUS = {
  lc: ['LC opened', 'info'], shipped: ['Shipped', 'info'], port: ['At port', 'warn'], customs: ['Cleared', 'good'], warehouse: ['Received', 'good'],
  contract: ['Contract received', 'info'], ready: ['Goods ready', 'info'], paid: ['Payment realised', 'good'],
}
export function importCalc(db, imp) {
  const exp = imp.direction === 'export'
  const keys = stepKeys(imp)
  const invoiceTk = imp.usd * imp.rate
  const extra = sum(imp.costs, (c) => c.amount)
  const product = imp.productId ? byId(db.products, imp.productId) : null
  const done = keys.filter((k) => imp.steps[k]?.date)
  const last = done[done.length - 1]
  let status = STATUS[last] || ['Planned', 'neutral']
  if (exp && last === 'customs') status = ['Cleared', 'info']
  if (exp && last === 'shipped') status = ['Shipped', 'warn']
  const goodsCost = exp ? imp.qty * (imp.unitCost ?? product?.cost ?? 0) : 0
  const landed = exp ? extra : invoiceTk + extra
  return {
    exp, keys, invoiceTk, extra, landed, goodsCost, margin: exp ? invoiceTk - extra - goodsCost : 0,
    perUnit: imp.qty > 0 ? landed / imp.qty : 0, status: status[0], tone: status[1],
    next: keys.find((k) => !imp.steps[k]?.date), product, productName: product?.name || imp.productName || 'Goods',
  }
}

/* ---------- customs clearance ---------- */
export const DUTIES = [
  ['cd', 'Customs duty (CD)'], ['rd', 'Regulatory duty (RD)'], ['sd', 'Supplementary duty (SD)'],
  ['vat', 'VAT'], ['ait', 'Advance income tax (AIT)'], ['at', 'Advance tax (AT)'],
]
export function customsStages(imp) {
  const exp = imp.direction === 'export'
  return [
    ['docs', 'Documents ready'],
    ['boe', exp ? 'Bill of Export submitted' : 'Bill of Entry submitted'],
    ['assess', 'Assessment done'],
    ['duty', exp ? 'Export charges paid' : 'Duty and taxes paid'],
    ['exam', 'Goods examined'],
    ['release', 'Released by customs'],
  ]
}
export function customsCalc(db, imp) {
  const cu = imp.customs || {}
  const stages = customsStages(imp)
  const dates = cu.stages || {}
  const doneCount = stages.filter(([k]) => dates[k]).length
  const next = stages.find(([k]) => !dates[k])
  const released = !!dates.release
  const cif = imp.usd * imp.rate + sum(imp.costs.filter((c) => c.type === 'Sea freight' || c.type === 'Insurance'), (c) => c.amount)
  const av = cu.av > 0 ? cu.av : imp.direction === 'export' ? imp.usd * imp.rate : cif
  const r = (k) => (Number(cu.rates?.[k]) || 0) / 100
  const cd = av * r('cd')
  const rd = av * r('rd')
  const sd = (av + cd + rd) * r('sd')
  const vatBase = av + cd + rd + sd
  const amounts = { cd, rd, sd, vat: vatBase * r('vat'), ait: av * r('ait'), at: vatBase * r('at') }
  const duties = DUTIES.map(([k, label]) => ({ key: k, label, rate: Number(cu.rates?.[k]) || 0, amount: Math.round(amounts[k]) })).filter((d) => d.rate > 0)
  const dutyTotal = sum(duties, (d) => d.amount)
  const docs = customsDocs(db, imp).map((name) => ({ name, ok: !!cu.docs?.[name] }))
  const arrived = imp.direction === 'export' ? imp.steps.ready?.date : imp.steps.port?.date
  const today = todayISO()
  const daysAtPort = arrived && !released ? Math.max(daysBetween(arrived, today), 0) : null
  const overDays = cu.freeUntil && arrived && !released ? Math.max(daysBetween(cu.freeUntil, today), 0) : 0
  const stageText = released ? 'Released' : next && doneCount ? `${stages[doneCount - 1][1]}` : 'Not started'
  return {
    cu, stages, dates, doneCount, next, released, av, duties, dutyTotal, docs, docsOk: docs.filter((d) => d.ok).length,
    daysAtPort, overDays, demurrage: overDays * (Number(cu.demurragePerDay) || 0),
    stageText, tone: released ? 'good' : doneCount ? 'warn' : 'neutral',
  }
}

/* ---------- cashbook (derived from every money movement) ---------- */
export function cashEntries(db) {
  const out = []
  const push = (date, ts, details, head, inn, o, method) => out.push({ date, ts, details, head, in: inn, out: o, method: method || 'Cash' })
  for (const i of db.invoices) {
    if (i.status !== 'final' || !(i.received > 0)) continue
    const part = i.received < invTotal(i)
    push(i.date, i.ts, `${byId(db.dealers, i.dealerId)?.name || 'Dealer'} · ${part ? 'part payment' : 'payment'} on ${i.id}`, 'Sales', i.received, 0, i.method)
  }
  for (const c of db.collections) push(c.date, c.ts, `${byId(db.dealers, c.dealerId)?.name || 'Dealer'} · due collection`, 'Collection', c.amount, 0, c.method)
  for (const e of db.expenses) push(e.date, e.ts, e.details || `${e.head} expense`, `${e.head} expense`, 0, e.amount, e.method)
  for (const a of db.advances) push(a.date, a.ts, `Salary advance · ${byId(db.employees, a.employeeId)?.name || 'Employee'}`, 'Employee expense', 0, a.amount, a.method)
  for (const p of db.supplierPayments) {
    const bill = p.purchaseId && byId(db.purchases, p.purchaseId)
    push(p.date, p.ts, `${byId(db.suppliers, p.supplierId)?.name || 'Supplier'}${bill ? ` · ${bill.billNo}` : ''}`, 'Supplier payment', 0, p.amount, p.method)
  }
  for (const o of db.factoryOrders) {
    for (const p of o.payments) push(p.date, p.ts, `${byId(db.factories, o.factoryId)?.name || 'Factory'} · ${p.note || o.id}`, 'Factory payment', 0, p.amount, p.method)
  }
  for (const imp of db.imports) {
    if (imp.direction === 'export') {
      if (imp.steps.paid?.date) push(imp.steps.paid.date, imp.ts, `${imp.id} · export proceeds, USD ${nfmt(imp.usd)}`, 'Export sales', imp.usd * imp.rate, 0, 'Bank transfer')
    } else if (imp.steps.lc?.date) push(imp.steps.lc.date, imp.ts, `${imp.id} · LC invoice value`, 'Import', 0, imp.usd * imp.rate, 'Bank transfer')
    for (const c of imp.costs) push(c.date, c.ts, `${imp.id} · ${c.type}`, imp.direction === 'export' ? 'Export cost' : 'Import cost', 0, c.amount, c.method)
  }
  for (const p of db.payroll) {
    const sal = sum(p.lines.filter((l) => l.kind === 'salary'), (l) => l.amount)
    const com = sum(p.lines.filter((l) => l.kind === 'commission'), (l) => l.amount)
    if (sal > 0) push(p.date, p.ts, `Salaries · ${fmonth(p.month)}`, 'Salary', 0, sal, p.method)
    if (com > 0) push(p.date, p.ts + 0.5, `Sales commission · ${fmonth(p.month)}`, 'Commission', 0, com, p.method)
  }
  return out.sort(byDateTs)
}

export function cashForDay(db, date) {
  const all = cashEntries(db)
  let opening = db.openingCash || 0
  for (const e of all) if (e.date < date) opening += e.in - e.out
  let bal = opening
  const entries = all.filter((e) => e.date === date).map((e) => ({ ...e, balance: (bal += e.in - e.out) }))
  const cin = sum(entries, (e) => e.in)
  const cout = sum(entries, (e) => e.out)
  return { opening, in: cin, out: cout, closing: opening + cin - cout, entries }
}

/* ---------- employees ---------- */
export function payrollFor(db, month) {
  const inM = (x) => x.date.slice(0, 7) === month
  const paidOf = (eid, kind) => sum(db.payroll.filter((p) => p.month === month).flatMap((p) => p.lines).filter((l) => l.employeeId === eid && l.kind === kind), (l) => l.amount)
  const salary = db.employees.filter((e) => e.payType === 'salary').map((e) => {
    const advance = sum(db.advances.filter((a) => a.employeeId === e.id && inM(a)), (a) => a.amount)
    const paid = paidOf(e.id, 'salary')
    return { e, salary: e.salary, advance, paid, toPay: Math.max(e.salary - advance - paid, 0) }
  })
  const sales = db.employees.filter((e) => e.payType === 'sales').map((e) => {
    const invs = db.invoices.filter((i) => i.status === 'final' && i.soldBy === e.id && inM(i))
    const sold = sum(invs, invTotal)
    const collected = sum(invs, (i) => i.received || 0) + sum(db.collections.filter((c) => c.collectedBy === e.id && inM(c)), (c) => c.amount)
    const base = e.commissionOn === 'collection' ? collected : sold
    const commission = Math.round((base * (e.rate || 0)) / 100)
    const paid = paidOf(e.id, 'commission')
    return { e, dealers: db.dealers.filter((d) => d.salesId === e.id).length, sold, collected, commission, paid, toPay: Math.max(commission - paid, 0) }
  })
  return {
    salary, sales,
    salaryTotal: sum(salary, (r) => r.salary),
    salaryToPay: sum(salary, (r) => r.toPay),
    advances: sum(salary, (r) => r.advance),
    commission: sum(sales, (r) => r.commission),
    commissionToPay: sum(sales, (r) => r.toPay),
  }
}

/* ---------- reports ---------- */
export function pnl(db, month) {
  const invs = db.invoices.filter((i) => i.status === 'final' && i.date.slice(0, 7) === month)
  const salesAmt = sum(invs, invTotal)
  const cogs = sum(invs, (i) => sum(i.lines, (l) => l.qty * (l.cost || 0)))
  const pr = payrollFor(db, month)
  const exp = db.expenses.filter((e) => e.date.slice(0, 7) === month)
  const transport = sum(exp.filter((e) => e.head === 'Transport'), (e) => e.amount)
  const other = sum(exp.filter((e) => e.head !== 'Transport'), (e) => e.amount)
  const exps = db.imports.filter((i) => i.direction === 'export' && i.steps.shipped?.date?.slice(0, 7) === month)
  const exportSales = sum(exps, (i) => i.usd * i.rate)
  const exportCost = sum(exps, (i) => importCalc(db, i).goodsCost + sum(i.costs, (c) => c.amount))
  const gross = salesAmt + exportSales - cogs - exportCost
  const expenses = [
    { label: 'Salaries', amount: pr.salaryTotal },
    { label: 'Sales commission', amount: pr.commission },
    { label: 'Transport', amount: transport },
    { label: 'Office and other', amount: other },
  ]
  return { sales: salesAmt, exportSales, exportCost, exports: exps.length, cogs, gross, expenses, net: gross - sum(expenses, (e) => e.amount), invoices: invs.length }
}
