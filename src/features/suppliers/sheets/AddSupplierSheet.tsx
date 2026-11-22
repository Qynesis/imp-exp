import { byId, num, type CustomValues, type SupplierTerms } from '@shared/domain'
import { CustomFields } from '@/components/CustomFields'
import { PartyFields } from '@/components/PartyFields'
import { partyClean, partyForm } from '@/components/partyForm'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

/** Add a supplier, or change one: contact, full address, papers, bank and terms. */
export const AddSupplierSheet: SheetComponent<{ supplierId?: string; onSaved?: (id: string) => void }> = ({ supplierId, onSaved }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const cur = byId(db.suppliers, supplierId)
  const [v, set, bind, nbind] = useForm({
    name: cur?.name || '', contact: cur?.contact || '', phone: cur?.phone || '', address: cur?.address || '', goods: cur?.goods || '',
    terms: (cur?.terms || 'credit') as SupplierTerms, days: String(cur?.days ?? 30), opening: cur?.opening ? String(cur.opening) : '',
    custom: (cur?.custom || {}) as CustomValues, ...partyForm(cur),
  })
  return (
    <FormSheet title={cur ? `Edit ${cur.name}` : 'Add supplier'} crumb="Suppliers" submit={cur ? 'Save changes' : 'Save supplier'} onSubmit={() => {
      const { name, contact, phone, address, goods, terms, days, opening, custom, ...extra } = v
      const why = act('saveSupplier', {
        id: cur?.id, name: name.trim(), contact: contact.trim(), phone: phone.trim(), address: address.trim(), goods: goods.trim(),
        terms, days: terms === 'credit' ? num(days) : 0, opening: num(opening), custom, ...partyClean(extra),
      })
      if (why) return why
      toast(cur ? 'Supplier saved' : 'Supplier added')
      if (onSaved) setTimeout(() => onSaved(cur?.id || name.trim().toLowerCase()), 0)
    }}>
      <Field label="Supplier name"><input {...bind('name')} placeholder="Business name" /></Field>
      <Field label="Contact person"><input {...bind('contact')} placeholder="Full name" /></Field>
      <Field label="Phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXX-XXXXXX" /></Field>
      <Field label="Goods supplied"><input {...bind('goods')} placeholder="e.g. Coil powder" /></Field>
      <Field label="Address" wide><input {...bind('address')} placeholder="House, road, market or office" /></Field>
      <Field label="Payment terms">
        <select {...bind('terms')}>
          <option value="credit">Credit</option>
          <option value="cash">Cash</option>
        </select>
      </Field>
      {v.terms === 'credit' && <Field label="Credit days"><input {...nbind('days')} placeholder="30" /></Field>}
      {!cur && <Field label="Opening balance we owe (Tk)"><input {...nbind('opening')} placeholder="0" /></Field>}
      <PartyFields bind={bind} kind="supplier" />
      <CustomFields entity="supplier" value={v.custom} onChange={(c) => set('custom', c)} />
    </FormSheet>
  )
}
