import { useState } from 'react'
import { assetCalc, assets, assetSummary, depreciationDue, fdate, fmonth, sum, thisMonth, tk, todayISO } from '@shared/domain'
import { PageHead } from '@/components/PageHead'
import { accessGuard, useBooks } from '@/core/store/context'
import { Button, Card, DataTable, Field, Pill, Segmented, Stat, useConfirm, useSheets, useToast } from '@/ui'
import { AssetDetailSheet } from './sheets/AssetDetailSheet'
import { AssetSheet } from './sheets/AssetSheet'

type Show = 'active' | 'disposed' | 'all'

/** #/fixed-assets: machines, vehicles, furniture and computers, with monthly depreciation. */
export default function FixedAssetsPage() {
  const { db, act } = useBooks()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const [month, setMonth] = useState(thisMonth)
  const [show, setShow] = useState<Show>('active')
  const sumry = assetSummary(db)
  const due = depreciationDue(db, month)
  const dueTotal = sum(due, (x) => x.amount)
  const booked = assets(db).filter((a) => a.depreciation.some((x) => x.month === month))
  const canEdit = !accessGuard.readonly
  const rows = assets(db).filter((a) => show === 'all' || a.status === show).sort((a, b) => (a.id < b.id ? 1 : -1))

  const run = async () => {
    const ok = await confirm({ title: `Book ${fmonth(month)} depreciation?`, message: `${due.length} asset${due.length === 1 ? '' : 's'}, ${tk(dueTotal)} in all. It shows as an expense in that month’s profit and loss.`, confirmLabel: 'Book depreciation' })
    if (ok && !act('runDepreciation', { month, date: month === thisMonth() ? todayISO() : `${month}-28` })) toast(`${fmonth(month)} depreciation booked: ${tk(dueTotal)}`)
  }
  const undoMonth = async () => {
    if (await confirm({ title: `Undo all ${fmonth(month)} depreciation?`, message: `Takes back ${booked.length} entr${booked.length === 1 ? 'y' : 'ies'}.`, confirmLabel: 'Undo', destructive: true })) {
      if (!act('undoDepreciation', { month })) toast(`${fmonth(month)} depreciation taken back`)
    }
  }
  return (
    <>
      <PageHead title="Fixed assets" sub="What the company owns and uses for years, and how much value it loses each month."
        actions={<Button icon="plus" onClick={() => sheets.open(AssetSheet)}>Add asset</Button>} />
      <div className="stats">
        <Stat icon="building" label="Total cost (all assets)" value={tk(sumry.cost)} sub={`${sumry.count} asset${sumry.count === 1 ? '' : 's'}, ${sumry.active} in use`} />
        <Stat icon="trend" label="Depreciation so far" value={tk(sumry.accumulated)} />
        <Stat icon="wallet" label="Total net book value" value={tk(sumry.nbv)} tone="good" sub="Of assets in use" />
        <Stat icon="calendar" label="Depreciation per month" value={tk(sumry.monthly)} sub="At today’s values" />
      </div>

      <Card icon="calendar" title="Monthly depreciation" sub="Book it once a month. It comes off each asset’s value and shows as an expense in profit and loss.">
        <div className="card-body pt0 period-bar">
          <Field label="Period"><input className="in" type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>
          {canEdit && <Button icon="check" disabled={!due.length} onClick={() => void run()}>Run depreciation for all active assets{due.length ? ` · ${tk(dueTotal)}` : ''}</Button>}
          {canEdit && booked.length > 0 && <Button variant="ghost" icon="undo" onClick={() => void undoMonth()}>Undo {fmonth(month)}</Button>}
          <p className="field-note">
            {due.length ? `${due.length} asset${due.length === 1 ? '' : 's'} still to book for ${fmonth(month)}.` : `Nothing left to book for ${fmonth(month)}.`}
            {booked.length > 0 && ` ${booked.length} already booked, ${tk(sum(booked, (a) => sum(a.depreciation.filter((x) => x.month === month), (x) => x.amount)))}.`}
          </p>
        </div>
      </Card>

      <Card icon="building" title="Asset list" action={<Segmented<Show> label="Show" value={show} onChange={setShow} options={[{ value: 'active', label: 'In use' }, { value: 'disposed', label: 'Disposed' }, { value: 'all', label: 'All' }]} />}>
        <DataTable pageSize={20} rows={rows} rowKey={(a) => a.id} onRow={(a) => sheets.open(AssetDetailSheet, { assetId: a.id })}
          empty={show === 'disposed' ? 'No asset sold or scrapped yet.' : 'No fixed assets yet. Add machines, vehicles, furniture or computers the company owns.'}
          columns={[
            { label: 'Asset', primary: true, render: (a) => <span className="two-line"><b>{a.name}</b><small className="t-muted mono">{a.id}</small></span> },
            { label: 'Category', render: (a) => a.category },
            { label: 'Purchase date', render: (a) => <span className="nowrap">{fdate(a.date)}</span> },
            { label: 'Cost', align: 'right', render: (a) => <span className="nowrap">{tk(a.cost)}</span> },
            { label: 'Accum. depreciation', align: 'right', render: (a) => <span className="nowrap">{tk(assetCalc(a).accumulated)}</span> },
            { label: 'Net book value', align: 'right', render: (a) => <b className="nowrap">{tk(assetCalc(a).nbv)}</b> },
            { label: 'Status', align: 'right', render: (a) => { const c = assetCalc(a); return <Pill tone={a.status === 'disposed' ? 'neutral' : c.fullyDepreciated ? 'info' : 'good'}>{c.statusText}</Pill> } },
          ]} />
      </Card>

      {sumry.byCategory.length > 1 && (
        <Card icon="layers" title="By category" sub="Assets in use">
          <DataTable rows={sumry.byCategory} rowKey={(r) => r.category}
            columns={[
              { label: 'Category', primary: true, render: (r) => r.category },
              { label: 'Assets', align: 'right', render: (r) => r.count },
              { label: 'Cost', align: 'right', render: (r) => tk(r.cost) },
              { label: 'Book value', align: 'right', render: (r) => <b>{tk(r.nbv)}</b> },
            ]} />
        </Card>
      )}
    </>
  )
}
