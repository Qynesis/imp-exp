import { byId, canReceive } from '@shared/domain'
import { useBooks } from '@/core/store/context'

/** Whether the signed-in person may confirm goods in, and who can when they cannot. */
export function useReceiveAccess() {
  const { db, session } = useBooks()
  const can = canReceive(db, session.userId)
  const who = db.users.filter((u) => canReceive(db, u.id)).map((u) => u.name)
  return { can, who, me: byId(db.users, session.userId)?.name || '' }
}
