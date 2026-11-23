import { Component, type ErrorInfo, type ReactNode } from 'react'

const isStale = (e: Error) => /dynamically imported module|Failed to fetch|Importing a module script failed|error loading dynamically/i.test(e.message)

/**
 * Last line of defence: instead of a blank page, show what happened and a way back.
 * A screen that fails to download (for example after a new deploy) is retried by reloading.
 * With `screen`, only the current screen is replaced: the menu stays, and "Try again" redraws it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; screen?: boolean }, { error: Error | null }> {
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
    const stale = isStale(error)
    if (this.props.screen) return (
      <div className="card screen-error" role="alert">
        <b>{stale ? 'This screen could not be downloaded.' : 'This screen ran into a problem.'}</b>
        <p className="t-muted">{stale ? 'Check your connection, or reload to get the newest version of the app.' : 'Your saved books are safe. Try again, or go back to the dashboard. If it keeps happening, tell your admin what you were doing.'}</p>
        {!stale && <details><summary>Details</summary><code>{error.message}</code></details>}
        <div className="row-actions">
          {stale
            ? <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
            : <button type="button" className="btn btn-primary" onClick={() => this.setState({ error: null })}>Try again</button>}
          <a className="btn btn-secondary" href="#/dashboard" onClick={() => this.setState({ error: null })}>Go to dashboard</a>
        </div>
      </div>
    )
    return (
      <div className="splash" role="alert">
        <p>{stale ? 'A newer version of the app is available.' : 'Something went wrong on this screen. Your saved books are safe.'}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
      </div>
    )
  }
}
