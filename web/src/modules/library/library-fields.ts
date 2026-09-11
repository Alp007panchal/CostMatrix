/**
 * The two free-text boxes migration 0100 added to the library forms (foundations
 * F1 and F2). Pure functions in a file of their own, like sections.ts and
 * kvar.ts, so they can be tested without the Supabase client.
 */

/**
 * The attributes box is free text, so it is checked here rather than letting
 * Postgres refuse the whole save with a message about JSON syntax.
 * Returns the value to store, or an error to show.
 */
export function parseAttributes(
  text: string,
): { value: Record<string, unknown> } | { error: string } {
  const trimmed = text.trim()
  if (trimmed === '') return { value: {} }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { error: 'Attributes must look like {"name": "value"}. Check the brackets and quotes.' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      error: 'Attributes must be a list of name and value pairs, not a single value or a list.',
    }
  }
  return { value: parsed as Record<string, unknown> }
}

/**
 * Labels typed as a comma-separated list. Blanks dropped, spaces trimmed, case
 * folded down and duplicates removed, so "Incomer, incomer , " is one label.
 */
export function parseTags(text: string): string[] {
  const seen = new Set<string>()
  for (const raw of text.split(',')) {
    const tag = raw.trim().toLowerCase()
    if (tag !== '') seen.add(tag)
  }
  return [...seen]
}
