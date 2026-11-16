import { CUSTOM_ENTITIES, FIELD_TYPES, type CustomEntity, type FieldType } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, useForm, useToast } from '@/ui'

export function CustomFieldSheet() {
  const { act } = useBooks()
  const toast = useToast()
  const [v, , bind] = useForm({ entity: 'product' as CustomEntity, label: '', type: 'text' as FieldType, options: '' })
  return (
    <FormSheet title="Add custom field" crumb="Users, roles and settings" submit="Add field"
      note="The field appears in the add and edit forms for that kind of record straight away."
      onSubmit={() => {
        if (!v.label.trim()) return 'Give the field a name.'
        const options = v.options.split(',').map((o) => o.trim()).filter(Boolean)
        if (v.type === 'select' && options.length < 2) return 'List at least two choices, separated by commas.'
        act('addField', { entity: v.entity, label: v.label.trim(), type: v.type, options: v.type === 'select' ? options : [] })
        toast('Field added')
      }}>
      <Field label="Show on">
        <select {...bind('entity')}>{Object.entries(CUSTOM_ENTITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      <Field label="Kind of field">
        <select {...bind('type')}>{Object.entries(FIELD_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      <Field label="Field name" wide><input {...bind('label')} placeholder="e.g. Voltage, Shelf life, Colour" /></Field>
      {v.type === 'select' && <Field label="Choices, separated by commas" wide><input {...bind('options')} placeholder="e.g. Red, Blue, Green" /></Field>}
    </FormSheet>
  )
}
