import { byId } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

/** Add a factory, or change one. */
export const AddFactorySheet: SheetComponent<{ factoryId?: string }> = ({ factoryId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const cur = byId(db.factories, factoryId)
  const [v, , bind] = useForm({ name: cur?.name || '', contact: cur?.contact || '', phone: cur?.phone || '', email: cur?.email || '', address: cur?.address || '', makes: cur?.makes || '', note: cur?.note || '' })
  return (
    <FormSheet title={cur ? `Edit ${cur.name}` : 'Add factory'} crumb="Factories" submit={cur ? 'Save changes' : 'Save factory'} onSubmit={() => {
      const why = act('saveFactory', { id: cur?.id, name: v.name, contact: v.contact.trim(), phone: v.phone.trim(), email: v.email.trim(), address: v.address.trim(), makes: v.makes.trim(), note: v.note.trim(), archived: cur?.archived })
      if (why) return why
      toast(cur ? 'Factory saved' : 'Factory added')
    }}>
      <Field label="Factory name"><input {...bind('name')} placeholder="Business name" /></Field>
      <Field label="Contact person"><input {...bind('contact')} placeholder="Full name" /></Field>
      <Field label="Phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXX-XXXXXX" /></Field>
      <Field label="Email"><input {...bind('email')} inputMode="email" placeholder="name@factory.com" /></Field>
      <Field label="What they make"><input {...bind('makes')} placeholder="e.g. Mosquito coil, PET bottles" /></Field>
      <Field label="Address" wide><input {...bind('address')} placeholder="Factory address" /></Field>
      <Field label="Note" wide><input {...bind('note')} placeholder="Payment terms, minimum order, quality notes…" /></Field>
    </FormSheet>
  )
}
