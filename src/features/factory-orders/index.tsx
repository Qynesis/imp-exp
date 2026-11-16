import type { FeatureRouteProps } from '@/app/features'
import { FactoryOrderDetailPage } from './FactoryOrderDetailPage'
import { FactoryOrdersPage } from './FactoryOrdersPage'

/** #/factory-orders and #/factory-orders/<order id> */
export default function FactoryOrdersRoute({ params: [id] }: FeatureRouteProps) {
  return id ? <FactoryOrderDetailPage id={id} /> : <FactoryOrdersPage />
}
