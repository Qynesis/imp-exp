import { Icon } from '@/ui'

/** A phone number that dials when tapped. Shows nothing for an empty number. */
export function PhoneLink({ phone, label }: { phone?: string; label?: string }) {
  if (!phone) return null
  return (
    <a className="phone-link" href={`tel:${phone.replace(/[^\d+]/g, '')}`} onClick={(e) => e.stopPropagation()} aria-label={`Call ${label || phone}`}>
      <Icon name="phone" size={14} />{phone}
    </a>
  )
}
