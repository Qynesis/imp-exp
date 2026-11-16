import { useMemo } from 'react'
import { byId, levelFor, type AccessLevel, type PageId } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { FEATURES, TAB_COUNT, TAB_PRIORITY, featureById, type FeatureDef, type NavGroup } from './features'

/** What the signed-in user may open, grouped for the menu. */
export function useAccess() {
  const { db, session } = useBooks()
  return useMemo(() => {
    const level = (id: PageId): AccessLevel => levelFor(db, session.userId, id)
    const allowed = FEATURES.filter((f) => level(f.id) !== 'none')
    const groups: { title?: NavGroup; items: FeatureDef[] }[] = []
    for (const f of allowed) {
      const last = groups[groups.length - 1]
      if (last && last.title === f.group) last.items.push(f)
      else groups.push({ title: f.group, items: [f] })
    }
    const tabs = TAB_PRIORITY.filter((id) => level(id) !== 'none').slice(0, TAB_COUNT).map((id) => featureById(id)).filter((f): f is FeatureDef => !!f?.tab)
    return { user: byId(db.users, session.userId), level, allowed, groups, tabs, first: allowed[0] }
  }, [db, session.userId])
}
