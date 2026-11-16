import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Last line of defence: instead of a blank page, show what happened and a way back.
 * A screen that fails to download (for example after a new deploy) is retried by reloading.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  override render() {
    const { error } = this.state
    if (!error) return this.props.children
    const stale = /dynamically imported module|Failed to fetch|Importing a module script failed/i.test(error.message)
    return (
      <div className="splash" role="alert">
        <p>{stale ? 'A newer version of the app is available.' : 'Something went wrong on this screen. Your saved books are safe.'}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
      </div>
    )
  }
}
