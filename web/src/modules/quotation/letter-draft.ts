/**
 * The cover letter the assistant drafted, and what the Release form does with it
 * (roadmap 3.7, migration 0133).
 *
 * The rules live here rather than in the component so they can be tested without
 * a browser, the way `quotation-groups.ts` and `technical.ts` are. The component
 * shows what these functions return and calls `useWording` when a person presses
 * the button; it decides nothing itself.
 *
 * The one rule worth stating out loud: **a drafted letter never overwrites
 * something a person has already written.** The approver may have typed their
 * own subject before asking for a draft, and losing it to a machine is the sort
 * of small betrayal that stops people using a feature. So a field the assistant
 * drafted is offered, and only an empty field is filled without asking.
 */

import type { AssistantProposal, QuotationWording } from '../../lib/database.types'

/** The four boxes on the Release form that a drafted letter can fill. */
export interface LetterFields {
  subject: string
  intro_text: string
  closing_text: string
  notes_on_offer: string
}

/** The drafted letter, as the panel shows it: what it wrote, field by field. */
export interface DraftedLine {
  key: keyof LetterFields
  label: string
  text: string
  /** True when the form already holds something different, so using it replaces. */
  replaces: boolean
}

const LABELS: { key: keyof LetterFields; label: string; from: keyof QuotationWording }[] = [
  { key: 'subject', label: 'Subject line', from: 'subject' },
  { key: 'intro_text', label: 'Opening', from: 'opening' },
  { key: 'closing_text', label: 'Closing', from: 'closing' },
  { key: 'notes_on_offer', label: 'Notes on offer', from: 'notes' },
]

/** The newest quotation_wording proposal on this costing, or null. */
export function latestWording(proposals: AssistantProposal[]): AssistantProposal | null {
  return proposals.find((p) => p.type === 'quotation_wording') ?? null
}

/**
 * What the drafted letter offers, against what the form already holds. A field
 * the assistant left out is not offered at all — an empty offer is noise, and
 * the task tells it to leave out what the costing does not say.
 */
export function draftedLines(wording: QuotationWording, form: LetterFields): DraftedLine[] {
  const lines: DraftedLine[] = []
  for (const { key, label, from } of LABELS) {
    const text = (wording[from] ?? '').toString().trim()
    if (text === '') continue
    const current = (form[key] ?? '').trim()
    lines.push({ key, label, text, replaces: current !== '' && current !== text })
  }
  return lines
}

/**
 * The form after the approver presses "Use this wording". Everything drafted is
 * taken, because they pressed the button having read it — the `replaces` flag
 * above is what let them see, beforehand, which of their own words would go.
 */
export function useWording(wording: QuotationWording, form: LetterFields): LetterFields {
  const next = { ...form }
  for (const line of draftedLines(wording, form)) {
    next[line.key] = line.text
  }
  return next
}

/** How many of the approver's own lines a draft would replace, for the warning. */
export function replacedCount(wording: QuotationWording, form: LetterFields): number {
  return draftedLines(wording, form).filter((l) => l.replaces).length
}
