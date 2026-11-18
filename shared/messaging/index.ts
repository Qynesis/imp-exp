/**
 * WhatsApp and SMS sending, independent of where it runs (server, or this browser in frontend-only mode).
 *
 * WhatsApp Cloud API: Meta lets a business start a conversation only with an approved template; set
 * the template's name and the message goes in as its single body variable. Within 24 hours of the
 * customer writing to you, plain text works too. SMS goes through a Bangladeshi gateway: BulkSMSBD
 * built in, or any gateway whose send address can be written with {to}, {message}, {apiKey} and {sender}.
 */
import type { MessageChannel, MessageKind } from '../domain/types'

export interface MessagingKeys {
  /** WhatsApp Cloud API */
  token?: string
  phoneNumberId?: string
  template?: string
  language?: string
  /** SMS gateway */
  apiKey?: string
  senderId?: string
  /** 'bulksmsbd', or a full send address with {to} {message} {apiKey} {sender} in it. */
  gateway?: string
  test?: boolean
}
export type MessagingKeyName = Exclude<keyof MessagingKeys, 'test'>

export class MessagingError extends Error {}
type Fetch = typeof fetch

/** 8801XXXXXXXXX, the form both WhatsApp and Bangladeshi gateways want. */
export function intlPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('880')) return d
  if (d.startsWith('0') && d.length === 11) return '88' + d
  if (d.length === 10 && d.startsWith('1')) return '880' + d
  return d
}

export const MESSAGING_FIELDS: Record<MessageChannel, { key: MessagingKeyName; label: string; secret?: boolean; hint?: string }[]> = {
  whatsapp: [
    { key: 'token', label: 'Access token', secret: true, hint: 'Permanent token from Meta Business, WhatsApp, API setup' },
    { key: 'phoneNumberId', label: 'Phone number id', hint: 'The id of your WhatsApp business number, not the number itself' },
    { key: 'template', label: 'Template name', hint: 'An approved template with one body variable {{1}}. Empty sends plain text (works only within 24 hours of the customer writing).' },
    { key: 'language', label: 'Template language', hint: 'e.g. en or bn. Empty means en' },
  ],
  sms: [
    { key: 'apiKey', label: 'API key', secret: true },
    { key: 'senderId', label: 'Sender id', hint: 'The approved sender name or number from your gateway' },
    { key: 'gateway', label: 'Gateway', hint: 'Empty for BulkSMSBD; or a full address like https://gw.example.com/send?key={apiKey}&to={to}&from={sender}&text={message}' },
  ],
}

export async function sendMessage(channel: MessageChannel, keys: MessagingKeys, to: string, text: string, http: Fetch = fetch): Promise<string> {
  const number = intlPhone(to)
  if (number.length < 12) throw new MessagingError(`${to || 'That number'} is not a mobile number.`)
  if (!text.trim()) throw new MessagingError('The message is empty.')
  if (keys.test) return `TEST-${Date.now().toString(36).toUpperCase()}`
  try {
    return channel === 'whatsapp' ? await whatsapp(keys, number, text, http) : await sms(keys, number, text, http)
  } catch (e) {
    if (e instanceof MessagingError) throw e
    throw new MessagingError(`Could not reach ${channel === 'whatsapp' ? 'WhatsApp' : 'the SMS gateway'}. If the app runs in the browser only, the service may refuse direct calls: run it with the server.`)
  }
}

async function whatsapp(k: MessagingKeys, to: string, text: string, http: Fetch): Promise<string> {
  if (!k.token || !k.phoneNumberId) throw new MessagingError('WhatsApp is not set up: add the access token and phone number id under Messages, Settings.')
  const body = k.template
    ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: k.template, language: { code: k.language || 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text }] }] } }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: text, preview_url: false } }
  const res = await http(`https://graph.facebook.com/v21.0/${encodeURIComponent(k.phoneNumberId)}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${k.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } }
  if (!res.ok || !data.messages?.[0]) throw new MessagingError(`WhatsApp refused the message${data.error?.message ? `: ${data.error.message}` : ` (HTTP ${res.status})`}.`)
  return data.messages[0].id
}

async function sms(k: MessagingKeys, to: string, text: string, http: Fetch): Promise<string> {
  if (!k.apiKey || !k.senderId) throw new MessagingError('SMS is not set up: add the gateway API key and sender id under Messages, Settings.')
  const gw = (k.gateway || '').trim()
  const fill = (s: string) => s.replace('{to}', encodeURIComponent(to)).replace('{message}', encodeURIComponent(text)).replace('{apiKey}', encodeURIComponent(k.apiKey || '')).replace('{sender}', encodeURIComponent(k.senderId || ''))
  const url = gw && gw !== 'bulksmsbd'
    ? fill(gw)
    : `http://bulksmsbd.net/api/smsapi?api_key=${encodeURIComponent(k.apiKey)}&type=text&number=${to}&senderid=${encodeURIComponent(k.senderId)}&message=${encodeURIComponent(text)}`
  const res = await http(url)
  const raw = await res.text()
  let data: { response_code?: number; error_message?: string; success_message?: string } = {}
  try {
    data = JSON.parse(raw)
  } catch {
    /* a custom gateway may answer in plain text */
  }
  const okCode = data.response_code === undefined ? res.ok : data.response_code === 202
  if (!okCode) throw new MessagingError(`The SMS gateway refused the message${data.error_message ? `: ${data.error_message}` : ` (HTTP ${res.status})`}.`)
  return data.success_message || `SMS-${Date.now().toString(36).toUpperCase()}`
}

/* ---------- templates ---------- */

export const MESSAGE_KINDS: { kind: MessageKind; label: string; when: string }[] = [
  { kind: 'estimate', label: 'Estimate', when: 'An estimate for a dealer is saved or sent' },
  { kind: 'invoice', label: 'Bill', when: 'A bill is made' },
  { kind: 'payment', label: 'Payment receipt', when: 'Money is collected from a dealer' },
  { kind: 'delivery', label: 'Delivery', when: 'Goods are delivered' },
  { kind: 'reminder', label: 'Due reminder', when: 'A bill is overdue' },
  { kind: 'occasional', label: 'Occasional', when: 'You send it: Eid, new products, price changes' },
]

/** Words in {braces} are filled from the bill, dealer or payment. */
export const DEFAULT_TEMPLATES: Record<MessageKind, string> = {
  estimate: 'Dear {dealer}, estimate {ref} from {company}: {items}. Total {amount}. Valid until {valid}. Reply to confirm and we will bill it.',
  invoice: 'Dear {dealer}, bill {ref} from {company}: {items}. Total {amount}, paid {paid}, due {due}. Your total due is now {balance}. Thank you.',
  payment: 'Dear {dealer}, we received {amount} on {date}. Thank you. Your due with {company} is now {balance}.',
  delivery: 'Dear {dealer}, {items} against bill {ref} were delivered today. Received by {receiver}. - {company}',
  reminder: 'Dear {dealer}, a friendly reminder from {company}: {balance} is due, oldest bill {ref} from {date}. Please pay at your earliest convenience.',
  occasional: 'Dear {dealer}, Eid Mubarak from all of us at {company}. Thank you for your business.',
}

export const PLACEHOLDERS = ['{dealer}', '{company}', '{ref}', '{amount}', '{paid}', '{due}', '{balance}', '{items}', '{date}', '{valid}', '{receiver}']

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? vars[k] : m)).replace(/\s+([.,])/g, '$1').trim()
}
