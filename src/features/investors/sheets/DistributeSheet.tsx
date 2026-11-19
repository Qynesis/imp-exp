import { fmt, num, profitPool, splitProfit, tk, todayISO, byId } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

/** Share profit out among active investors by ownership. Nothing is paid yet: each investor's share waits until paid or reinvested. */
export const DistributeSheet: SheetComponent<object> = () => {
  const { db, act } = useBooks()
  const toast = useToast()
  const pool = profitPool(db)
  const [v, set, bind, nbind] = useForm({ amount: pool.pool > 0 ? String(Math.floor(pool.pool)) : '', period: '', note: '', date: todayISO() })
  const amount = num(v.amount)
  const parts = amount > 0 ? splitProfit(db, amount) : []
  return (
    <FormSheet title="Distribute profit" crumb="Investors" submit="Distribute"
      note={<>Profit not yet shared out: <b className={pool.pool > 0 ? 't-good' : 't-warn'}>{tk(pool.pool)}</b> (all-time net profit {tk(pool.total)}, less {tk(pool.distributed)} already shared). Shares are by each investor’s capital today.</>}
      onSubmit={() => {
        if (!v.period.trim()) return 'Say what period the profit is for, e.g. January to June 2026.'
        const why = act('distributeProfit', { amount, period: v.period.trim(), note: v.note.trim(), date: v.date })
        if (why) return why
        toast(`${tk(amount)} shared among ${parts.length} investor${parts.length === 1 ? '' : 's'}`)
      }}>
      <Field label="Amount to share (Tk)" hint={pool.pool > 0 ? <button type="button" className="link" onClick={() => set('amount', String(pool.pool))}>All of it: {tk(pool.pool)}</button> : undefined}><input {...nbind('amount')} placeholder="0" /></Field>
      <Field label="For the period"><input {...bind('period')} placeholder="e.g. January to June 2026" /></Field>
      <Field label="Date"><input type="date" {...bind('date')} max={todayISO()} /></Field>
      <Field label="Note"><input {...bind('note')} placeholder="Board decision, meeting…" /></Field>
      {parts.length > 0 && (
        <div className="kv-list boxed wide-note">
          {parts.map((p) => (
            <div key={p.investorId} className="kv"><span>{byId(db.investors || [], p.investorId)?.name} <small className="t-muted">· {fmt(p.ownership * 100)}%</small></span><span>{tk(p.amount)}</span></div>
          ))}
        </div>
      )}
      {amount > 0 && !parts.length && <p className="t-warn tight wide-note">No active investor has capital in the business yet.</p>}
    </FormSheet>
  )
}
