/**
 * The company's approval rules in words (roadmap 2.5). The database decides;
 * this turns a rule into a sentence a person can read and check, and turns the
 * boxes on the screen back into the condition the database stores.
 *
 * Pure, so the part that is easy to get wrong — a rule that reads as the
 * opposite of what it does — is covered by tests.
 */

export type ApprovalOutcome = 'auto_approve' | 'require_approver' | 'require_master_admin' | 'block'

export interface ApprovalCondition {
  field: string
  op: string
  value: unknown
  /** Filled by app.approval_review when a rule is shown against one costing. */
  holds?: boolean
  actual?: unknown
}

export interface ApprovalRule {
  id: string
  company_id: string
  sort_order: number
  name: string
  condition: ApprovalCondition[]
  outcome: ApprovalOutcome
  is_active: boolean
}

/** The facts a rule may test, as app.costing_facts returns them. */
export const FACTS: { field: string; label: string; kind: 'money' | 'percent' | 'days' | 'yes_no' | 'number' }[] = [
  { field: 'total_ex_vat', label: 'Job total before VAT', kind: 'money' },
  { field: 'profit_margin_pct', label: 'Profit margin (the lower of material and labour)', kind: 'percent' },
  { field: 'material_margin_pct', label: 'Material margin', kind: 'percent' },
  { field: 'labour_margin_pct', label: 'Labour margin', kind: 'percent' },
  { field: 'negotiation_margin_pct', label: 'Negotiation margin', kind: 'percent' },
  { field: 'uses_placeholder_part', label: 'Has a part with no price', kind: 'yes_no' },
  { field: 'placeholder_parts', label: 'How many parts have no price', kind: 'number' },
  { field: 'price_age_days', label: 'How old the prices are, in days', kind: 'days' },
  { field: 'revision_no', label: 'Revision number', kind: 'number' },
]

export const OPERATORS: { op: string; label: string; numeric: boolean }[] = [
  { op: '<', label: 'is under', numeric: true },
  { op: '<=', label: 'is at most', numeric: true },
  { op: '>', label: 'is over', numeric: true },
  { op: '>=', label: 'is at least', numeric: true },
  { op: '=', label: 'is', numeric: false },
  { op: '!=', label: 'is not', numeric: false },
]

export const OUTCOMES: { outcome: ApprovalOutcome; label: string; blurb: string }[] = [
  { outcome: 'auto_approve', label: 'Approve it automatically', blurb: 'no person has to look at it' },
  { outcome: 'require_approver', label: 'An approver must approve it', blurb: 'what happens today' },
  { outcome: 'require_master_admin', label: 'Only the master administrator may approve it', blurb: 'for the largest jobs' },
  { outcome: 'block', label: 'It cannot be submitted at all', blurb: 'fix the costing first' },
]

const fact = (field: string) => FACTS.find((f) => f.field === field)

/** "12,000" / "12 %" / "30 days" / "yes", by what the fact is. */
export function factValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return 'not known'
  const kind = fact(field)?.kind
  if (kind === 'yes_no') return value === true || value === 'true' ? 'yes' : 'no'
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  switch (kind) {
    case 'money': return n.toLocaleString('en-GB')
    case 'percent': return `${n} %`
    case 'days': return `${n} day${n === 1 ? '' : 's'}`
    default: return String(n)
  }
}

/** One condition as a sentence: "Job total before VAT is over 10,000,000". */
export function conditionSentence(condition: ApprovalCondition): string {
  const label = fact(condition.field)?.label ?? condition.field
  const op = OPERATORS.find((o) => o.op === condition.op)?.label ?? condition.op
  return `${label} ${op} ${factValue(condition.field, condition.value)}`
}

/** A whole rule as a sentence, for the list and for the "why" panel. */
export function ruleSentence(rule: Pick<ApprovalRule, 'condition' | 'outcome'>): string {
  const outcome = OUTCOMES.find((o) => o.outcome === rule.outcome)?.label ?? rule.outcome
  if (rule.condition.length === 0) return `Always: ${outcome.toLowerCase()}`
  return `When ${rule.condition.map(conditionSentence).join(' and ')}: ${outcome.toLowerCase()}`
}

/** What the verdict means for the person looking at the costing. */
export function verdictSentence(outcome: string, ruleName: string | null): string {
  switch (outcome) {
    case 'auto_approve':
      return `This one approves itself when you submit it — ${ruleName ?? 'a rule'} says so. Nobody else has to look at it.`
    case 'require_master_admin':
      return `Only the master administrator may approve this one: ${ruleName ?? 'a rule'}.`
    case 'block':
      return `This cannot be submitted as it stands: ${ruleName ?? 'a rule'}.`
    default:
      return `An approver has to approve this one${ruleName ? `: ${ruleName}` : ''}.`
  }
}

/** What is wrong with a rule somebody is typing, in one sentence, or nothing. */
export function ruleProblem(rule: {
  name: string
  condition: { field: string; op: string; value: string }[]
}): string | null {
  if (rule.name.trim() === '') return 'Give the rule a name, so the history can say which rule decided.'
  for (const c of rule.condition) {
    if (!fact(c.field)) return `"${c.field}" is not something a rule can test.`
    if (!OPERATORS.some((o) => o.op === c.op)) return `"${c.op}" is not a comparison.`
    const kind = fact(c.field)?.kind
    if (kind === 'yes_no') {
      if (!['true', 'false'].includes(c.value)) return 'A yes-or-no fact is compared with yes or no.'
      if (!['=', '!='].includes(c.op)) return 'A yes-or-no fact can only be "is" or "is not".'
    } else if (c.value.trim() === '' || !Number.isFinite(Number(c.value))) {
      return `"${c.value}" is not a number.`
    }
  }
  return null
}

/** The boxes on the screen as the database stores them. */
export function toCondition(rows: { field: string; op: string; value: string }[]): ApprovalCondition[] {
  return rows.map((r) => ({
    field: r.field,
    op: r.op,
    value: fact(r.field)?.kind === 'yes_no' ? r.value === 'true' : Number(r.value),
  }))
}

/** And back again, for editing one that is already saved. */
export function toRows(condition: ApprovalCondition[]): { field: string; op: string; value: string }[] {
  return condition.map((c) => ({
    field: c.field,
    op: c.op,
    value: typeof c.value === 'boolean' ? String(c.value) : String(c.value ?? ''),
  }))
}
