import type { Attachment } from '@shared/domain'

const MAX_SIDE = 1600
/** Office documents and plain text, sent as they are. */
const DOC_TYPES = ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/csv']
export const ACCEPT_FILES = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt'

/** A photo of a receipt, made smaller (1600px, JPEG) so it uploads fast on mobile data and stays readable. */
function shrinkPhoto(file: File): Promise<{ type: string; data: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      const g = c.getContext('2d')
      if (!g) return reject(new Error('This browser cannot read the photo'))
      g.fillStyle = '#fff'
      g.fillRect(0, 0, c.width, c.height)
      g.drawImage(img, 0, 0, c.width, c.height)
      resolve({ type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.82).split(',')[1] })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file could not be read as a photo'))
    }
    img.src = url
  })
}

const readBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = () => reject(new Error('That file could not be read'))
    r.readAsDataURL(file)
  })

/** Upload one picked file through the API and get back what the books keep about it. */
export async function uploadFile(call: <T>(m: 'POST', p: string, b: unknown) => Promise<T>, file: File): Promise<Attachment> {
  const isPdf = file.type === 'application/pdf'
  const isDoc = DOC_TYPES.includes(file.type)
  if (!isPdf && !isDoc && !file.type.startsWith('image/')) throw new Error('Attach a photo, a PDF, or a Word, Excel, CSV or text file')
  if (file.size > 5 * 1024 * 1024 && !file.type.startsWith('image/')) throw new Error('That file is larger than 5 MB')
  const body = isPdf || isDoc ? { type: file.type, data: await readBase64(file) } : await shrinkPhoto(file)
  return call<Attachment>('POST', 'files', { name: file.name || (isPdf ? 'document.pdf' : 'receipt.jpg'), ...body })
}

export const fileSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
