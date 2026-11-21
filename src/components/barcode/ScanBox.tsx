import { useEffect, useRef, useState, type FormEvent } from 'react'
import { readScan, type ScanHit } from '@shared/domain'
import { useBooks } from '@/core/store/context'
import { cls, Icon } from '@/ui'

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector
const BarcodeDetectorCtor = (): DetectorCtor | undefined => (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector

/**
 * One box for every way of scanning: a USB/Bluetooth scanner types the code and Enter, a phone camera
 * reads it where the browser can, or the code is typed by hand. `onScan` gets the product and quantity
 * (a carton label "CODE*24" counts 24). `onText` sees anything that is not a product (e.g. a bill number).
 */
export function ScanBox({ onScan, onText, hint = 'Scan or type a barcode' }: { onScan: (hit: ScanHit) => string | void; onText?: (text: string) => boolean; hint?: string }) {
  const { db } = useBooks()
  const [text, setText] = useState('')
  const [last, setLast] = useState<{ ok: boolean; msg: string } | null>(null)
  const [camera, setCamera] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const handle = (raw: string) => {
    const code = raw.trim()
    if (!code) return
    const hit = readScan(db, code)
    if (hit) {
      const problem = onScan(hit)
      setLast(problem ? { ok: false, msg: problem } : { ok: true, msg: `${hit.product.name} +${hit.qty}${hit.carton ? ' (carton)' : ''}` })
      if (!problem) beep(880)
      else beep(220)
    } else if (onText?.(code)) {
      setLast({ ok: true, msg: `Found ${code}` })
      beep(880)
    } else {
      setLast({ ok: false, msg: `No product with barcode ${code}` })
      beep(220)
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    handle(text)
    setText('')
    input.current?.focus()
  }

  return (
    <div className="scan-box">
      <form className="scan-row" onSubmit={submit}>
        <Icon name="barcode" size={18} />
        <input ref={input} className="in" value={text} onChange={(e) => setText(e.target.value)} placeholder={hint} aria-label="Barcode" autoComplete="off" inputMode="text" enterKeyHint="go" />
        {BarcodeDetectorCtor() && <button type="button" className={cls('scan-cam', camera && 'on')} onClick={() => setCamera((c) => !c)} aria-label="Scan with the camera"><Icon name="scan" size={18} /></button>}
      </form>
      {camera && <CameraScan onCode={handle} onClose={() => setCamera(false)} />}
      {last && <div className={cls('scan-last', last.ok ? 't-good' : 't-warn')} role="status">{last.msg}</div>}
    </div>
  )
}

/** Short beep on a scan, so the person does not have to look at the screen. */
function beep(freq: number) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const o = ctx.createOscillator()
    o.frequency.value = freq
    o.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.09)
    o.onended = () => void ctx.close()
  } catch {
    /* no sound is fine */
  }
}

/** The camera view: reads codes continuously, ignores the same code for a second so one label counts once. */
function CameraScan({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState('')
  // the latest handler, without restarting the camera when it changes
  const report = useRef(onCode)
  useEffect(() => {
    report.current = onCode
  }, [onCode])
  useEffect(() => {
    const Ctor = BarcodeDetectorCtor()
    if (!Ctor) return
    let stream: MediaStream | null = null
    let timer = 0
    let lastCode = ''
    let lastAt = 0
    const detector = new Ctor({ formats: ['code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'qr_code'] })
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } }).then((s) => {
      stream = s
      if (!video.current) return
      video.current.srcObject = s
      void video.current.play()
      const tick = async () => {
        if (video.current && video.current.readyState >= 2) {
          const found = await detector.detect(video.current).catch(() => [])
          const code = found[0]?.rawValue
          if (code && (code !== lastCode || Date.now() - lastAt > 1200)) {
            lastCode = code
            lastAt = Date.now()
            report.current(code)
          }
        }
        timer = window.setTimeout(() => void tick(), 250)
      }
      void tick()
    }).catch(() => setErr('The camera could not be opened. Allow camera access, or use a scanner.'))
    return () => {
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])
  return (
    <div className="scan-camera">
      {err ? <p className="t-warn">{err}</p> : <video ref={video} muted playsInline />}
      <button type="button" className="link" onClick={onClose}>Close camera</button>
    </div>
  )
}
