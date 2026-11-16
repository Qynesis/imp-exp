import { byId } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Button, Field, FormSheet, useConfirm, useForm, useSheetItem, useToast } from '@/ui'

/** Add a category, or rename, move or delete one when `categoryId` is given. */
export function AddCategorySheet({ categoryId }: { categoryId?: string } = {}) {
  const { db, act } = useBooks()
  const toast = useToast()
  const confirm = useConfirm()
  const { close } = useSheetItem()
  const cur = byId(db.categories, categoryId)
  const [v, , bind] = useForm({ name: cur?.name || '', parentId: cur?.parentId || '' })
  const hasSubs = !!cur && db.categories.some((c) => c.parentId === cur.id)
  const holds = cur ? db.products.filter((p) => p.categoryId === cur.id).length : 0
  const remove = async () => {
    if (!cur) return
    if (hasSubs || holds) return toast(hasSubs ? 'Delete or move its sub categories first' : `Move its ${holds} product${holds === 1 ? '' : 's'} to another category first`)
    if (!(await confirm({ title: `Delete ${cur.name}?`, confirmLabel: 'Delete category', destructive: true }))) return
    act('removeCategory', cur.id)
    toast('Category deleted')
    close()
  }
  return (
    <FormSheet title={cur ? 'Edit category' : 'Add category'} crumb="Products and stock" submit="Save category"
      note={cur ? undefined : 'Pick a parent to make this a sub category.'}
      onSubmit={() => {
        const name = v.name.trim()
        if (!name) return 'Enter the category name.'
        if (db.categories.some((c) => c.id !== cur?.id && c.name.toLowerCase() === name.toLowerCase() && (c.parentId || '') === v.parentId)) return `There is already a category called ${name} there.`
        if (cur) act('saveCategory', { id: cur.id, name, parentId: v.parentId || null })
        else act('addCategory', { name, parentId: v.parentId || null })
        toast(cur ? 'Category saved' : 'Category added')
      }}>
      <Field label="Category name"><input {...bind('name')} placeholder="e.g. Detergent" /></Field>
      <Field label="Parent category" hint={hasSubs ? 'It has sub categories, so it stays at the top level.' : undefined}>
        <select {...bind('parentId')} disabled={hasSubs}>
          <option value="">None (top level)</option>
          {db.categories.filter((c) => !c.parentId && c.id !== cur?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      {cur && (
        <div className="field wide">
          <Button icon="trash" variant="danger" size="sm" onClick={() => void remove()}>Delete category</Button>
          <small>{hasSubs || holds ? 'Only empty categories can be deleted.' : 'This category is empty and can be deleted.'}</small>
        </div>
      )}
    </FormSheet>
  )
}
