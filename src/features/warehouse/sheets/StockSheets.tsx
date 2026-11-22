import { useState } from 'react'
import { byId, fdate, fmt, fullAddress, importSourceName, inboundLog, num, qtyAt, SOURCE_KINDS, siteStock, siteSummaries, tk, todayISO } from '@shared/domain'
import { useAccess } from '@/app/useAccess'
import { useSee } from '@/app/useSee'
import { Hidden } from '@/components/Hidden'
import { PhoneLink } from '@/components/PhoneLink'
import { SitePicker } from '@/components/SitePicker'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, DataTable, Field, FormSheet, Icon, Pill, Sheet, useConfirm, useForm, useSheetItem, useSheets, useToast, type SheetComponent, SearchBox } from '@/ui'
import { WarehouseSiteSheet } from './WarehouseSiteSheet'

/** An import has reached our warehouse: which one, and when. Its goods go into stock at landed cost. */
export const ArriveImportSheet: SheetComponent<{ importId: string }> = ({ importId }) => {
  const { db, act } = useBooks()
  const toast = useToast()
  const s = byId(db.imports, importId)
  const [v, , bind] = useForm({ date: todayISO(), siteId: siteStock(db).mainId })
  if (!s) return null
  const p = byId(db.products, s.productId)
  return (
    <FormSheet title={`${s.id} arrived`} crumb="Warehouse" submit="Received in warehouse"
      note={`${fmt(s.qty)} ${p?.unit || s.unit} of ${p?.name || s.productName} from ${importSourceName(s)} go into stock at their landed cost.${s.steps.customs?.date ? '' : ' Customs is not marked cleared yet — check the papers first.'}`}
      onSubmit={() => {
        if (v.date > todayISO()) return 'The date cannot be in the future.'
        const why = act('markImportStep', { importId: s.id, key: 'warehouse', date: v.date, siteId: v.siteId || undefined })
        if (why) return why
        toast(`${s.id} is in stock`)
      }}>
      <Field label="Arrived on"><input type="date" max={todayISO()} {...bind('date')} /></Field>
      <SitePicker db={db} bind={bind('siteId')} />
    </FormSheet>
  )
}

interface Line { productId: string; qty: string }

/** Move goods from one warehouse to another. */
export const TransferSheet: SheetComponent<{ from?: string; to?: string; productId?: string }> = ({ from, to, productId }) => {
  const { db, act, session } = useBooks()
  const toast = useToast()
  const st = siteStock(db)
  const first = from || st.mainId
  const [v, , bind] = useForm({ from: first, to: to || st.sites.find((w) => w.id !== first)?.id || '', date: todayISO(), note: '' })
  const [lines, setLines] = useState<Line[]>([{ productId: productId || '', qty: '' }])
  const have = (id: string) => qtyAt(db, v.from, id)
  const items = db.products.filter((p) => !p.archived && have(p.id) > 0)
  const upd = (i: number, patch: Partial<Line>) => setLines((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const me = db.users.find((u) => u.id === session.userId)
  if (st.sites.length < 2) return (
    <Sheet title="Move stock" crumb="Warehouse"><p className="t-muted">Add a second warehouse first, then goods can be moved between them.</p></Sheet>
  )
  return (
    <FormSheet title="Move stock between warehouses" crumb="Warehouse" submit="Move goods" onSubmit={() => {
      const why = act('transferStock', { date: v.date, from: v.from, to: v.to, note: v.note, by: me?.name || '', lines: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, qty: num(l.qty) })) })
      if (why) return why
      toast('Goods moved')
    }}>
      <Field label="From">
        <select {...bind('from')}>{st.sites.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
      </Field>
      <Field label="To">
        <select {...bind('to')}>{st.sites.filter((w) => w.id !== v.from).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
      </Field>
      <Field label="Date"><input type="date" max={todayISO()} {...bind('date')} /></Field>
      <Field label="Vehicle, driver or challan"><input {...bind('note')} placeholder="e.g. Pickup Dhaka Metro-NA 14-2290, Babul" /></Field>
      <p className="form-sub">Goods</p>
      {lines.map((l, i) => {
        const p = byId(db.products, l.productId)
        return (
          <div key={i} className="extra-row">
            <select className="in" value={l.productId} onChange={(e) => upd(i, { productId: e.target.value })} aria-label="Item">
              <option value="">Pick an item</option>
              {items.concat(p && !items.includes(p) ? [p] : []).map((x) => <option key={x.id} value={x.id}>{x.name} · {fmt(have(x.id))} {x.unit} there</option>)}
            </select>
            <input className="in" inputMode="decimal" value={l.qty} onChange={(e) => upd(i, { qty: e.target.value })} placeholder={p ? `Up to ${fmt(have(p.id))} ${p.unit}` : 'Quantity'} aria-label="Quantity" />
            <button type="button" className="icon-btn" aria-label="Remove line" disabled={lines.length < 2} onClick={() => setLines((x) => x.filter((_, j) => j !== i))}><Icon name="trash" size={16} /></button>
          </div>
        )
      })}
      <div className="field wide">
        <Button variant="secondary" icon="plus" onClick={() => setLines((x) => [...x, { productId: '', qty: '' }])}>Another item</Button>
        {!items.length && <small className="t-warn">Nothing in stock at this warehouse.</small>}
      </div>
    </FormSheet>
  )
}

/** One warehouse: where it is, who runs it, what it holds, and what came in and moved lately. */
export const SiteDetailSheet: SheetComponent<{ siteId: string }> = ({ siteId }) => {
  const { db, act } = useBooks()
  const see = useSee()
  const sheets = useSheets()
  const confirm = useConfirm()
  const toast = useToast()
  const { close } = useSheetItem()
  const { level } = useAccess()
  const sum = siteSummaries(db).find((x) => x.site.id === siteId)
  const [q, setQ] = useState('')
  if (!sum) return null
  const w = sum.site
  const st = siteStock(db)
  const main = st.mainId === w.id
  const canEdit = !accessGuard.readonly && level('warehouse') === 'edit'
  const log = inboundLog(db).filter((r) => (r.siteId && st.sites.some((s) => s.id === r.siteId) ? r.siteId : st.mainId) === w.id).slice(0, 12)
  const moves = (db.stockTransfers || []).filter((t) => t.from === w.id || t.to === w.id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12)
  const items = sum.items.filter((x) => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <Sheet title={w.name} crumb={main ? 'Main warehouse' : 'Warehouse'} wide
      footer={canEdit ? (
        <>
          {!main && <Button variant="secondary" onClick={async () => {
            if (await confirm({ title: `Make ${w.name} the main warehouse?`, message: 'Goods received without a warehouse named, sales and deliveries will count here from now on.', confirmLabel: 'Make main' })) {
              if (!act('saveWarehouse', { ...w, main: true })) toast(`${w.name} is the main warehouse`)
            }
          }}>Make main</Button>}
          {st.sites.length > 1 && <Button variant="secondary" icon="truck" onClick={() => sheets.open(TransferSheet, { from: w.id })}>Move stock out</Button>}
          <Button variant="secondary" icon="trash" onClick={async () => {
            if (await confirm({ title: `Remove ${w.name}?`, message: 'Its receipts and moves stay in the records.', confirmLabel: 'Remove', destructive: true })) {
              const why = act('removeWarehouse', w.id)
              if (why) toast(why)
              else { toast('Warehouse removed'); close() }
            }
          }}>Remove</Button>
          <Button icon="edit" onClick={() => sheets.open(WarehouseSiteSheet, { siteId: w.id })}>Edit</Button>
        </>
      ) : undefined}>
      <div className="kv-list boxed">
        <div className="kv"><span>Address</span><b>{fullAddress(w) || '—'}</b></div>
        <div className="kv"><span>In charge</span><b>{w.manager || '—'}{w.phone && <> · <PhoneLink phone={w.phone} label={w.name} /></>}</b></div>
        <div className="kv"><span>Holds about</span><b>{w.capacity || '—'}</b></div>
        {w.note && <div className="kv"><span>Note</span><b>{w.note}</b></div>}
      </div>
      <div className="mini-stats">
        <div><span>Items here</span><b>{sum.items.length}</b></div>
        <div><span>Units</span><b>{fmt(sum.units)}</b></div>
        <div><span>Stock value</span><b>{see.cost ? tk(sum.value) : <Hidden />}</b></div>
        <div><span>Last 90 days</span><b>{sum.received} in</b><small className="t-muted">{sum.movedIn} moved in · {sum.movedOut} out</small></div>
      </div>
      <h3 className="sheet-h">Stock here</h3>
      <SearchBox value={q} onChange={setQ} placeholder="Item name" />
      <DataTable rows={items} rowKey={(x) => x.productId} pageSize={12} empty="Nothing in stock here."
        columns={[
          { label: 'Item', primary: true, render: (x) => <b>{x.name}</b> },
          { label: 'Quantity', align: 'right', render: (x) => <span className={x.qty < 0 ? 't-warn' : x.low ? 't-warn strong' : undefined}>{fmt(x.qty)} {x.unit}{x.low ? ' · low' : ''}</span> },
          { label: 'Value', align: 'right', render: (x) => (see.cost ? tk(x.value) : <Hidden />) },
          ...(canEdit && st.sites.length > 1 ? [{ label: '', align: 'right' as const, render: (x: (typeof items)[number]) => (x.qty > 0 ? <Button size="sm" variant="secondary" onClick={() => sheets.open(TransferSheet, { from: w.id, productId: x.productId })}>Move</Button> : null) }] : []),
        ]} />
      <h3 className="sheet-h">Received here lately</h3>
      <DataTable rows={log} rowKey={(r) => r.key} empty="Nothing received here yet."
        columns={[
          { label: 'Date', primary: true, render: (r) => <span className="nowrap">{fdate(r.date)}</span> },
          { label: 'Item', render: (r) => r.productName },
          { label: 'From', render: (r) => <span className="two-line"><span>{r.sourceName}</span><small className="t-muted">{SOURCE_KINDS[r.kind]}</small></span> },
          { label: 'Quantity', align: 'right', render: (r) => `${fmt(r.qty)} ${r.unit}` },
        ]} />
      {moves.length > 0 && (
        <>
          <h3 className="sheet-h">Moves</h3>
          <DataTable rows={moves} rowKey={(t) => t.id}
            columns={[
              { label: 'Move', primary: true, render: (t) => <span className="two-line"><b>{t.id}</b><small className="t-muted">{fdate(t.date)}</small></span> },
              { label: 'Direction', render: (t) => (t.to === w.id ? <Pill tone="good">In from {byId(db.warehouses || [], t.from)?.name || '—'}</Pill> : <Pill tone="warn">Out to {byId(db.warehouses || [], t.to)?.name || '—'}</Pill>) },
              { label: 'Goods', render: (t) => t.lines.map((l) => `${fmt(l.qty)} ${byId(db.products, l.productId)?.unit || ''} ${byId(db.products, l.productId)?.name || ''}`).join(', ') },
            ]} />
        </>
      )}
    </Sheet>
  )
}
SiteDetailSheet.readOnlySafe = true
