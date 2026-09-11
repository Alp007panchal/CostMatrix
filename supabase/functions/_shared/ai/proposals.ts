/**
 * The shapes a proposal may take (AI spec §6.3), checked before anything is
 * written to `assistant_proposals`. Hand-written rather than a schema library
 * so the Edge Function carries no extra dependency and the messages are plain.
 *
 * A proposal that fails here is reported back to the model as a tool error, in
 * words, so it can correct itself; it is never stored half-right.
 */

export type ProposalType = 'draft_costing' | 'review' | 'line_change'

export type Checked = { ok: true; value: Record<string, unknown> } | { ok: false; errors: string[] }

export function validateProposal(type: ProposalType, payload: unknown): Checked {
  if (!isRecord(payload)) return { ok: false, errors: ['payload must be an object'] }
  const errors: string[] = []
  switch (type) {
    case 'draft_costing':
      checkDraft(payload, errors)
      break
    case 'review':
      checkReview(payload, errors)
      break
    case 'line_change':
      checkLineChange(payload, '', errors)
      break
  }
  return errors.length === 0 ? { ok: true, value: payload } : { ok: false, errors }
}

const CONFIDENCE = ['high', 'medium', 'low']
const SEVERITY = ['blocker', 'warning', 'note']
const LINE_KIND = ['kit', 'component']
const LINE_ACTION = ['add', 'change_qty', 'remove', 'set_parameter']

function checkDraft(p: Record<string, unknown>, errors: string[]): void {
  if (typeof p['summary'] !== 'string' || p['summary'].trim() === '') errors.push('summary is required')
  if (!Array.isArray(p['panels']) || p['panels'].length === 0) {
    errors.push('panels must be a non-empty list')
    return
  }
  p['panels'].forEach((panel, i) => {
    const at = `panels[${i}]`
    if (!isRecord(panel)) return void errors.push(`${at} must be an object`)
    if (typeof panel['name'] !== 'string' || panel['name'].trim() === '') errors.push(`${at}.name is required`)
    if (panel['qty'] !== undefined && !(typeof panel['qty'] === 'number' && panel['qty'] > 0)) errors.push(`${at}.qty must be a positive number`)
    if (panel['parameters'] !== undefined && !isRecord(panel['parameters'])) errors.push(`${at}.parameters must be an object`)
    if (!Array.isArray(panel['lines'])) {
      errors.push(`${at}.lines must be a list`)
    } else {
      panel['lines'].forEach((line, j) => checkDraftLine(line, `${at}.lines[${j}]`, errors))
    }
    if (panel['unresolved'] !== undefined) {
      if (!Array.isArray(panel['unresolved'])) errors.push(`${at}.unresolved must be a list`)
      else {
        panel['unresolved'].forEach((u, j) => {
          if (!isRecord(u) || typeof u['text'] !== 'string') errors.push(`${at}.unresolved[${j}].text is required`)
        })
      }
    }
  })
  if (p['notes_for_engineer'] !== undefined && !Array.isArray(p['notes_for_engineer'])) {
    errors.push('notes_for_engineer must be a list of sentences')
  }
}

function checkDraftLine(line: unknown, at: string, errors: string[]): void {
  if (!isRecord(line)) return void errors.push(`${at} must be an object`)
  if (!LINE_KIND.includes(String(line['kind']))) errors.push(`${at}.kind must be kit or component`)
  if (typeof line['ref_id'] !== 'string' || !looksLikeUuid(line['ref_id'])) errors.push(`${at}.ref_id must be a kit or component id from a search result`)
  if (typeof line['name'] !== 'string' || line['name'].trim() === '') errors.push(`${at}.name is required`)
  if (!(typeof line['qty'] === 'number' && line['qty'] > 0)) errors.push(`${at}.qty must be a positive number`)
  if (!CONFIDENCE.includes(String(line['confidence']))) errors.push(`${at}.confidence must be high, medium or low`)
  if (typeof line['reason'] !== 'string') errors.push(`${at}.reason is required`)
  checkEvidence(line['evidence'], `${at}.evidence`, errors, false)
}

function checkReview(p: Record<string, unknown>, errors: string[]): void {
  if (typeof p['summary'] !== 'string') errors.push('summary is required')
  if (!Array.isArray(p['findings'])) return void errors.push('findings must be a list')
  p['findings'].forEach((f, i) => {
    const at = `findings[${i}]`
    if (!isRecord(f)) return void errors.push(`${at} must be an object`)
    if (!SEVERITY.includes(String(f['severity']))) errors.push(`${at}.severity must be blocker, warning or note`)
    if (typeof f['code'] !== 'string') errors.push(`${at}.code is required`)
    if (typeof f['text'] !== 'string' || f['text'].trim() === '') errors.push(`${at}.text is required`)
    checkEvidence(f['evidence'], `${at}.evidence`, errors, true)
    if (f['proposal'] !== undefined) checkLineChange(f['proposal'], `${at}.proposal.`, errors)
  })
}

function checkLineChange(p: unknown, prefix: string, errors: string[]): void {
  if (!isRecord(p)) return void errors.push(`${prefix || ''}line change must be an object`)
  if (!LINE_ACTION.includes(String(p['action']))) errors.push(`${prefix}action must be add, change_qty, remove or set_parameter`)
  if (typeof p['reason'] !== 'string') errors.push(`${prefix}reason is required`)
  const action = String(p['action'])
  if (action !== 'add' && typeof p['panel_line_item_id'] !== 'string') errors.push(`${prefix}panel_line_item_id is required`)
  if ((action === 'add' || action === 'change_qty') && !(typeof p['qty'] === 'number' && p['qty'] > 0)) errors.push(`${prefix}qty must be a positive number`)
  if (action === 'add' && typeof p['ref'] !== 'string') errors.push(`${prefix}ref (a kit or component id) is required to add`)
  if (action === 'set_parameter' && typeof p['parameter'] !== 'string') errors.push(`${prefix}parameter is required`)
}

function checkEvidence(e: unknown, at: string, errors: string[], optional: boolean): void {
  if (e === undefined || e === null) {
    if (!optional) errors.push(`${at} is required: cite the document and page`)
    return
  }
  if (!isRecord(e)) return void errors.push(`${at} must be an object`)
  if (e['document_id'] !== undefined && typeof e['document_id'] !== 'string') errors.push(`${at}.document_id must be a string`)
  if (e['page'] !== undefined && typeof e['page'] !== 'number') errors.push(`${at}.page must be a number`)
  if (e['quote'] !== undefined && typeof e['quote'] !== 'string') errors.push(`${at}.quote must be text`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
