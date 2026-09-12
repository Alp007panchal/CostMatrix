import type {
  AssistantProposal, DraftLine, DraftPanel, Evidence, LineChange, ProposalPayload, ReviewFinding,
} from '../../lib/database.types'
import type { ApplyDecisions } from './api'

/**
 * Reading a proposal's payload for the screen, and turning the engineer's
 * Accept / Change / Reject choices back into what `apply_proposal` wants.
 *
 * Pure: no React and no network, because these rules are the ones worth testing
 * — above all that a Low-confidence line is never applied unless somebody
 * accepted it on purpose (AI spec §3.2).
 */

export interface DraftRow {
  /** Where it sits in the proposal: the nth panel, the nth line of that panel. */
  panel: number
  line: number
  panelName: string
  section: string | null
  kind: 'kit' | 'component'
  refId: string
  name: string
  qty: number
  confidence: 'high' | 'medium' | 'low'
  reason: string | null
  evidence: Evidence | null
}

export type Choice = 'accept' | 'reject'

export interface RowChoice {
  choice: Choice
  /** Set when the engineer changed the kit; otherwise the model's own. */
  refId?: string
  name?: string
  qty?: number
}

export function summaryOf(payload: ProposalPayload): string | null {
  const s = (payload as { summary?: unknown }).summary
  return typeof s === 'string' && s.trim() ? s : null
}

export function panelsOf(payload: ProposalPayload): DraftPanel[] {
  const panels = (payload as { panels?: unknown }).panels
  return Array.isArray(panels) ? (panels as DraftPanel[]) : []
}

export function draftRows(payload: ProposalPayload): DraftRow[] {
  const rows: DraftRow[] = []
  panelsOf(payload).forEach((panel, p) => {
    const lines = Array.isArray(panel.lines) ? panel.lines : []
    lines.forEach((line: DraftLine, l) => {
      rows.push({
        panel: p,
        line: l,
        panelName: panel.name || `Panel ${p + 1}`,
        section: line.section ?? null,
        kind: line.kind === 'component' ? 'component' : 'kit',
        refId: line.ref_id,
        name: line.name,
        qty: Number(line.qty) || 1,
        confidence: line.confidence === 'high' || line.confidence === 'medium' ? line.confidence : 'low',
        reason: line.reason ?? null,
        evidence: line.evidence ?? null,
      })
    })
  })
  return rows
}

export function unresolvedOf(payload: ProposalPayload): { text: string; suggestion?: string; evidence?: Evidence }[] {
  return panelsOf(payload).flatMap((panel) => (Array.isArray(panel.unresolved) ? panel.unresolved : []))
}

export function notesOf(payload: ProposalPayload): string[] {
  const notes = (payload as { notes_for_engineer?: unknown }).notes_for_engineer
  return Array.isArray(notes) ? notes.filter((n): n is string => typeof n === 'string') : []
}

const SEVERITY_ORDER = { blocker: 0, warning: 1, note: 2 } as const

/** Findings with their original index kept, most serious first (spec §3.3). */
export function findingsOf(payload: ProposalPayload): (ReviewFinding & { index: number })[] {
  const findings = (payload as { findings?: unknown }).findings
  if (!Array.isArray(findings)) return []
  return (findings as ReviewFinding[])
    .map((f, index) => ({ ...f, index }))
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3))
}

export function lineChangeOf(payload: ProposalPayload): LineChange | null {
  const action = (payload as { action?: unknown }).action
  return typeof action === 'string' ? (payload as LineChange) : null
}

/**
 * What the card starts with: High and Medium accepted, **Low rejected** — a Low
 * line is the nearest guess, so applying it needs a person's click (§3.2).
 */
export function defaultChoices(rows: DraftRow[]): Record<string, RowChoice> {
  return Object.fromEntries(
    rows.map((r) => [rowKey(r), { choice: r.confidence === 'low' ? 'reject' : 'accept' } as RowChoice]),
  )
}

export function rowKey(row: { panel: number; line: number }): string {
  return `${row.panel}.${row.line}`
}

/** The accepted lines, in the shape `apply_proposal` takes. Rejected ones are absent. */
export function decisionsFor(
  rows: DraftRow[],
  choices: Record<string, RowChoice>,
  extra: { title?: string } = {},
): ApplyDecisions {
  const lines = rows
    .map((row) => ({ row, chosen: choices[rowKey(row)] }))
    .filter(({ chosen }) => chosen?.choice === 'accept')
    .map(({ row, chosen }) => ({
      panel: row.panel,
      line: row.line,
      kind: row.kind,
      ref_id: chosen?.refId ?? row.refId,
      qty: chosen?.qty ?? row.qty,
      ...(row.section ? { section: row.section } : {}),
    }))
  return { lines, ...(extra.title ? { title: extra.title } : {}) }
}

export function acceptedCount(rows: DraftRow[], choices: Record<string, RowChoice>): number {
  return rows.filter((r) => choices[rowKey(r)]?.choice === 'accept').length
}

/** "spec.pdf p.2 — “1 No. 1600A FP ACB”", as short as the evidence allows. */
export function evidenceText(evidence: Evidence | null | undefined, fileName?: string | null): string {
  if (!evidence) return ''
  const parts: string[] = []
  if (fileName) parts.push(fileName)
  if (typeof evidence.page === 'number') parts.push(`p.${evidence.page}`)
  const where = parts.join(' ')
  const quote = evidence.quote?.trim()
  if (where && quote) return `${where} — “${quote}”`
  return quote ? `“${quote}”` : where
}

/** Which findings of a review have already been applied, so they are not offered twice. */
export function appliedFindings(proposal: AssistantProposal): number[] {
  const applied = proposal.result?.findings_applied
  return Array.isArray(applied) ? applied.filter((n): n is number => typeof n === 'number') : []
}

export function isOpen(proposal: AssistantProposal): boolean {
  return proposal.status === 'open' || proposal.status === 'partially_applied'
}
