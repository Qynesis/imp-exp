import type { ChangeEvent } from 'react'
import { fullAddress, siteStock, type Db } from '@shared/domain'
import { Field } from '@/ui'

/** The warehouse goods go into. The main one is chosen first; nothing shows while there is only one. */
export function SitePicker({ db, bind, label = 'Into warehouse' }: { db: Db; bind: { value: string; onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void; className: string }; label?: string }) {
  const { sites } = siteStock(db)
  if (sites.length < 2) return null
  const cur = sites.find((w) => w.id === bind.value)
  return (
    <Field label={label} hint={cur ? fullAddress(cur) || undefined : undefined}>
      <select {...bind}>
        {sites.map((w, i) => <option key={w.id} value={w.id}>{w.code ? `${w.code} · ` : ''}{w.name}{i === 0 ? ' (main)' : ''}</option>)}
      </select>
    </Field>
  )
}

