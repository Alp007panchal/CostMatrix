/**
 * Edge Functions answer with a JSON body explaining what went wrong, but the
 * client library only reports "returned a non-2xx status code" and hides the
 * body inside the error. This digs the sentence out, so the screen can say
 * "already registered" rather than a status code.
 */

interface WithContext {
  context?: { json?: () => Promise<unknown> }
}

/** The message a function meant to show, or the generic one it came with. */
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const response = (error as WithContext | null)?.context
  if (response && typeof response.json === 'function') {
    try {
      const body = (await response.json()) as { error?: unknown } | null
      const message = body?.error
      if (typeof message === 'string' && message.trim()) return message
    } catch {
      // Not JSON, or already read: fall through to the generic message.
    }
  }
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}
