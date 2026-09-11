/**
 * May this request run? (AI spec §4: a per-company monthly token budget with a
 * soft warning at 80 % and a hard stop at 100 %, and a per-user rate limit.)
 *
 * Pure: the numbers come from app.assistant_allowance() and the answer is a
 * decision. The Edge Function asks this BEFORE it constructs a provider, so a
 * refused request costs nothing and calls nobody (acceptance test 6).
 */

export interface Allowance {
  enabled: boolean
  monthly_token_budget: number
  used_this_month: number
  recent_requests: number
  rate_limit_per_minute: number
}

export type Decision =
  | { ok: true; warning: string | null; remaining: number }
  | { ok: false; status: 403 | 429; reason: string }

export const WARN_AT = 0.8

export function decideAllowance(raw: unknown): Decision {
  const a = normalise(raw)

  if (!a.enabled) {
    return {
      ok: false,
      status: 403,
      reason: 'The assistant is switched off for your company. The master administrator can turn it on.',
    }
  }

  if (a.recent_requests >= a.rate_limit_per_minute) {
    return {
      ok: false,
      status: 429,
      reason: `That is ${a.recent_requests} requests in the last minute; the limit is ${a.rate_limit_per_minute}. Wait a moment.`,
    }
  }

  // A budget of zero means "no budget set": refuse, so nobody spends money by
  // omission. Raising it is a company setting, not a code change.
  if (a.monthly_token_budget <= 0) {
    return {
      ok: false,
      status: 403,
      reason: 'No monthly token budget is set for your company, so the assistant will not run. Your administrator sets it.',
    }
  }

  const remaining = a.monthly_token_budget - a.used_this_month
  if (remaining <= 0) {
    return {
      ok: false,
      status: 429,
      reason: `Your company has used its assistant budget for this month (${fmt(a.used_this_month)} of ${fmt(a.monthly_token_budget)} tokens). It resets on the 1st; your administrator can raise it.`,
    }
  }

  const used = a.used_this_month / a.monthly_token_budget
  return {
    ok: true,
    remaining,
    warning:
      used >= WARN_AT
        ? `Your company has used ${Math.round(used * 100)} % of this month’s assistant budget (${fmt(a.used_this_month)} of ${fmt(a.monthly_token_budget)} tokens).`
        : null,
  }
}

function normalise(raw: unknown): Allowance {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    enabled: r['enabled'] === true,
    monthly_token_budget: num(r['monthly_token_budget']),
    used_this_month: num(r['used_this_month']),
    recent_requests: num(r['recent_requests']),
    rate_limit_per_minute: num(r['rate_limit_per_minute']) || 20,
  }
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function fmt(n: number): string {
  return n.toLocaleString('en-GB')
}
