import { useAccess } from '@/app/useAccess'
import { go } from '@/core/router'
import { Segmented } from '@/ui'

type StockPage = 'products' | 'raw-materials'

/** Switches between finished products and raw materials. Hidden when the role can open only one of them. */
export function StockTabs({ current }: { current: StockPage }) {
  const { level } = useAccess()
  if (level('products') === 'none' || level('raw-materials') === 'none') return null
  return (
    <div className="stock-tabs">
      <Segmented<StockPage> label="Stock" value={current} onChange={go} options={[
        { value: 'products', label: 'Products' },
        { value: 'raw-materials', label: 'Raw materials' },
      ]} />
    </div>
  )
}
