import { fdate, type CustomEntity, type CustomValues, type Db } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field } from '@/ui'

/** Extra fields the admin defined for this kind of record. Renders inside a form grid. */
export function CustomFields({ entity, value, onChange }: { entity: CustomEntity; value: CustomValues | undefined; onChange: (next: CustomValues) => void }) {
  const { db } = useBooks()
  const val = value || {}
  const upd = (id: string, x: string) => onChange({ ...val, [id]: x })
  return db.fieldDefs
    .filter((f) => f.entity === entity)
    .map((f) => (
      <Field key={f.id} label={f.label}>
        {f.type === 'select' ? (
          <select className="in" value={val[f.id] || ''} onChange={(e) => upd(f.id, e.target.value)}>
            <option value="">Not set</option>
            {f.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        ) : (
          <input className="in" type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} value={val[f.id] || ''} onChange={(e) => upd(f.id, e.target.value)} />
        )}
      </Field>
    ))
}

function customValues(db: Db, entity: CustomEntity, record: { custom?: CustomValues }) {
  return db.fieldDefs
    .filter((f) => f.entity === entity && record.custom?.[f.id])
    .map((f) => ({ id: f.id, label: f.label, value: f.type === 'date' ? fdate(record.custom?.[f.id]) : record.custom?.[f.id] }))
}

/** Filled-in extra fields, read-only. Renders nothing when there are none. */
export function CustomView({ entity, record, inline }: { entity: CustomEntity; record: { custom?: CustomValues }; inline?: boolean }) {
  const { db } = useBooks()
  const vals = customValues(db, entity, record)
  if (!vals.length) return null
  if (inline) return <span>{vals.map((x) => `${x.label}: ${x.value}`).join(' · ')}</span>
  return (
    <div className="kv-list">
      {vals.map((x) => (
        <div className="kv" key={x.id}>
          <span className="t-muted">{x.label}</span>
          <span>{x.value}</span>
        </div>
      ))}
    </div>
  )
}
