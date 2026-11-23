import { useEffect, useRef, useState } from 'react'
import type { AttachTarget, Attachment } from '@shared/domain'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, cls, Icon, Sheet, useSheets, useToast, type SheetComponent } from '@/ui'
import { ACCEPT_FILES, fileSize, uploadFile } from './upload'

/** Pick files (camera on phones) and upload them; calls `onAdded` with each one. */
function PickButton({ onAdded, label = 'Attach receipt', small }: { onAdded: (a: Attachment) => void; label?: string; small?: boolean }) {
  const { call } = useBooks()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      for (const f of Array.from(files).slice(0, 5)) onAdded(await uploadFile(call, f))
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <>
      <Button type="button" size={small ? 'sm' : undefined} variant="secondary" icon="clip" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : label}</Button>
      <input ref={input} type="file" accept={ACCEPT_FILES} multiple hidden onChange={(e) => void pick(e.target.files)} />
    </>
  )
}

/** The attached files as chips: tap to view, × to remove. */
function FileChips({ files, onRemove }: { files: Attachment[]; onRemove?: (f: Attachment) => void }) {
  const sheets = useSheets()
  if (!files.length) return null
  return (
    <div className="file-chips">
      {files.map((f) => (
        <span key={f.id} className="file-chip">
          <button type="button" onClick={() => sheets.open(DocumentSheet, { file: f })} title={`View ${f.name}`}>
            <Icon name={f.type === 'application/pdf' ? 'receipt' : f.type.startsWith('image/') ? 'clip' : 'folder'} size={14} />
            <span>{f.name}</span>
            <small>{fileSize(f.size)}</small>
          </button>
          {onRemove && <button type="button" className="file-x" aria-label={`Remove ${f.name}`} onClick={() => onRemove(f)}>×</button>}
        </span>
      ))}
    </div>
  )
}

/** In a form, before the payment is saved: files are uploaded now and linked when the form is saved. */
export function AttachField({ value, onChange, label = 'Money receipt or document', hint = 'optional: photo or PDF', button }: { value: Attachment[]; onChange: (v: Attachment[]) => void; label?: string; hint?: string; button?: string }) {
  const { call } = useBooks()
  return (
    <div className="attach-field wide-note">
      <span className="field-label">{label} <small className="t-muted">({hint})</small></span>
      <FileChips files={value} onRemove={(f) => { onChange(value.filter((x) => x.id !== f.id)); void call('DELETE', 'files?id=' + f.id).catch(() => undefined) }} />
      <PickButton small label={button} onAdded={(a) => onChange([...value, a])} />
    </div>
  )
}

/** Files to look at (no changes): tap one to open it. */
export function FileList({ files }: { files: Attachment[] }) {
  return <FileChips files={files} />
}

/** For a payment already saved: list, add and remove its documents. */
export function AttachedFiles({ target, id, files }: { target: AttachTarget; id: string; files: Attachment[] }) {
  const { act } = useBooks()
  const toast = useToast()
  const canEdit = !accessGuard.readonly
  return (
    <div className="attach-field">
      <FileChips files={files} onRemove={canEdit ? (f) => { if (!act('detach', { target, id, fileId: f.id })) toast('Document removed') } : undefined} />
      {canEdit && <PickButton small label={files.length ? 'Attach another' : 'Attach receipt'} onAdded={(file) => { if (!act('attach', { target, id, file })) toast('Document attached') }} />}
      {!files.length && !canEdit && <span className="t-muted">No documents.</span>}
    </div>
  )
}

/** A paperclip with the count, opening the documents of one payment. */
export function ClipButton({ target, id, files, title }: { target: AttachTarget; id: string; files: Attachment[]; title: string }) {
  const sheets = useSheets()
  return (
    <button type="button" className={cls('clip-btn', files.length > 0 && 'has')} aria-label={`${files.length} documents for ${title}`} title={files.length ? `${files.length} document${files.length === 1 ? '' : 's'}` : 'Attach receipt'}
      onClick={(e) => { e.stopPropagation(); sheets.open(PaymentDocsSheet, { target, id, title }) }}>
      <Icon name="clip" size={15} />{files.length > 0 && <span>{files.length}</span>}
    </button>
  )
}

/** Finds the record again from the books, so the list updates as files are added. */
export const PaymentDocsSheet: SheetComponent<{ target: AttachTarget; id: string; title: string }> = ({ target, id, title }) => {
  const { db } = useBooks()
  const files = findFiles(db, target, id)
  return (
    <Sheet title="Payment documents" crumb={title}>
      <p className="t-muted tight">Money receipts, bank slips, challans or any paper for this payment. Photos are made smaller to save data; PDFs up to 3 MB.</p>
      <AttachedFiles target={target} id={id} files={files} />
    </Sheet>
  )
}
PaymentDocsSheet.readOnlySafe = true

function findFiles(db: ReturnType<typeof useBooks>['db'], target: AttachTarget, id: string): Attachment[] {
  const lists: Record<AttachTarget, { id: string; attachments?: Attachment[] }[]> = {
    collection: db.collections, supplierPayment: db.supplierPayments, factoryPayment: db.factoryOrders.flatMap((o) => o.payments), expense: db.expenses,
    advance: db.advances, investorTxn: db.investorTxns || [], transfer: db.transfers || [], taxPayment: db.taxPayments || [], expenseEntry: db.expenseEntries || [],
  }
  return lists[target].find((x) => x.id === id)?.attachments || []
}

/** Shows one document: a photo inline, a PDF in a frame, with download. */
export const DocumentSheet: SheetComponent<{ file: Attachment }> = ({ file }) => {
  const { call } = useBooks()
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    let made = ''
    call<{ type: string; data: string }>('GET', 'files?id=' + file.id).then((f) => {
      const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))
      made = URL.createObjectURL(new Blob([bytes], { type: f.type }))
      setUrl(made)
    }).catch((e: Error) => setErr(e.message))
    return () => { if (made) URL.revokeObjectURL(made) }
  }, [call, file.id])
  return (
    <Sheet title={file.name} crumb="Document" wide footer={url ? <a className="btn btn-secondary" href={url} download={file.name}>Download</a> : undefined}>
      {err && <div className="err" role="alert">{err}</div>}
      {!url && !err && <p className="t-muted">Loading…</p>}
      {url && (file.type === 'application/pdf' ? <iframe className="doc-frame" src={url} title={file.name} />
        : file.type.startsWith('image/') ? <img className="doc-img" src={url} alt={file.name} />
        : file.type.startsWith('text/') ? <TextPreview url={url} />
        : <p className="t-muted">{file.type.includes('sheet') || file.type.includes('excel') ? 'An Excel file' : 'A Word file'} ({fileSize(file.size)}). Download it to open it.</p>)}
    </Sheet>
  )
}
DocumentSheet.readOnlySafe = true

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState('')
  useEffect(() => { void fetch(url).then((r) => r.text()).then((t) => setText(t.slice(0, 20000))) }, [url])
  return <pre className="doc-text">{text}</pre>
}
