import { useState } from 'react'
import { byId, PAGES, roleLevel, SEE_KEYS, type AccessLevel, type Permissions, type SeeKey } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { Field, FormSheet, Segmented, useToast, type SegmentOption } from '@/ui'

const LEVELS: SegmentOption<AccessLevel>[] = [{ value: 'none', label: 'None' }, { value: 'view', label: 'View' }, { value: 'edit', label: 'Edit' }]

/** Create a role or change which screens it may view or edit. */
export function RoleSheet({ roleId }: { roleId?: string }) {
  const { db, act } = useBooks()
  const toast = useToast()
  const cur = byId(db.roles, roleId)
  const [name, setName] = useState(cur?.name || '')
  const [perms, setPerms] = useState<Permissions>(() => (cur ? Object.fromEntries(PAGES.map(([p]) => [p, roleLevel(cur, p)])) : {}))
  const [see, setSee] = useState<Partial<Record<SeeKey, boolean>>>(() => ({ cost: cur?.see?.cost ?? cur?.id === 'accountant', profit: cur?.see?.profit ?? cur?.id === 'accountant' }))
  return (
    <FormSheet title={cur ? `Edit role · ${cur.name}` : 'Add role'} crumb="Users, roles and settings" submit="Save role" wide
      note="View lets the role open a screen and read it. Edit also lets them add and change things there."
      onSubmit={() => {
        if (!name.trim()) return 'Give the role a name.'
        if (!Object.values(perms).some((l) => l && l !== 'none')) return 'Give the role access to at least one screen.'
        act('saveRole', { id: cur?.id, name: name.trim(), perms, see })
        toast('Role saved')
      }}>
      <Field label="Role name" wide><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Customs officer" /></Field>
      <div className="field wide">
        <span className="field-label">Special permissions</span>
        <div className="perm-see">
          {SEE_KEYS.map((k) => (
            <label key={k.key}>
              <input type="checkbox" checked={!!see[k.key]} onChange={(e) => setSee((s) => ({ ...s, [k.key]: e.target.checked }))} />
              <span>{k.label}<small>{k.hint}. Without it the figures show as •••.</small></span>
            </label>
          ))}
        </div>
      </div>
      <div className="field wide">
        <span className="field-label">Access to each screen</span>
        <div className="perm-list">
          {PAGES.map(([page, label]) => (
            <div className="perm" key={page}>
              <span>{label}</span>
              <Segmented<AccessLevel> label={label} value={perms[page] || 'none'} onChange={(l) => setPerms((p) => ({ ...p, [page]: l }))} options={LEVELS} />
            </div>
          ))}
        </div>
      </div>
    </FormSheet>
  )
}
