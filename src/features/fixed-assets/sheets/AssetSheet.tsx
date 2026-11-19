import { ASSET_CATEGORIES, byId, DEPRECIATION_METHODS, monthlyDepreciation, num, tk, todayISO, type DepreciationMethod } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

/** Add a fixed asset, or change one. A new asset paid from company money shows in the cashbook. */
export const AssetSheet: SheetComponent<{ assetId?: string }> = ({ assetId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const cur = byId(db.assets || [], assetId)
  const locked = !!cur?.depreciation.length
  const [v, , bind, nbind] = useForm(() => ({
    name: cur?.name || '', category: cur?.category || 'Machinery', location: cur?.location || '', vendor: cur?.vendor || '',
    date: cur?.date || todayISO(), cost: cur ? String(cur.cost) : '', salvage: cur ? String(cur.salvage) : '0',
    method: (cur?.method || 'straight') as string, lifeYears: cur ? String(Math.round((cur.lifeMonths / 12) * 100) / 100) : '5', rate: cur ? String(cur.rate) : '20',
    paid: cur ? (cur.paidFrom ? 'yes' : 'no') : 'yes', paidFrom: cur?.paidFrom || 'Cash', note: cur?.note || '',
  }))
  const method = v.method as DepreciationMethod
  const cost = num(v.cost)
  const preview = cost > 0 ? monthlyDepreciation({ cost, salvage: num(v.salvage), method, lifeMonths: Math.round(num(v.lifeYears) * 12), rate: num(v.rate) }, cost) : 0
  return (
    <FormSheet title={cur ? `Edit ${cur.id}` : 'Add fixed asset'} crumb="Fixed assets" submit={cur ? 'Save changes' : 'Add asset'}
      note={locked ? 'Depreciation is already booked on this asset, so its date, cost and life are fixed. Undo the depreciation to change them.' : undefined}
      onSubmit={() => {
        const why = act('saveAsset', {
          id: cur?.id, name: v.name.trim(), category: v.category, location: v.location.trim(), vendor: v.vendor.trim(), date: v.date, cost, salvage: num(v.salvage),
          method, lifeMonths: method === 'straight' ? Math.round(num(v.lifeYears) * 12) : 0, rate: method === 'declining' ? num(v.rate) : 0,
          paidFrom: v.paid === 'yes' ? v.paidFrom : '', note: v.note.trim(),
        })
        if (why) return why
        toast(cur ? 'Asset saved' : `Fixed asset added${v.paid === 'yes' ? `: ${tk(cost)} paid from ${v.paidFrom}` : ''}`)
      }}>
      <Field label="Asset name" wide><input {...bind('name')} placeholder="e.g. Sewing machine, Office computer" /></Field>
      <Field label="Category">
        <select {...bind('category')}>{ASSET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      </Field>
      <Field label="Bought on"><input type="date" {...bind('date')} max={todayISO()} disabled={locked} /></Field>
      <Field label="Cost (Tk)"><input {...nbind('cost')} placeholder="0" disabled={locked} /></Field>
      <Field label="Scrap value at the end (Tk)" hint="What it will still sell for when worn out"><input {...nbind('salvage')} placeholder="0" disabled={locked} /></Field>
      <Field label="Depreciation">
        <select {...bind('method')} disabled={locked}>{Object.entries(DEPRECIATION_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      {method === 'straight' && <Field label="Useful life (years)"><input {...nbind('lifeYears')} disabled={locked} /></Field>}
      {method === 'declining' && <Field label="Rate per year (%)"><input {...nbind('rate')} disabled={locked} /></Field>}
      {preview > 0 && <p className="t-muted tight wide-note">About {tk(preview)} a month comes off its value{method === 'declining' ? ' at first, less each month after' : ''}.</p>}
      {!cur && (
        <Field label="Paid from company money?">
          <select {...bind('paid')}>
            <option value="yes">Yes, it goes in the cashbook</option>
            <option value="no">No, already owned or a gift</option>
          </select>
        </Field>
      )}
      {v.paid === 'yes' && <Field label="Paid from"><MethodSelect {...bind('paidFrom')} disabled={locked} /></Field>}
      <Field label="Bought from"><input {...bind('vendor')} placeholder="Shop or supplier" /></Field>
      <Field label="Kept at"><input {...bind('location')} placeholder="Factory floor, head office…" /></Field>
      <Field label="Note" wide><input {...bind('note')} placeholder="Serial number, warranty…" /></Field>
    </FormSheet>
  )
}
