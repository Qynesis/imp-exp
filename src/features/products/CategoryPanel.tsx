import type { Db, Product } from '@shared/domain'
import { inCategory } from '@shared/domain'
import { Card, cls } from '@/ui'

/**
 * Categories and sub categories with how many of `items` each holds. Categories that only hold
 * other kinds of product are left out; empty ones stay so new categories can be filled.
 */
export function CategoryPanel({ db, items, value, onChange, allLabel, onEdit }: { db: Db; items: Product[]; value: string; onChange: (id: string) => void; allLabel: string; onEdit?: (id: string) => void }) {
  const count = (id: string) => items.filter((p) => inCategory(db, p, id)).length
  const holdsOthers = (id: string) => db.products.some((p) => inCategory(db, p, id))
  const show = (id: string) => count(id) > 0 || !holdsOthers(id) || value === id
  const button = (id: string, name: string, sub = false) => (
    <button key={id} type="button" className={cls('cat', sub && 'sub', value === id && 'active')} onClick={() => onChange(id)} aria-pressed={value === id}>
      <span>{name}</span>
      <span className="t-muted">{id ? count(id) : items.length}</span>
    </button>
  )
  return (
    <Card title="Categories" className="cat-card" action={value && onEdit ? <button type="button" className="link edit-only" onClick={() => onEdit(value)}>Edit</button> : undefined}>
      <div className="cat-list">
        {button('', allLabel)}
        {db.categories.filter((t) => !t.parentId && show(t.id)).map((t) => (
          <div key={t.id} className="cat-group">
            {button(t.id, t.name)}
            {db.categories.filter((c) => c.parentId === t.id && show(c.id)).map((c) => button(c.id, c.name, true))}
          </div>
        ))}
      </div>
    </Card>
  )
}
