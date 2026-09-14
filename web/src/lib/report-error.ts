import { supabase } from './supabase'

/**
 * Tell the database that a screen broke, so the administrator learns without
 * the person having to mention it (migration 0124).
 *
 * Three rules, and they are the whole design:
 *
 *   1. **It never throws and is never awaited by a render.** Failing to record
 *      an error must not itself break a screen — that would turn one fault into
 *      two, and the second would be ours.
 *   2. **It stays quiet when the browser is offline**, so a train tunnel does
 *      not look like a fault in the app.
 *   3. **It sends the route, not the URL.** A path finds the job; a query
 *      string could carry anything.
 *
 * The database collapses repeats into a count and caps a flood, so this side
 * does not need to be clever about either.
 */

export type ErrorKind = 'render' | 'load'

/** Same failure, same screen, within one page view — send it once. */
const alreadySent = new Set<string>()

export function reportError(kind: ErrorKind, message: string, detail?: string | null): void {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    if (!message) return

    const path = typeof window === 'undefined' ? '' : window.location.pathname
    const seen = `${kind}|${path}|${message}`
    if (alreadySent.has(seen)) return
    alreadySent.add(seen)

    void supabase
      .rpc('report_error', {
        kind,
        path,
        message: message.slice(0, 500),
        detail: detail ? detail.slice(0, 2000) : null,
        user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent.slice(0, 300),
      })
      .then(
        () => undefined,
        () => undefined, // Nothing to do about it, and nothing to show for it.
      )
  } catch {
    // Same reasoning: a reporter that can break a screen is worse than none.
  }
}

/** Test seam — a new page view starts with nothing sent. */
export function forgetSentErrors(): void {
  alreadySent.clear()
}
