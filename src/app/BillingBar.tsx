import { fdate } from '@shared/domain'
import { href } from '@/core/router'
import { useBooks } from '@/core/store/context'
import { useAccess } from './useAccess'

const when = (iso: string) => `${fdate(iso.slice(0, 10))}, ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`

/** A thin strip at the top while the company is on its trial, near the end of a plan, or after it ended. */
export function BillingBar() {
  const { billing } = useBooks()
  const { level } = useAccess()
  if (!billing || billing.status === 'free' || !billing.until) return null
  if (billing.status === 'active' && billing.daysLeft > 10) return null
  const link = level('settings') !== 'none' ? <a href={href('settings/billing')}>{billing.status === 'active' ? 'Renew ›' : 'Choose a plan ›'}</a> : <span>Ask your admin to choose a plan.</span>
  if (billing.status === 'expired') {
    return <div className="billing-bar ended" role="alert"><b>Subscription ended</b> on {when(billing.until)}. The books are read-only until a plan is paid. {link}</div>
  }
  const days = `${billing.daysLeft} day${billing.daysLeft === 1 ? '' : 's'} left`
  return (
    <div className={`billing-bar${billing.daysLeft <= 3 ? ' soon' : ''}`} role="status">
      <b>{billing.status === 'trial' ? 'Free trial' : 'Plan'}:</b> {days} (until {when(billing.until)}).{billing.pending > 0 && ' Your payment is waiting for approval.'} {link}
    </div>
  )
}
