import { useSee } from '@/app/useSee'
import { Hidden } from '@/components/Hidden'
import { useState } from 'react'
import {
  atFactory, byId, categoryPath, fmt, fshort, isLowStock, lastsFor, PRODUCT_KINDS, PRODUCT_SOURCES, productInUse, productSources, productSuppliers, recipeInfo,
  stockHistory, tk, usageRate, usedIn, type ProductSource,
} from '@shared/domain'
import { CustomView } from '@/components/CustomFields'
import { accessGuard, useBooks } from '@/core/store/context'
import { NewFactoryOrderSheet } from '@/features/factory-orders/sheets/NewFactoryOrderSheet'
import { SettleMaterialSheet } from '@/features/factory-orders/sheets/SettleMaterialSheet'
import { NewShipmentSheet } from '@/features/shipments/sheets/NewShipmentSheet'
import { NewPurchaseSheet } from '@/features/suppliers/sheets/NewPurchaseSheet'
import { Button, Icon, Pill, Sheet, type IconName, useConfirm, useSheetItem, useSheets, useToast, type SheetComponent } from '@/ui'
import { AdjustStockSheet } from './AdjustStockSheet'
import { ProduceSheet } from './ProduceSheet'
import { ProductSheet } from './ProductSheet'

const HISTORY_STEP = 10

/** Everything about one product: stock, where it comes from, its recipe or what uses it, and every movement. */
export const ProductDetailSheet: SheetComponent<{ productId: string }> = ({ productId }) => {
  const { db, act } = useBooks()
  const see = useSee()
  const sheets = useSheets()
  const toast = useToast()
  const confirm = useConfirm()
  const { close } = useSheetItem()
  const [shown, setShown] = useState(HISTORY_STEP)
  const p = byId(db.products, productId)
  if (!p) return null
  const material = p.kind !== 'finished'
  const one = p.unit.replace(/s$/, '') || 'unit'
  const sources = productSources(db, p)
  const suppliers = productSuppliers(db, p)
  const recipe = recipeInfo(db, p)
  const uses = usedIn(db, p.id)
  const f = atFactory(db, p.id)
  const { moves, opening } = stockHistory(db, p.id)
  const margin = p.kind === 'finished' && p.price ? p.price - (p.cost || recipe.materialCost) : 0
  const pace = usageRate(db, p.id)
  const canEdit = !accessGuard.readonly
  const inUse = productInUse(db, p.id)
  // restock routes this product uses; with none set, offer the usual ones for its kind
  const routes: ProductSource[] = sources.filter((s) => s !== 'workshop')
  if (!routes.length) routes.push(...(material ? (['supplier', 'import'] as const) : (['factory'] as const)))
  const restockLabel: Record<Exclude<ProductSource, 'workshop'>, string> = { import: 'Import', factory: 'Order from factory', supplier: 'Buy locally' }
  const restockIcon: Record<Exclude<ProductSource, 'workshop'>, IconName> = { import: 'ship', factory: 'factory', supplier: 'cart' }
  const restock = (s: ProductSource) => {
    if (s === 'import') sheets.open(NewShipmentSheet, { productId })
    else if (s === 'factory') sheets.open(NewFactoryOrderSheet, { productId })
    else sheets.open(NewPurchaseSheet, { productId })
  }
  const archive = async () => {
    if (p.stock !== 0) return toast(`Bring the stock to zero with Adjust stock before archiving (now ${fmt(p.stock)} ${p.unit})`)
    if (!(await confirm({ title: `Archive ${p.name}?`, message: 'It disappears from lists and pickers. Its history stays, and you can restore it later.', confirmLabel: 'Archive' }))) return
    act('archiveProduct', { id: p.id, archived: true })
    toast(`${p.name} archived`)
    close()
  }
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${p.name}?`, message: 'It has no records, so it is removed for good.', confirmLabel: 'Delete', destructive: true }))) return
    act('removeProduct', p.id)
    toast(`${p.name} deleted`)
    close()
  }

  return (
    <Sheet title={p.name} crumb={material ? 'Raw materials' : 'Products and stock'} wide
      footer={!canEdit ? undefined : p.archived ? (
        <>
          {!inUse && <Button icon="trash" variant="danger" onClick={() => void remove()}>Delete for good</Button>}
          <Button icon="restore" onClick={() => { act('archiveProduct', { id: p.id, archived: false }); toast(`${p.name} restored`) }}>Restore</Button>
        </>
      ) : (
        <>
          <Button icon="edit" variant="secondary" onClick={() => sheets.open(ProductSheet, { productId })}>Edit</Button>
          <Button icon="adjust" variant="secondary" onClick={() => sheets.open(AdjustStockSheet, { productId })}>Adjust stock</Button>
          {routes.map((s, i) => s !== 'workshop' && (
            <Button key={s} icon={restockIcon[s]} variant={i === 0 && !recipe.rows.length ? 'primary' : 'secondary'} onClick={() => restock(s)}>{restockLabel[s]}</Button>
          ))}
          {recipe.rows.length > 0 && <Button icon="hammer" onClick={() => sheets.open(ProduceSheet, { productId })}>Make in workshop</Button>}
        </>
      )}>
      {p.archived && <div className="note">Archived: hidden from lists and pickers. {canEdit ? 'Restore it to use it again.' : ''}</div>}
      <p className="t-muted tight">
        {[p.code, PRODUCT_KINDS[p.kind], categoryPath(db, p.categoryId), p.pack].filter(Boolean).join(' · ')}
      </p>
      <div className="mini-stats">
        <div><span>In warehouse</span><b className={isLowStock(p) ? 't-warn' : ''}>{fmt(p.stock)} {p.unit}</b></div>
        <div><span>Stock value</span><b>{see.cost ? tk(Math.max(p.stock, 0) * p.cost) : <Hidden />}</b></div>
        <div><span>Cost per {one}</span><b>{!see.cost ? <Hidden /> : p.cost ? tk(p.cost) : 'Not set'}</b></div>
        {p.kind === 'finished'
          ? <div><span>Dealer price</span><b>{p.price ? tk(p.price) : 'Not set'}</b>{margin !== 0 && see.profit && <small className={margin < 0 ? 't-warn' : 't-good'}> {margin < 0 ? 'loss' : 'margin'} {tk(Math.abs(margin))}</small>}</div>
          : <div><span>Used in</span><b>{uses.length ? `${uses.length} product${uses.length === 1 ? '' : 's'}` : 'None yet'}</b></div>}
        <div>
          <span>Stock lasts</span>
          <b className={pace.daysLeft !== null && pace.daysLeft < 14 ? 't-warn' : ''}>{lastsFor(pace.daysLeft)}</b>
          <small className="t-muted">{pace.out ? `${fmt(pace.out)} ${p.unit} ${material ? 'used' : 'out'} in ${pace.days} days` : `Nothing went out in ${pace.days} days`}</small>
        </div>
      </div>

      <h3 className="sheet-h"><Icon name="route" size={17} />Comes from</h3>
      <div className="chips">
        {sources.length ? sources.map((s) => <Pill key={s} tone="neutral">{PRODUCT_SOURCES[s]}</Pill>) : <span className="t-muted">Not set. Use Edit to say where it comes from.</span>}
      </div>

      {recipe.rows.length > 0 && (
        <>
          <h3 className="sheet-h"><Icon name="layers" size={17} />Recipe for one {one}</h3>
          <div className="rows flush">
            {recipe.rows.map((r) => (
              <button key={r.productId} type="button" className="row click" onClick={() => sheets.open(ProductDetailSheet, { productId: r.productId })}>
                <span className="name normal">{r.name}</span>
                <span className={'meta' + (r.enoughFor === recipe.canMake ? ' t-warn' : '')}>{fmt(r.stock)} {r.unit} in stock · enough for {fmt(r.enoughFor)}</span>
                <span className="amt">{fmt(r.qty)} {r.unit}{r.costPerUnit && see.cost ? <small className="t-muted"> · {tk(r.costPerUnit)}</small> : null}</span>
              </button>
            ))}
            <div className="row">
              <span className="name">Materials per {one}</span>
              <span className="meta">Can make {fmt(recipe.canMake)} {p.unit} now{recipe.limitedBy ? ` · ${recipe.limitedBy} runs out first` : ''}</span>
              <span className="amt">{tk(recipe.materialCost)}</span>
            </div>
          </div>
        </>
      )}

      {uses.length > 0 && (
        <>
          <h3 className="sheet-h"><Icon name="box" size={17} />Goes into</h3>
          <div className="rows flush">
            {uses.map((u) => (
              <button key={u.product.id} type="button" className="row click" onClick={() => sheets.open(ProductDetailSheet, { productId: u.product.id })}>
                <span className="name normal">{u.product.name}</span>
                <span className="meta">Enough for {fmt(Math.floor(p.stock / u.qty))} {u.product.unit}</span>
                <span className="amt">{fmt(u.qty)} {p.unit} each</span>
              </button>
            ))}
          </div>
        </>
      )}

      {(f.due > 0 || f.lyingQty > 0) && (
        <>
          <h3 className="sheet-h"><Icon name="factory" size={17} />At factories</h3>
          <div className="rows flush">
            {f.due > 0 && <div className="row"><span className="name normal">Still to come from factory orders</span><span className="meta" /><span className="amt t-warn">{fmt(f.due)} {p.unit}</span></div>}
            {f.lying.map((l) => canEdit ? (
              <button key={l.orderId} type="button" className="row click" onClick={() => sheets.open(SettleMaterialSheet, { orderId: l.orderId, productId: p.id })}>
                <span className="name normal">Lying at {l.factory}</span><span className="meta">{l.orderId} · tap to take back or write off</span><span className="amt">{fmt(l.qty)} {p.unit}</span>
              </button>
            ) : (
              <div key={l.orderId} className="row"><span className="name normal">Lying at {l.factory}</span><span className="meta">{l.orderId} · handed over, not used yet</span><span className="amt">{fmt(l.qty)} {p.unit}</span></div>
            ))}
          </div>
        </>
      )}

      {suppliers.length > 0 && (
        <>
          <h3 className="sheet-h"><Icon name="truck" size={17} />Suppliers</h3>
          <div className="rows flush">
            {suppliers.map((s) => (
              <div key={s.supplierId} className="row">
                <span className="name normal">{s.name} {s.preferred && <Pill tone="good">Usual</Pill>}</span>
                <span className="meta">{s.bills ? `${s.bills} bill${s.bills === 1 ? '' : 's'} · ${fmt(s.qty)} ${p.unit} · last ${fshort(s.lastDate)}` : 'Nothing bought yet'}</span>
                <span className="amt">{s.lastRate ? `${tk(s.lastRate)}/${one}` : ''}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="sheet-h"><Icon name="arrowRight" size={17} />Stock movements</h3>
      <div className="rows flush">
        {moves.slice(0, shown).map((m) => (
          <div key={m.key} className="row">
            <span className="two-line">
              <span className="name normal">{m.label}</span>
              {m.ref && <small className="t-muted">{m.ref}</small>}
            </span>
            <span className="meta">{fshort(m.date)} · then {fmt(m.balance)}</span>
            <span className={'amt ' + (m.qty > 0 ? 't-good' : '')}>{m.qty > 0 ? '+' : '−'}{fmt(Math.abs(m.qty))}</span>
          </div>
        ))}
        {moves.length > shown && (
          <button type="button" className="row click" onClick={() => setShown((n) => n + HISTORY_STEP * 3)}>
            <span className="name normal">Show older movements</span><span className="meta">{moves.length - shown} more</span><span className="amt" />
          </button>
        )}
        {moves.length <= shown && (
          <div className="row"><span className="name normal t-muted">Opening stock</span><span className="meta">Before these records</span><span className="amt">{fmt(opening)}</span></div>
        )}
      </div>

      <div className="boxed-view"><CustomView entity="product" record={p} /></div>
      {canEdit && !p.archived && (
        <p className="sheet-aside">
          {inUse
            ? <button type="button" className="link" onClick={() => void archive()}>Archive this {material ? 'material' : 'product'}</button>
            : <button type="button" className="link t-warn" onClick={() => void remove()}>Delete this {material ? 'material' : 'product'}</button>}
          <small className="t-muted">{inUse ? ' · No longer used? Archiving hides it and keeps its history.' : ' · Nothing refers to it yet, so it can be deleted.'}</small>
        </p>
      )}
    </Sheet>
  )
}
ProductDetailSheet.readOnlySafe = true
