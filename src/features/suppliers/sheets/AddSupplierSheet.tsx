import { num, type CustomValues, type SupplierTerms } from '@shared/domain'
import { CustomFields } from '@/components/CustomFields'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

export function AddSupplierSheet() {
  const { act } = useBooks()
  const toast = useToast()
  const [v, set, bind, nbind] = useForm({
    name: '', contact: '', phone: '', address: '', goods: '', terms: 'credit' as SupplierTerms, days: '30', opening: '', custom: {} as CustomValues,
  })
  return (
    <FormSheet title="Add supplier" crumb="Suppliers" submit="Save supplier" onSubmit={() => {
      if (!v.name.trim()) return 'Enter the supplier name.'
      act('addSupplier', { ...v, name: v.name.trim(), days: v.terms === 'credit' ? num(v.days) : 0, opening: num(v.opening) })
      toast('Supplier added')
    }}>
      <Field label="Supplier name"><input {...bind('name')} placeholder="Business name" /></Field>
      <Field label="Contact person"><input {...bind('contact')} placeholder="Full name" /></Field>
      <Field label="Phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXX-XXXXXX" /></Field>
      <Field label="Address"><input {...bind('address')} placeholder="Shop or office address" /></Field>
      <Field label="Goods supplied"><input {...bind('goods')} placeholder="e.g. Coil powder" /></Field>
      <Field label="Payment terms">
        <select {...bind('terms')}>
          <option value="credit">Credit</option>
          <option value="cash">Cash</option>
        </select>
      </Field>
      {v.terms === 'credit' && <Field label="Credit days"><input {...nbind('days')} placeholder="30" /></Field>}
      <Field label="Opening balance we owe (Tk)"><input {...nbind('opening')} placeholder="0" /></Field>
      <CustomFields entity="supplier" value={v.custom} onChange={(c) => set('custom', c)} />
    </FormSheet>
  )
}
