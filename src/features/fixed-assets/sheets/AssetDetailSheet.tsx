import { assetCalc, byId, DEPRECIATION_METHODS, depreciationSchedule, fdate, fmonth, tk } from '@shared/domain'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, DataTable, Pill, Sheet, useConfirm, useSheetItem, useSheets, useToast, type SheetComponent } from '@/ui'
import { AssetSheet } from './AssetSheet'
import { DisposeSheet } from './DisposeSheet'

/** One asset: what it cost, what is left, and its depreciation month by month (booked, then planned). */
export const AssetDetailSheet: SheetComponent<{ assetId: string }> = ({ assetId }) => {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const { close } = useSheetItem()
  const a = byId(db.assets || [], assetId)
  if (!a) return null
  const c = assetCalc(a)
  const sched = depreciationSchedule(a, 24)
  const canEdit = !accessGuard.readonly
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${a.name}?`, message: a.paidFrom ? `Its ${tk(a.cost)} purchase is taken out of the cashbook too. To record a sale, use Sell or scrap instead.` : undefined, confirmLabel: 'Delete', destructive: true }))) return
    const why = act('removeAsset', a.id)
    if (!why) {
      toast('Asset deleted')
      close()
    }
  }
  const undo = async (month: string) => {
    if (!(await confirm({ title: `Undo ${fmonth(month)} depreciation for ${a.name}?`, confirmLabel: 'Undo' }))) return
    if (!act('undoDepreciation', { month, assetId: a.id })) toast('Depreciation taken back')
  }
  return (
    <Sheet title={a.name} crumb={`Fixed asset ${a.id}`} wide
      footer={canEdit && (
        <>
          {!a.depreciation.length && a.status === 'active' && <Button variant="ghost" icon="trash" onClick={() => void remove()}>Delete</Button>}
          <Button variant="secondary" icon="edit" onClick={() => sheets.open(AssetSheet, { assetId: a.id })}>Edit</Button>
          {a.status === 'active'
            ? <Button variant="secondary" icon="archive" onClick={() => sheets.open(DisposeSheet, { assetId: a.id })}>Sell or scrap</Button>
            : <Button variant="secondary" icon="undo" onClick={() => { if (!act('undoDisposal', a.id)) toast('Asset is active again') }}>Undo disposal</Button>}
        </>
      )}>
      <p className="t-muted tight">{a.category}{a.location ? ` · ${a.location}` : ''} · bought {fdate(a.date)}{a.vendor ? ` from ${a.vendor}` : ''} · <Pill tone={a.status === 'disposed' ? 'neutral' : c.fullyDepreciated ? 'info' : 'good'}>{c.statusText}</Pill></p>
      <div className="mini-stats">
        <div><span>Cost</span><b>{tk(a.cost)}</b><small className="t-muted">{a.paidFrom ? `Paid from ${a.paidFrom}` : 'Not paid from company money'}</small></div>
        <div><span>Depreciation so far</span><b>{tk(c.accumulated)}</b><small className="t-muted">{c.months} month{c.months === 1 ? '' : 's'} booked</small></div>
        <div><span>Book value now</span><b>{tk(c.nbv)}</b><small className="t-muted">Scrap value {tk(a.salvage)}</small></div>
        {a.status === 'disposed'
          ? <div><span>Disposed {fdate(a.disposedOn)}</span><b className={(c.gain || 0) < 0 ? 't-warn' : 't-good'}>{(c.gain || 0) < 0 ? `Loss ${tk(-(c.gain || 0))}` : `Profit ${tk(c.gain || 0)}`}</b><small className="t-muted">Sold for {tk(a.disposalAmount)}</small></div>
          : <div><span>Each month now</span><b>{tk(c.monthly)}</b><small className="t-muted">{DEPRECIATION_METHODS[a.method]}</small></div>}
      </div>
      {a.method === 'none' ? <p className="t-muted">This asset is not depreciated.</p> : (
        <DataTable rows={sched} rowKey={(x) => x.id} rowClass={(x) => (x.booked ? 'sched-row' : 'sched-row planned')} pageSize={12} empty="Nothing left to depreciate."
          columns={[
            { label: 'Month', primary: true, render: (x) => fmonth(x.month) },
            { label: 'Depreciation', align: 'right', render: (x) => tk(x.amount) },
            { label: 'Value after', align: 'right', render: (x) => tk(x.nbv) },
            { label: '', align: 'right', render: (x) => (x.booked ? (canEdit && a.status === 'active' ? <button type="button" className="link" onClick={() => void undo(x.month)}>Undo</button> : <Pill tone="good">Booked</Pill>) : <small className="t-muted">Planned</small>) },
          ]} />
      )}
      {a.note && <p className="t-muted">{a.note}</p>}
    </Sheet>
  )
}
AssetDetailSheet.readOnlySafe = true
