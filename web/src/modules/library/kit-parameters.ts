import type { KitParameter } from '../../lib/database.types'

/**
 * The answers a parameterised kit is added with, worked out on screen so the
 * engineer sees the problem before pressing Add. The database checks the same
 * things again in `app.kit_parameter_values` and has the final word; this is
 * only so the message arrives sooner. Pure, so it is tested.
 */

/** The defaults a kit offers, as the form starts. */
export function startingAnswers(parameters: KitParameter[]): Record<string, string> {
  const answers: Record<string, string> = {}
  for (const p of parameters) answers[p.name] = p.default_value ?? ''
  return answers
}

/** What is wrong with one answer, in the words the person needs, or null. */
export function answerProblem(parameter: KitParameter, answer: string): string | null {
  const given = (answer ?? '').trim()
  if (given === '') return `${parameter.name} is needed before this kit can be added`
  if (parameter.value_type !== 'number') return null
  if (!/^-?\d+(\.\d+)?$/.test(given)) return `${parameter.name} must be a number`
  const value = Number(given)
  if (parameter.min_value != null && value < parameter.min_value) {
    return `${parameter.name} must be at least ${parameter.min_value}`
  }
  if (parameter.max_value != null && value > parameter.max_value) {
    return `${parameter.name} must be at most ${parameter.max_value}`
  }
  return null
}

/** Every problem, so the form can say them all rather than one at a time. */
export function answerProblems(
  parameters: KitParameter[],
  answers: Record<string, string>,
): string[] {
  return parameters
    .map((p) => answerProblem(p, answers[p.name] ?? ''))
    .filter((message): message is string => message !== null)
}

/** "9 m of busbar, 6 steps" — what a kit line was worked out from, for the panel. */
export function describeAnswers(
  answers: Record<string, string>,
  parameters: KitParameter[] = [],
): string {
  const units = new Map(parameters.map((p) => [p.name, p.unit]))
  return Object.entries(answers)
    .map(([name, value]) => {
      const unit = units.get(name)
      return `${name.replace(/_/g, ' ')} ${value}${unit ? ` ${unit}` : ''}`
    })
    .join(', ')
}
