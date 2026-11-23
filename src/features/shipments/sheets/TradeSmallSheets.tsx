import { byId, defaultTrade, fmt, num, tk, todayISO, moneySymbol } from '@shared/domain'
import { MethodSelect } from '@/components/MethodSelect'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

/** A tracking update: sailed, transhipped, berthed, at the land port, released… */
export const TrackEventSheet: SheetComponent<{ importId: string }> = ({ importId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const s = byId(db.imports, importId)
  const [v, , bind] = useForm({ date: todayISO(), place: '', text: '' })
  if (!s) return null
  const ports = [s.trade?.loadPort, s.trade?.dischargePort, s.customs?.port].filter(Boolean) as string[]
  return (
    <FormSheet title={`Tracking update · ${s.id}`} crumb="Import and export" submit="Add update" onSubmit={() => {
      const why = act('addTrackEvent', { importId, date: v.date, place: v.place, text: v.text })
      if (why) return why
      toast('Update added')
    }}>
      <Field label="Date"><input type="date" {...bind('date')} /></Field>
      <Field label="Where"><input {...bind('place')} list="track-places" placeholder="e.g. Colombo" /></Field>
      <Field label="What happened" wide><input {...bind('text')} placeholder="e.g. Transhipped to feeder vessel, berthed at CCT, truck crossed the border" /></Field>
      <datalist id="track-places">{[...new Set(ports)].map((p) => <option key={p} value={p} />)}</datalist>
    </FormSheet>
  )
}

/** Export money received at the bank: all or part, at the bank's rate. */
export const RealiseSheet: SheetComponent<{ importId: string }> = ({ importId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const s = byId(db.imports, importId)
  const t = { ...defaultTrade('export'), ...s?.trade }
  const left = s ? Math.max(s.usd - (t.realisedFc || 0), 0) : 0
  const [v, , bind, nbind] = useForm({ date: todayISO(), amount: left ? String(left) : '', rate: s ? String(s.rate) : '', charge: '', method: 'Bank transfer' })
  if (!s) return null
  const tkNow = num(v.amount) * num(v.rate)
  return (
    <FormSheet title={`Money received · ${s.id}`} crumb="Import and export" submit="Record"
      note={`${t.currency} ${fmt(s.usd)} invoiced · ${t.currency} ${fmt(t.realisedFc || 0)} received so far · ${t.currency} ${fmt(left)} to come`}
      onSubmit={() => {
        const why = act('realiseExport', { importId, date: v.date, amountFc: num(v.amount), rate: num(v.rate), bankCharge: num(v.charge) || undefined, method: v.method })
        if (why) return why
        toast(`${t.currency} ${fmt(num(v.amount))} recorded`)
      }}>
      <Field label="Received on"><input type="date" {...bind('date')} /></Field>
      <Field label={`Amount (${t.currency})`}><input {...nbind('amount')} /></Field>
      <Field label={`Bank's rate (${moneySymbol()} per ${t.currency})`} hint={tkNow > 0 ? `= ${tk(tkNow)}` : undefined}><input {...nbind('rate')} /></Field>
      <Field label="Bank charge (Tk)"><input {...nbind('charge')} placeholder="0" /></Field>
      <Field label="Paid into"><MethodSelect {...bind('method')} /></Field>
    </FormSheet>
  )
}
