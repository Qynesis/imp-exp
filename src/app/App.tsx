import { lazy, Suspense } from 'react'
import { StoreProvider } from '@/core/store/StoreProvider'
import { useRoute } from '@/core/router'
import { useStore } from '@/core/store/context'
import { UIProvider } from '@/ui'
import { ErrorBoundary } from './ErrorBoundary'
import { Shell } from './Shell'
import { Splash } from './Loading'

// sign-in and the platform owner's page are only needed by some visitors, so they load on demand
const AuthPage = lazy(() => import('@/features/auth/AuthPage'))
// the public landing page carries the animation libraries, so only signed-out visitors download it
const LandingPage = lazy(() => import('@/features/landing/LandingPage'))
const PlatformPage = lazy(() => import('@/features/platform/PlatformPage'))


/** Signed out: the landing page, unless the visitor asked for sign-in or sign-up. */
function SignedOut() {
  const [page] = useRoute()
  return page === 'signin' || page === 'signup' ? <AuthPage /> : <LandingPage />
}

function Gate() {
  const { phase } = useStore()
  if (phase === 'loading') return <Splash text="Opening your books" />
  return (
    <Suspense fallback={<Splash />}>
      {phase === 'signedOut' ? <SignedOut /> : phase === 'platform' ? <PlatformPage /> : <Shell />}
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
