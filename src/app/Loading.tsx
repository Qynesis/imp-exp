import { Spinner } from '@/ui/Button'

/** Full-screen wait while the books open or a page downloads. */
export const Splash = ({ text }: { text?: string }) => (
  <div className="splash" aria-busy="true"><Spinner size={28} label={text || 'Loading'} />{text && <p>{text}</p>}</div>
)

/** While a screen downloads: the shape of a page, so nothing jumps when it arrives. */
export const PageLoading = () => (
  <div className="page-loading" aria-busy="true" role="status" aria-label="Loading this screen">
    <div className="skel skel-title" />
    <div className="skel-row">{[0, 1, 2, 3].map((i) => <div key={i} className="skel skel-stat" />)}</div>
    <div className="skel skel-card" />
  </div>
)
