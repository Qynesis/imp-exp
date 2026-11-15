import { fdate } from './lib/format.js'
import { useStore } from './lib/store.jsx'
import { Field } from './ui.jsx'

/** Extra fields the admin has defined for this kind of record. Lives inside a form grid. */
export function CustomFields({ entity, v, set }) {
  const { db } = useStore()
  const defs = db.fieldDefs.filter((f) => f.entity === entity)
  const val = v.custom || {}
  const upd = (id, x) => set('custom', { ...val, [id]: x })
  return defs.map((f) => (
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

// eslint-disable-next-line react-refresh/only-export-components
export function customValues(db, entity, record) {
  return db.fieldDefs
    .filter((f) => f.entity === entity && record?.custom?.[f.id])
    .map((f) => ({ id: f.id, label: f.label, value: f.type === 'date' ? fdate(record.custom[f.id]) : record.custom[f.id] }))
}

/** Read-only label/value lines for the filled-in extra fields. Renders nothing when there are none. */
export function CustomView({ entity, record, inline }) {
  const { db } = useStore()
  const vals = customValues(db, entity, record)
  if (!vals.length) return null
  if (inline) return <span>{vals.map((x) => `${x.label}: ${x.value}`).join(' · ')}</span>
  return (
    <div className="kv-list">
      {vals.map((x) => <div className="kv" key={x.id}><span className="t-muted">{x.label}</span><span>{x.value}</span></div>)}
    </div>
  )
}
