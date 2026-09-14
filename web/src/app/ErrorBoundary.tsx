import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../lib/report-error'

/**
 * Catches a render crash on one screen and says so, instead of React unmounting
 * the whole app into a white page. Reset it by giving it a new `key` (the
 * layout keys it on the route, so moving to another screen starts clean).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed:', error, info.componentStack)
    // …and tell the database, so the administrator does not depend on the
    // person below reading that message and passing it on (migration 0124).
    reportError('render', error.message, info.componentStack)
  }

  override render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="error" role="alert">
        <p>
          <strong>This screen hit an error and stopped drawing.</strong> Nothing has been lost;
          the data is in the database. Please tell the administrator what you did just before,
          together with this message:
        </p>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
        <p>
          <a href="/">Back to the home page</a> · <a href="">Reload this screen</a>
        </p>
      </div>
    )
  }
}
