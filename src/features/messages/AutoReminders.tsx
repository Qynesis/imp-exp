import { useEffect, useRef } from 'react'
import { addDays, dealerLedger, receivables, todayISO } from '@shared/domain'
import { useAccess } from '@/app/useAccess'
import { useBooks } from '@/core/store/context'
import { useMessaging, vars } from './useMessaging'

/**
 * Once a day, while someone who may send messages is signed in, remind each overdue dealer who has
 * not had a reminder in the last few days. Only channels that send by themselves are used.
 */
export function AutoReminders() {
  const { db, act } = useBooks()
  const { level } = useAccess()
  const msg = useMessaging()
  const ran = useRef(false)
  const s = msg.settings
  const today = todayISO()
  // WhatsApp in link mode needs a person to press send, so it never goes on its own
  const chans = (s.auto.reminder || []).filter((c) => msg.channels.includes(c) && !(c === 'whatsapp' && s.whatsapp === 'link' && !s.testMode))
  const due = level('messages') === 'edit' && chans.length > 0 && s.lastReminderRun !== today

  useEffect(() => {
    if (!due || ran.current) return
    ran.current = true
    act('saveMessaging', { ...s, lastReminderRun: today })
    const since = addDays(today, -s.reminderDays)
    for (const r of receivables(db).rows) {
      if (!r.overdue) continue
      const recent = (db.messages || []).some((m) => m.dealerId === r.dealer.id && m.kind === 'reminder' && m.status !== 'failed' && m.date > since)
      if (recent) continue
      // only once the oldest bill is past due by the chosen days
      if (r.days !== null && r.days > -s.reminderDays) continue
      for (const c of chans) void msg.send('reminder', c, r.dealer.id, msg.render('reminder', vars.reminder(db, r.dealer.id)), dealerLedger(db, r.dealer.id).open[0]?.id)
    }
  }, [due]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
