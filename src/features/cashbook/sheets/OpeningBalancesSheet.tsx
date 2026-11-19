import { ACCOUNTS, num, tk } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

/** What was in each account when the company started using the software. */
export const OpeningBalancesSheet: SheetComponent<object> = () => {
  const { db, act } = useBooks()
  const toast = useToast()
  const others = db.openingAccounts || {}
  const otherSum = Object.values(others).reduce((a, b) => a + b, 0)
  const [v, , , nbind] = useForm(() => Object.fromEntries(ACCOUNTS.map((a) => [a, String(a === 'Cash' ? (db.openingCash || 0) - otherSum : others[a] || 0)])) as Record<(typeof ACCOUNTS)[number], string>)
  const total = ACCOUNTS.reduce((s, a) => s + num(v[a]), 0)
  return (
    <FormSheet title="Opening balances" crumb="Cashbook and dues" submit="Save balances"
      note="Money in each account on the day you started keeping books here. Every balance after that is worked out from the entries."
      onSubmit={() => {
        const why = act('setOpeningBalances', Object.fromEntries(ACCOUNTS.map((a) => [a, num(v[a])])))
        if (why) return why
        toast(`Opening balances saved: ${tk(total)} in all`)
      }}>
      {ACCOUNTS.map((a) => <Field key={a} label={`${a === 'Cash' ? 'Cash in hand' : a} (Tk)`}><input {...nbind(a)} placeholder="0" /></Field>)}
      <p className="tight wide-note"><b>Total {tk(total)}</b></p>
    </FormSheet>
  )
}
