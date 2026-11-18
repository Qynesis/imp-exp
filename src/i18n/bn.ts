/**
 * English → Bangla for anything the screens show. Exact phrases come from `bnPhrases`; text with
 * numbers, dates or names in it is handled by the patterns below. Digits stay as written, so amounts
 * and invoice numbers read the same in both languages.
 */
import { BN_PHRASES } from './bnPhrases'

export { BN_PHRASES }

const MONTHS: [string, string][] = [
  ['January', 'জানুয়ারি'], ['February', 'ফেব্রুয়ারি'], ['March', 'মার্চ'], ['April', 'এপ্রিল'], ['May', 'মে'], ['June', 'জুন'], ['July', 'জুলাই'],
  ['August', 'আগস্ট'], ['September', 'সেপ্টেম্বর'], ['October', 'অক্টোবর'], ['November', 'নভেম্বর'], ['December', 'ডিসেম্বর'],
  ['Jan', 'জানু'], ['Feb', 'ফেব্রু'], ['Mar', 'মার্চ'], ['Apr', 'এপ্রি'], ['Jun', 'জুন'], ['Jul', 'জুলা'], ['Aug', 'আগ'], ['Sep', 'সেপ্টে'], ['Oct', 'অক্টো'], ['Nov', 'নভে'], ['Dec', 'ডিসে'],
]
const DAYS: [string, string][] = [
  ['Sunday', 'রবিবার'], ['Monday', 'সোমবার'], ['Tuesday', 'মঙ্গলবার'], ['Wednesday', 'বুধবার'], ['Thursday', 'বৃহস্পতিবার'], ['Friday', 'শুক্রবার'], ['Saturday', 'শনিবার'],
  ['Sun', 'রবি'], ['Mon', 'সোম'], ['Tue', 'মঙ্গল'], ['Wed', 'বুধ'], ['Thu', 'বৃহঃ'], ['Fri', 'শুক্র'], ['Sat', 'শনি'],
]

/** Word-level swaps applied to whatever is left: money, dates, units. */
export const BN_TOKENS: [RegExp, string][] = [
  [/\bTk\s?(?=[\d−-])/g, '৳'],
  [/\(Tk\)/g, '(৳)'],
  // compact amounts only after the money sign, so '1 L pouch' in a product name stays as it is
  [/(৳[\d.,]+)\s?Cr\b/g, '$1 কোটি'],
  [/(৳[\d.,]+)\s?L\b/g, '$1 লাখ'],
  [/(৳[\d.,]+)K\b/g, '$1 হাজার'],
  [/(\d)\s?km\b/g, '$1 কিমি'],
  [/(\d) (cartons?)\b/g, '$1 কার্টন'], [/(\d) (jars?)\b/g, '$1 জার'], [/(\d) (pouch(?:es)?)\b/g, '$1 পাউচ'], [/(\d) pcs\b/g, '$1 পিস'],
  [/(\d) (litres?)\b/g, '$1 লিটার'], [/(\d) kg\b/g, '$1 কেজি'], [/(\d) (units?)\b/g, '$1 একক'], [/(\d) (boxes|box)\b/g, '$1 বাক্স'], [/(\d) (bags?)\b/g, '$1 ব্যাগ'],
  [/(\d) (drums?)\b/g, '$1 ড্রাম'], [/(\d) (rolls?)\b/g, '$1 রোল'], [/(\d) (sets?)\b/g, '$1 সেট'], [/(\d) MT\b/g, '$1 মে. টন'], [/\/month\b/g, '/মাস'],
  [/\bvs\b/g, 'বনাম'],
  ...[...MONTHS, ...DAYS].map(([en, bn]): [RegExp, string] => [new RegExp(`\\b${en}\\b(?=[\\s,.]|$)`, 'g'), bn]),
]

type Rule = [RegExp, (...m: string[]) => string]

/** Whole-phrase patterns for text with numbers in it. The first full match wins. */
const RULES: Rule[] = [
  [/^· (.+)$/, (_, r) => `· ${core(r)}`],
  [/^(.+) ·$/, (_, r) => `${core(r)} ·`],
  [/^(\d+) of (\d+) stages done$/, (_, a, b) => `${b}টির মধ্যে ${a}টি ধাপ সম্পন্ন`],
  [/^Expected (.+)$/, (_, d) => `সম্ভাব্য ${tokens(d)}`],
  [/^expected (.+)$/, (_, d) => `সম্ভাব্য ${tokens(d)}`],
  [/^Promised by (.+)$/, (_, d) => `কথা ছিল ${tokens(d)}`],
  [/^Factory owes us (Tk .+)$/, (_, v) => `ফ্যাক্টরির কাছে পাওনা ${tokens(v)}`],
  [/^We owe (Tk .+)$/, (_, v) => `আমাদের দেনা ${tokens(v)}`],
  [/^Making charge (Tk .+) per unit$/, (_, v) => `প্রতি একক তৈরি খরচ ${tokens(v)}`],
  [/^In (\d+) shipments?$/, (_, d) => `${d}টি চালানে`],
  [/^(\d[\d,]*) pending$/, (_, d) => `${d} বাকি`],
  [/^(\d[\d,]*) received$/, (_, d) => `${d} পাওয়া`],
  [/^Sells at (.+)$/, (_, v) => `বিক্রয়মূল্য ${tokens(v)}`],
  [/^Average (.+)$/, (_, v) => `গড় ${tokens(v)}`],
  [/^avg (.+)$/, (_, v) => `গড় ${tokens(v)}`],
  [/^(\d+) dealers?, (\d+) overdue$/, (_, a, b) => `${a} জন ডিলার, ${b} জনের মেয়াদ পেরিয়েছে`],
  [/^(.+) from (\d+) orders?$/, (_, v, d) => `${tokens(v)}, ${d}টি অর্ডার থেকে`],
  [/^Duty (.+)$/, (_, v) => `শুল্ক ${tokens(v)}`],
  [/^demurrage (.+)$/, (_, v) => `ডেমারেজ ${tokens(v)}`],
  [/^(\d+) documents missing$/, (_, d) => `${d}টি কাগজ বাকি`],
  [/^(\d+) (lc opened|on the water|at port, in customs|cleared, coming in)$/, (_, d, st) => `${d}টি ${({ 'lc opened': 'এলসি খোলা', 'on the water': 'সমুদ্রপথে', 'at port, in customs': 'বন্দরে, কাস্টমসে', 'cleared, coming in': 'ছাড় হয়ে আসছে' } as Record<string, string>)[st]}`],
  [/^Type (\d)$/, (_, d) => `ধরন ${d}`],
  [/^Credit terms: (\d+) days$/, (_, d) => `বাকির মেয়াদ: ${d} দিন`],
  [/^(\d+) days$/, (_, d) => `${d} দিন`],
  [/^due in (\d+) days$/, (_, d) => `${d} দিনের মধ্যে পরিশোধ`],
  [/^(\d+) shipments?$/, (_, d) => `${d}টি শিপমেন্ট`],
  [/^(\d+) released$/, (_, d) => `${d}টি ছাড় হয়েছে`],
  [/^(\d+) over free time$/, (_, d) => `${d}টি ফ্রি সময় পেরিয়েছে`],
  [/^(\d+) raw materials?$/, (_, d) => `${d}টি কাঁচামাল`],
  [/^(\d+) packaging$/, (_, d) => `${d}টি প্যাকেজিং`],
  [/^(\d+) imports?$/, (_, d) => `${d}টি আমদানি`],
  [/^(\d+) factory orders?$/, (_, d) => `${d}টি ফ্যাক্টরি অর্ডার`],
  [/^(\d[\d,]*) from (FO-\d+)$/, (_, d, id) => `${id} থেকে ${d}`],
  [/^(.+) earned this month$/, (_, v) => `এ মাসে আয় ${tokens(v)}`],
  [/^vs same days of (\w+)$/, (_, m) => `${tokens(m)} মাসের একই দিনগুলোর তুলনায়`],
  [/^vs same time in (\d+)$/, (_, y) => `${y} সালের একই সময়ের তুলনায়`],
  [/^vs last month \($/, () => 'গত মাসের তুলনায় ('],
  [/^Lasts: runs out today$/, () => 'চলবে: আজই শেষ'],
  [/^([\d,]+) out in 90 days$/, (_, d) => `৯০ দিনে ${d} বের হয়েছে`],
  [/^Materials for$/, () => 'কাঁচামাল আছে'],
  [/^(Margin|Landed cost|Customs clearance|Shipment steps) (.+)$/, (_, a, v) => `${core(a)} ${tokens(v)}`],
  [/^from ([A-Z][\w ]+)$/, (_, c) => `${c} থেকে`],
  [/^to ([A-Z][\w ]+)$/, (_, c) => `${c} এ`],
  [/^USD (.+)$/, (_, v) => `ডলার ${v}`],
  [/^(\d+) items? · open →$/, (_, d) => `${d}টি আইটেম · খুলুন →`],
  [/^(\d[\d,]*) days? left$/, (_, d) => `${d} দিন বাকি`],
  [/^Expired (\d[\d,]*) days ago$/, (_, d) => `${d} দিন আগে মেয়াদ শেষ`],
  [/^Expired (\d{1,2} [A-Z][a-z]{2})$/, (_, d) => `মেয়াদ শেষ ${tokens(d)}`],
  [/^Due in (\d+) days?$/, (_, d) => `${d} দিনের মধ্যে পরিশোধ`],
  [/^(\d+) days? overdue$/, (_, d) => `${d} দিন মেয়াদোত্তীর্ণ`],
  [/^(\d[\d,]*) days late$/, (_, d) => `${d} দিন দেরি`],
  [/^in (\d[\d,]*) days$/, (_, d) => `${d} দিনের মধ্যে`],
  [/^in ([\d,]+) km$/, (_, d) => `${d} কিমির মধ্যে`],
  [/^([\d,]+) km over$/, (_, d) => `${d} কিমি বেশি`],
  [/^About (\d+) days?$/, (_, d) => `প্রায় ${d} দিন`],
  [/^About (\d+) weeks$/, (_, d) => `প্রায় ${d} সপ্তাহ`],
  [/^About (\d+) months$/, (_, d) => `প্রায় ${d} মাস`],
  [/^Lasts: about (\d+) (day|days|weeks|months)$/, (_, d, u) => `চলবে: প্রায় ${d} ${u.startsWith('day') ? 'দিন' : u === 'weeks' ? 'সপ্তাহ' : 'মাস'}`],
  [/^(\d[\d,]*) (orders?)$/, (_, d) => `${d}টি অর্ডার`],
  [/^(\d[\d,]*) (invoices?)$/, (_, d) => `${d}টি ইনভয়েস`],
  [/^(\d[\d,]*) (trips?)$/, (_, d) => `${d}টি ট্রিপ`],
  [/^(\d[\d,]*) (bills?)( to pay)?$/, (_, d, __, p) => `${d}টি বিল${p ? ' পরিশোধ বাকি' : ''}`],
  [/^(\d[\d,]*) (dealers?)$/, (_, d) => `${d} জন ডিলার`],
  [/^(\d[\d,]*) (products?)( at cost)?$/, (_, d, __, c) => `${d}টি পণ্য${c ? ' (খরচ মূল্যে)' : ''}`],
  [/^(\d[\d,]*) items?$/, (_, d) => `${d}টি আইটেম`],
  [/^(\d[\d,]*) overdue$/, (_, d) => `${d} জনের মেয়াদ পেরিয়েছে`],
  [/^(\d[\d,]*) expired$/, (_, d) => `${d}টির মেয়াদ শেষ`],
  [/^(\d[\d,]*) due soon$/, (_, d) => `${d}টি শীঘ্রই`],
  [/^(\d[\d,]*) on the way now$/, (_, d) => `${d}টি এখন পথে`],
  [/^(\d[\d,]*) on the road now$/, (_, d) => `${d}টি এখন রাস্তায়`],
  [/^(\d[\d,]*) transporters? to pay$/, (_, d) => `${d} জন পরিবহনকারীকে পরিশোধ বাকি`],
  [/^(\d[\d,]*) papers? expired$/, (_, d) => `${d}টি কাগজের মেয়াদ শেষ`],
  [/^(\d+)% of target$/, (_, d) => `লক্ষ্যের ${d}%`],
  [/^(\d+)% of sales$/, (_, d) => `বিক্রির ${d}%`],
  [/^([\d.]+)% of sales this month$/, (_, d) => `এ মাসের বিক্রির ${d}%`],
  [/^(\d+)% margin$/, (_, d) => `${d}% মার্জিন`],
  [/^(\d+)% margin on cost of goods$/, (_, d) => `পণ্যের খরচের উপর ${d}% মার্জিন`],
  [/^profit (.+)$/, (_, v) => `লাভ ${tokens(v)}`],
  [/^Due (Tk .+)$/, (_, v) => `বাকি ${tokens(v)}`],
  [/^Valid to (.+)$/, (_, d) => `${tokens(d)} পর্যন্ত বৈধ`],
  [/^Today: (on the road|booked) · (TR-\d+) →$/, (_, s, id) => `আজ: ${s === 'booked' ? 'বুক করা' : 'রাস্তায়'} · ${id} →`],
  [/^(On the road|Booked) · (TR-\d+)$/, (_, s, id) => `${s === 'Booked' ? 'বুক করা' : 'রাস্তায়'} · ${id}`],
  [/^Trip (TR-\d+)$/, (_, id) => `ট্রিপ ${id}`],
  [/^Trip (TR-\d+) booked$/, (_, id) => `ট্রিপ ${id} বুক হয়েছে`],
  [/^Edit trip (TR-\d+)$/, (_, id) => `ট্রিপ ${id} এডিট`],
  [/^Last trip (.+)$/, (_, d) => `শেষ ট্রিপ ${tokens(d)}`],
  [/^and (\d[\d,]*) more$/, (_, d) => `আরও ${d}টি`],
  [/^Vehicles \((\d+)\)$/, (_, d) => `গাড়ি (${d})`],
  [/^Open \((\d+)\)$/, (_, d) => `চলমান (${d})`],
  [/^Archived \((\d+)\)$/, (_, d) => `আর্কাইভ (${d})`],
  [/^Low stock \((\d+)\)$/, (_, d) => `কম স্টক (${d})`],
  [/^Low \((\d+)\)$/, (_, d) => `কম (${d})`],
  [/^Showing (\d+) of (\d+)$/, (_, a, b) => `${b}টির মধ্যে ${a}টি দেখানো হচ্ছে`],
  [/^Service (late|due soon)$/, (_, s) => `সার্ভিস ${s === 'late' ? 'দেরি' : 'শীঘ্রই'}`],
  [/^Sales · (.+)$/, (_, p) => `বিক্রি · ${tokens(p)}`],
  [/^Daily sales · (.+)$/, (_, p) => `দৈনিক বিক্রি · ${tokens(p)}`],
  [/^Monthly sales · (.+)$/, (_, p) => `মাসিক বিক্রি · ${tokens(p)}`],
  [/^For ([A-Z][a-z]+ \d{4}|\d{4})$/, (_, p) => `${tokens(p)} এর জন্য`],
  [/^Every invoice in (.+)$/, (_, p) => `${tokens(p)} এর সব ইনভয়েস`],
  [/^Invoices on (.+)$/, (_, p) => `${tokens(p)} এর ইনভয়েস`],
  [/^Costs and trips for (.+)$/, (_, p) => `${tokens(p)} এর খরচ ও ট্রিপ`],
  [/^Driver ([A-Z][\w.'-]*(?: [A-Z][\w.'-]*)*)$/, (_, p) => `ড্রাইভার ${p}`],
  // chart axis ticks such as '2.5 L'
  [/^([\d.]+) (L|Cr)$/, (_, d, u) => `${d} ${u === 'L' ? 'লাখ' : 'কোটি'}`],
  [/^([\d.]+)K$/, (_, d) => `${d} হাজার`],
  [/^Last rate used Tk (.+) per USD$/, (_, r) => `সর্বশেষ রেট প্রতি ডলারে ৳${r}`],
  [/^(\d[\d,]*) cartons?$/, (_, d) => `${d} কার্টন`],
]

const DOT_RULES = RULES.filter(([re]) => re.source.includes('·'))
const PLAIN_RULES = RULES.filter(([re]) => !re.source.includes('·'))

/** Swap money, unit, month and weekday words inside a string. */
function tokens(s: string): string {
  let out = s
  for (const [re, bn] of BN_TOKENS) out = out.replace(re, bn)
  return out
}

function core(t: string): string {
  const exact = BN_PHRASES[t]
  if (exact !== undefined) return exact
  // "Driver:" style labels
  if (t.endsWith(':') && BN_PHRASES[t.slice(0, -1)] !== undefined) return BN_PHRASES[t.slice(0, -1)] + ':'
  // patterns that span a " · " go first, then the parts are translated one by one
  const ruled = (rules: Rule[]) => {
    for (const [re, fn] of rules) {
      const m = t.match(re)
      if (m) return fn(...m)
    }
    return null
  }
  const spanning = ruled(DOT_RULES)
  if (spanning !== null) return spanning
  if (t.includes(' · ')) return t.split(' · ').map((p) => core(p.trim())).join(' · ')
  const single = ruled(PLAIN_RULES)
  if (single !== null) return single
  // "Local supplier, Imported (LC)": a list of known words
  if (t.includes(', ')) {
    const parts = t.split(', ')
    if (parts.every((p) => BN_PHRASES[p] !== undefined)) return parts.map((p) => BN_PHRASES[p]).join(', ')
  }
  return tokens(t)
}

const cache = new Map<string, string>()

/** Bangla for one piece of English, keeping the spaces around it. */
export function translateBn(text: string): string {
  const hit = cache.get(text)
  if (hit !== undefined) return hit
  const lead = text.match(/^\s*/)?.[0] ?? ''
  const trail = text.match(/\s*$/)?.[0] ?? ''
  const t = text.trim()
  const out = t ? lead + core(t) + trail : text
  if (cache.size > 5000) cache.clear()
  cache.set(text, out)
  return out
}
