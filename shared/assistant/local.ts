/**
 * The built-in answerer: no AI, no internet. It spots what the question is about (in English or
 * Bangla), asks the books through the same tools as the AI, and writes a short answer. Used in the
 * browser-only copy and whenever the server has no AI key.
 */
import { fmt, thisMonth, tk, todayISO, addDays, type Db } from '../domain'
import { runTool, toolsFor } from './tools'

/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are plain JSON read back for wording */
type J = any

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w))
const list = (rows: string[], empty: string) => (rows.length ? rows.map((r) => '- ' + r).join('\n') : empty)

export function localAnswer(db: Db, userId: string, question: string): { reply: string; used: string[] } {
  const q = question.toLowerCase()
  const allowed = new Set(toolsFor(db, userId).map((t) => t.name))
  const used: string[] = []
  const ask = (name: string, input: Record<string, unknown> = {}): J => {
    used.push(name)
    return JSON.parse(runTool(db, userId, name, input))
  }
  const can = (name: string) => allowed.has(name)
  const done = (reply: string) => ({ reply, used })
  const nameIn = <T extends { name: string }>(rows: T[]) => rows.find((r) => r.name && q.includes(r.name.toLowerCase().split(' ')[0]) && r.name.length > 2)

  if (/^(hi|hello|hey|salam|assalamu|হ্যালো|সালাম|help|সাহায্য)\b/.test(q.trim()) || q.trim().length < 3) {
    return done(`Hello! Ask me about your books, for example:\n${list([
      'How are sales today? / আজকের বিক্রি কত?',
      'Who owes us money? / কার কাছে বাকি আছে?',
      'Which products are low in stock?',
      'Cash and bank balance today',
      'Profit this month',
      'Bills waiting for delivery',
      'Status of INV-2311',
    ], '')}`)
  }

  const overview = has(q, 'how is business', 'overview', 'summary', 'how are we', 'কেমন চল', 'সারসংক্ষেপ', 'অবস্থা')

  // a bill number
  const bill = question.match(/\b([A-Za-z]{2,}-?\d{3,})\b/)
  if (bill && can('find_invoice')) {
    const r = ask('find_invoice', { invoice: bill[1] })
    if (!r.error) {
      return done(`${r.bill} (${r.status}) for ${r.dealer}, ${r.date}: total ${tk(r.total)}, paid with the bill ${tk(r.paidWithBill)}.\n${list(r.lines.map((l: J) => `${l.product}: ${fmt(l.qty)} × ${tk(l.price)}`), '')}${r.delivery ? `\nDelivery: ${r.delivery.status}${r.delivery.stillToGo.length ? `, still to go: ${r.delivery.stillToGo.map((x: J) => `${fmt(x.qty)} ${x.product}`).join(', ')}` : ''}.` : ''}`)
    }
  }

  if (overview && can('business_snapshot')) return snapshot()

  if (has(q, 'due', 'owe', 'baki', 'বাকি', 'পাওনা', 'collect', 'আদায়', 'dealer', 'ডিলার', 'customer') && !has(q, 'we owe', 'supplier', 'দেনা') && can('find_dealers')) {
    const dealer = nameIn(db.dealers.filter((d) => !d.sample))
    if (dealer && can('dealer_statement')) {
      const r = ask('dealer_statement', { dealer: dealer.name })
      return done(`${r.name} owes ${tk(r.due)} (${r.status}).\n${list(r.unpaidBills.map((b: J) => `${b.bill} of ${b.date}: ${tk(b.unpaid)} unpaid${b.dueDate ? `, due ${b.dueDate}` : ''}`), 'No unpaid bills.')}${r.recentPayments[0] ? `\nLast payment: ${tk(r.recentPayments[0].amount)} on ${r.recentPayments[0].date}.` : ''}`)
    }
    const rows: J[] = ask('find_dealers', { onlyOwing: true })
    const total = rows.reduce((s, r) => s + r.due, 0)
    return done(`${rows.length} dealer${rows.length === 1 ? '' : 's'} owe ${tk(total)} in all. Biggest:\n${list(rows.slice(0, 6).map((r) => `${r.name}: ${tk(r.due)} (${r.status})`), 'Nobody owes anything.')}`)
  }

  if (has(q, 'we owe', 'supplier', 'দেনা', 'pay ', 'payable', 'factory bill') && can('what_we_owe')) {
    const r = ask('what_we_owe')
    return done(`We owe ${tk(r.total)}:\n${list(r.rows.slice(0, 8).map((x: J) => `${x.to}: ${tk(x.due)} (${x.what})`), 'Nothing to pay.')}`)
  }

  if (has(q, 'stock', 'স্টক', 'low', 'কম', 'reorder', 'inventory', 'মজুদ', 'raw material', 'কাঁচামাল') && can('find_products')) {
    const product = nameIn(db.products.filter((p) => !p.archived))
    if (product) {
      const [p]: J[] = ask('find_products', { query: product.name })
      if (p) return done(`${p.name}: ${fmt(p.stock)} ${p.unit} in the warehouse, ${fmt(p.heldForBills)} held for undelivered bills, so ${fmt(p.available)} ${p.unit} free to sell. Cost ${tk(p.cost)}, price ${tk(p.price)}${p.reorderAt ? `, reorder at ${fmt(p.reorderAt)}` : ''}.`)
    }
    const rows: J[] = ask('find_products', { lowOnly: true })
    return done(rows.length ? `${rows.length} item${rows.length === 1 ? ' is' : 's are'} at or below the reorder level:\n${list(rows.map((p) => `${p.name}: ${fmt(p.stock)} ${p.unit} (reorder at ${fmt(p.reorderAt)})`), '')}` : 'Nothing is below its reorder level.')
  }

  if (has(q, 'deliver', 'ডেলিভারি', 'pending', 'অপেক্ষ') && can('pending_deliveries')) {
    const rows: J[] = ask('pending_deliveries')
    return done(rows.length ? `${rows.length} bill${rows.length === 1 ? '' : 's'} still have goods to deliver:\n${list(rows.slice(0, 8).map((r) => `${r.bill} (${r.date}) for ${r.dealer}: ${fmt(r.unitsLeft)} units left, ${r.status}`), '')}` : 'Every bill is delivered.')
  }

  if (has(q, 'profit', 'লাভ', 'মুনাফা', 'p&l', 'loss', 'ক্ষতি') && can('profit_and_loss')) {
    const last = has(q, 'last month', 'গত মাস')
    const m = last ? addDays(thisMonth() + '-01', -1).slice(0, 7) : thisMonth()
    const r = ask('profit_and_loss', { month: m })
    return done(`${r.month}: sales ${tk(r.sales)}, cost of goods ${tk(r.costOfGoods)}, gross profit ${tk(r.grossProfit)}.\nExpenses:\n${list(r.expenses.filter((e: J) => e.amount).map((e: J) => `${e.name}: ${tk(e.amount)}`), 'None.')}\n${r.netProfit < 0 ? 'Net loss' : 'Net profit'}: ${tk(Math.abs(r.netProfit))}.`)
  }

  if (has(q, 'cash', 'ক্যাশ', 'নগদ', 'bank', 'ব্যাংক', 'balance', 'ব্যালেন্স', 'bkash', 'বিকাশ', 'nagad', 'নগদ') && can('cashbook')) {
    const r = ask('cashbook', { date: has(q, 'yesterday', 'গতকাল') ? addDays(todayISO(), -1) : todayISO() })
    return done(`${r.date}: opened at ${tk(r.opening)}, ${tk(r.in)} came in, ${tk(r.out)} went out, closing ${tk(r.closing)}.\n${list(r.accounts.map((a: J) => `${a.account}: ${tk(a.balance)}`), '')}`)
  }

  if (has(q, 'factory', 'ফ্যাক্টরি', 'কারখানা') && can('factory_orders')) {
    const rows: J[] = ask('factory_orders')
    return done(rows.length ? `${rows.length} factory order${rows.length === 1 ? '' : 's'} open:\n${list(rows.slice(0, 8).map((o) => `${o.order} ${o.factory}: ${fmt(o.received)} of ${fmt(o.ordered)} ${o.unit} received${o.expected ? `, expected ${o.expected}` : ''} · ${o.balance}`), '')}` : 'No factory order is open.')
  }

  if (has(q, 'shipment', 'lc', 'import', 'export', 'এলসি', 'আমদানি', 'রপ্তানি', 'customs', 'কাস্টমস', 'port') && can('shipments')) {
    const r = ask('shipments')
    const rows = [...r.imports, ...r.exports]
    return done(`${r.imports.length} import${r.imports.length === 1 ? '' : 's'} and ${r.exports.length} export${r.exports.length === 1 ? '' : 's'} in progress.\n${list(rows.slice(0, 8).map((s: J) => `${s.id} ${s.goods}: ${s.stage}${s.next ? `, next ${s.next}${s.expected ? ` by ${s.expected}` : ''}` : ''}`), '')}${r.demurrage ? `\nDemurrage running: ${tk(r.demurrage)}.` : ''}`)
  }

  if (has(q, 'asset', 'সম্পদ', 'investor', 'বিনিয়োগ', 'depreciation', 'অবচয়') && can('assets_and_investors')) {
    const r = ask('assets_and_investors')
    return done(`Fixed assets: ${r.assets.count}, cost ${tk(r.assets.cost)}, book value ${tk(r.assets.bookValue)}, ${tk(r.assets.perMonth)} depreciation a month.\nInvestors:\n${list(r.investors.filter((i: J) => i.status === 'active').map((i: J) => `${i.name}: ${tk(i.capital)} (${fmt(i.ownershipPercent)}%), profit waiting ${tk(i.profitWaiting)}`), 'None yet.')}\nProfit not yet shared: ${tk(r.profitPool.notYetShared)}.`)
  }

  if (has(q, 'alert', 'attention', 'notification', 'urgent', 'সতর্ক', 'নোটিফিকেশন', 'problem', 'সমস্যা') && can('alerts')) {
    const rows: J[] = ask('alerts')
    return done(rows.length ? `Needs attention:\n${list(rows.slice(0, 10).map((a) => `${a.urgent ? '⚠ ' : ''}${a.title}`), '')}` : 'Nothing needs attention right now.')
  }

  if (has(q, 'sale', 'sold', 'বিক্রি', 'বিক্রয়', 'order', 'অর্ডার', 'revenue', 'today', 'আজ', 'month', 'মাস') && can('sales_summary')) {
    const today = todayISO()
    const range = has(q, 'yesterday', 'গতকাল') ? [addDays(today, -1), addDays(today, -1)] : has(q, 'today', 'আজ') ? [today, today] : has(q, 'last month', 'গত মাস') ? [addDays(today.slice(0, 7) + '-01', -1).slice(0, 7) + '-01', addDays(today.slice(0, 7) + '-01', -1)] : [today.slice(0, 7) + '-01', today]
    const r = ask('sales_summary', { from: range[0], to: range[1] })
    return done(`${r.from === r.to ? r.from : `${r.from} to ${r.to}`}: ${tk(r.sales)} from ${r.bills} bill${r.bills === 1 ? '' : 's'}${typeof r.profit === 'number' ? `, profit ${tk(r.profit)}` : ''}, collected ${tk(r.collected)}.${r.topDealers.length ? `\nTop dealers: ${r.topDealers.slice(0, 3).map((d: J) => `${d.name} ${tk(d.amount)}`).join(', ')}.` : ''}${r.topProducts.length ? `\nTop products: ${r.topProducts.slice(0, 3).map((d: J) => `${d.name} ${tk(d.amount)}`).join(', ')}.` : ''}`)
  }

  if (can('business_snapshot')) return snapshot()
  return done('I can only answer about the screens your role can open, and none of them match that question.')

  function snapshot() {
    const r = ask('business_snapshot')
    return done(`Here is today (${r.date}):\n${list([
      `Sales today ${tk(r.salesToday.amount)} from ${r.salesToday.bills} bill${r.salesToday.bills === 1 ? '' : 's'}; this month ${tk(r.salesThisMonth.amount)}`,
      `Cash in ${tk(r.cashToday.in)}, out ${tk(r.cashToday.out)}, closing ${tk(r.cashToday.closing)}`,
      `Dealers owe ${tk(r.dealerDuesToCollect)}; we owe ${tk(r.weOwe)}`,
      `${r.lowStockProducts} low-stock item${r.lowStockProducts === 1 ? '' : 's'}, ${r.billsWaitingDelivery} bill${r.billsWaitingDelivery === 1 ? '' : 's'} waiting for delivery`,
    ], '')}${r.topAlerts.length ? `\nNeeds attention:\n${list(r.topAlerts.slice(0, 4), '')}` : ''}\n\nI understand questions about sales, dues, stock, cash, profit, deliveries, factory orders and shipments.`)
  }
  return done('I can only answer about the screens your role can open, and none of them match that question.')
}
