import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

export function AddFactorySheet() {
  const { act } = useBooks()
  const toast = useToast()
  const [v, , bind] = useForm({ name: '', contact: '', phone: '', address: '', makes: '' })
  return (
    <FormSheet title="Add factory" crumb="Factory orders" submit="Save factory" onSubmit={() => {
      if (!v.name.trim()) return 'Enter the factory name.'
      act('addFactory', { ...v, name: v.name.trim() })
      toast('Factory added')
    }}>
      <Field label="Factory name"><input {...bind('name')} placeholder="Business name" /></Field>
      <Field label="Contact person"><input {...bind('contact')} placeholder="Full name" /></Field>
      <Field label="Phone"><input {...bind('phone')} inputMode="tel" placeholder="01XXX-XXXXXX" /></Field>
      <Field label="What they make"><input {...bind('makes')} placeholder="e.g. Mosquito coil" /></Field>
      <Field label="Address" wide><input {...bind('address')} placeholder="Factory address" /></Field>
    </FormSheet>
  )
}
