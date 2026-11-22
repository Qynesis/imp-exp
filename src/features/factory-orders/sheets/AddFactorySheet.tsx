import { byId } from '@shared/domain'
import { PartyFields } from '@/components/PartyFields'
import { partyClean, partyForm } from '@/components/partyForm'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast, type SheetComponent } from '@/ui'

/** Add a factory, or change one: contact, full address, papers and bank. */
export const AddFactorySheet: SheetComponent<{ factoryId?: string; onSaved?: (id: string) => void }> = ({ factoryId, onSaved }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const cur = byId(db.factories, factoryId)
  const [v, , bind] = useForm({ name: cur?.name || '', contact: cur?.contact || '', phone: cur?.phone || '', address: cur?.address || '', makes: cur?.makes || '', ...partyForm(cur) })
  return (
    <FormSheet title={cur ? `Edit ${cur.name}` : 'Add factory'} crumb="Factories" submit={cur ? 'Save changes' : 'Save factory'} onSubmit={() => {
      const { name, contact, phone, address, makes, ...extra } = v
      const why = act('saveFactory', { id: cur?.id, name, contact: contact.trim(), phone: phone.trim(), address: address.trim(), makes: makes.trim(), archived: cur?.archived, ...partyClean(extra) })
      if (why) return why
      toast(cur ? 'Factory saved' : 'Factory added')
      // the new id is only known once saved: find it by its (unique) name
      if (onSaved) setTimeout(() => onSaved(cur?.id || name.trim().toLowerCase()), 0)
    }}>
      <Field label="Factory name"><input {...bind('name')} placeholder="Business name" /></Field>
      <Field label="Contact person"><input {...bind('contact')} placeholder="Full name" /></Field>
      <Field label="Phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXX-XXXXXX" /></Field>
      <Field label="What they make"><input {...bind('makes')} placeholder="e.g. Mosquito coil, PET bottles" /></Field>
      <Field label="Factory address" wide><input {...bind('address')} placeholder="Plot, road, industrial area" /></Field>
      <PartyFields bind={bind} kind="factory" />
    </FormSheet>
  )
}
