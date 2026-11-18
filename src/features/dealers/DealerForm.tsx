/** The dealer fields, shared by the New dealer card and the Edit dealer sheet. */
import type { Db } from '@shared/domain'
import { CustomFields } from '@/components/CustomFields'
import { Field, type FormBinder, type FormSetter } from '@/ui'
import type { DealerFormValues } from './dealerFormModel'

export function DealerFields({ db, v, set, bind, nbind, idPrefix }: {
  db: Db
  v: DealerFormValues
  set: FormSetter<DealerFormValues>
  bind: FormBinder<DealerFormValues>
  nbind: FormBinder<DealerFormValues>
  /** Keeps radio groups apart when two dealer forms are on screen. */
  idPrefix: string
}) {
  return (
    <>
      <Field label="Shop or business name" wide><input {...bind('name')} placeholder="e.g. Rahman Traders" /></Field>
      <Field label="Owner name"><input {...bind('owner')} placeholder="Full name" /></Field>
      <Field label="Phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXX-XXXXXX" /></Field>
      <Field label="Area"><input {...bind('area')} placeholder="Market or thana" /></Field>
      <Field label="Opening due (Tk)"><input {...nbind('opening')} placeholder="Amount already owed, if any" /></Field>
      <Field label="Address" wide><input {...bind('address')} placeholder="Shop address" /></Field>
      <fieldset className="field wide radio-set">
        <legend className="field-label">Payment terms</legend>
        <label><input type="radio" name={idPrefix + 'terms'} checked={v.terms === 'cod'} onChange={() => set('terms', 'cod')} /> Cash on delivery only</label>
        <label><input type="radio" name={idPrefix + 'terms'} checked={v.terms === 'credit'} onChange={() => set('terms', 'credit')} /> Credit allowed</label>
      </fieldset>
      {v.terms === 'credit' && (
        <>
          <Field label="Credit limit (Tk)"><input {...nbind('limit')} placeholder="1,00,000" /></Field>
          <Field label="Credit days"><input {...nbind('days')} placeholder="30" /></Field>
        </>
      )}
      <Field label="Assigned sales employee" wide>
        <select {...bind('salesId')}>
          <option value="">Office sale (no one assigned)</option>
          {db.employees.filter((e) => e.payType === 'sales').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </Field>
      <label className="check field wide"><input type="checkbox" checked={v.courier} onChange={(e) => set('courier', e.target.checked)} /> Deliver by courier (parcels can be booked for this dealer by themselves)</label>
      <CustomFields entity="dealer" value={v.custom} onChange={(c) => set('custom', c)} />
    </>
  )
}
