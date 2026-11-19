import { assetCalc, byId, num, tk, todayISO } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

/** Sell or scrap an asset. */
export const DisposeSheet: SheetComponent<{ assetId: string }> = ({ assetId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const a = byId(db.assets || [], assetId)
  const [v, , bind, nbind] = useForm({ date: todayISO(), amount: '', method: 'Cash', note: '' })
  if (!a) return null
  const c = assetCalc(a)
  const gain = num(v.amount) - c.nbv
  return (
    <FormSheet title={`Sell or scrap ${a.name}`} crumb={a.id} submit="Dispose asset"
      note={<>Its book value is <b>{tk(c.nbv)}</b>. Selling for more is a profit, for less a loss, shown in profit and loss for that month. Book this month’s depreciation first if it is due.</>}
      onSubmit={() => {
        const why = act('disposeAsset', { id: a.id, date: v.date, amount: num(v.amount), method: v.method, note: v.note.trim() })
        if (why) return why
        toast(`${a.name} disposed`)
      }}>
      <Field label="Date"><input type="date" {...bind('date')} max={todayISO()} /></Field>
      <Field label="Sold for (Tk)" hint="Leave 0 when scrapped or thrown away"><input {...nbind('amount')} placeholder="0" /></Field>
      {num(v.amount) > 0 && <Field label="Money received in"><MethodSelect {...bind('method')} /></Field>}
      <Field label="Note"><input {...bind('note')} placeholder="Buyer, reason…" /></Field>
      {v.amount !== '' && <p className={`tight wide-note ${gain < 0 ? 't-warn' : 't-good'}`}>{gain >= 0 ? `Profit on sale: ${tk(gain)}` : `Loss on sale: ${tk(-gain)}`}</p>}
    </FormSheet>
  )
}
