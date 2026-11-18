/** WhatsApp wants the number in international form without '+': 01712-345678 becomes 8801712345678. */
export function whatsappNumber(phone: string | undefined): string {
  const d = (phone || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('880')) return d
  if (d.startsWith('0') && d.length === 11) return '88' + d
  return d
}

/** Open WhatsApp (app on phones, web on computers) with the message typed in, ready to send. */
export function shareOnWhatsApp(text: string, phone?: string): void {
  const num = whatsappNumber(phone)
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
}
