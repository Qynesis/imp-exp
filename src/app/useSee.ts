import { canSee } from '@shared/domain'
import { useBooks } from '@/core/store/context'

/** What this person may see beyond screens: buying prices and costs, and profit. */
export function useSee() {
  const { db, session } = useBooks()
  return { cost: canSee(db, session.userId, 'cost'), profit: canSee(db, session.userId, 'profit') }
}
