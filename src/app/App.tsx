import { lazy, Suspense } from 'react'
import { StoreProvider } from '@/core/store/StoreProvider'
import { useStore } from '@/core/store/context'
import { UIProvider } from '@/ui'
import { ErrorBoundary } from './ErrorBoundary'
import { Shell } from './Shell'

// sign-in and the platform owner's page are only needed by some visitors, so they load on demand
const AuthPage = lazy(() => import('@/features/auth/AuthPage'))
const PlatformPage = lazy(() => import('@/features/platform/PlatformPage'))

const Splash = ({ text }: { text?: string }) => <div className="splash"><p>{text}</p></div>

function Gate() {
  const { phase } = useStore()
  if (phase === 'loading') return <Splash text="Opening your books" />
  return (
    <Suspense fallback={<Splash />}>
      {phase === 'signedOut' ? <AuthPage /> : phase === 'platform' ? <PlatformPage /> : <Shell />}
    </Suspense>
  )
}

/** Sheets, toasts and dialogs belong to one signed-in session: they all close when you sign in, out or switch company. */
function SessionUI() {
  const { phase, session } = useStore()
  return (
    <UIProvider key={`${phase}:${session?.tenantId || ''}:${session?.userId || ''}`}>
      <Gate />
    </UIProvider>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <SessionUI />
      </StoreProvider>
    </ErrorBoundary>
  )
}
