import type { BoardAnswers, BoardLine, BoardProposal, FeederAnswer } from '../../lib/database.types'

/**
 * The few things the board configurator works out on screen (roadmap 3.1). The
 * choosing of kits is in the database (`app.propose_board`, and `app.propose_apfc`
 * for the correction) and is not repeated here: two implementations of one rule
 * are two answers waiting to disagree. These shape the answers, say what is still
 * missing from them, and put a proposal into words.
 */

export const SOURCES = ['grid', 'generator', 'solar'] as const
export const CHANGEOVERS = [
  { value: '', label: 'No changeover' },
  { value: 'ats', label: 'Automatic (ATS)' },
  { value: 'manual', label: 'Manual changeover' },
  { value: 'switch', label: 'Changeover switch' },
  { value: 'sync', label: 'Synchronised, running in parallel' },
] as const

export function emptyAnswers(): BoardAnswers {
  return {
    sources: ['grid'],
    incomer_rating_a: null,
    incomer_type: 'acb',
    changeover: '',
    feeders: [{ rating_a: 0, quantity: 0, type: 'mccb' }],
    apfc_kvar: null,
    metering: false,
    form: '',
    ip: '',
    access: '',
    cable_entry: '',
  }
}

/** What still has to be answered before there is anything to work out. */
export function answersProblem(answers: BoardAnswers): string | null {
  if (!(Number(answers.incomer_rating_a) > 0)) return 'Say what the incomer is rated at, in amps.'
  if (answers.sources.length === 0) return 'A board needs at least one supply.'
  if (answers.changeover !== '' && answers.sources.length < 2) {
    return 'A changeover needs two supplies — add the generator or solar, or take the changeover off.'
  }
  const feeders = keptFeeders(answers)
  if (feeders.length === 0 && !answers.metering && !(Number(answers.apfc_kvar) > 0)) {
    return 'Add at least one outgoing way, or the metering or correction the board is for.'
  }
  if (feeders.some((f) => !(f.rating_a > 0))) return 'Every outgoing way needs a rating in amps.'
  return null
}

/** The feeder rows with something in them: a blank row is one nobody filled in. */
export function keptFeeders(answers: BoardAnswers): FeederAnswer[] {
  return answers.feeders
    .map((f) => ({ ...f, rating_a: Number(f.rating_a), quantity: Number(f.quantity) }))
    .filter((f) => f.rating_a > 0 && f.quantity > 0)
}

/** The answers as the database wants them: blanks dropped, numbers as numbers. */
export function toQuestionPayload(answers: BoardAnswers): Record<string, unknown> {
  return {
    sources: answers.sources,
    incomer_rating_a: Number(answers.incomer_rating_a),
    incomer_type: answers.incomer_type === '' ? null : answers.incomer_type,
    changeover: answers.changeover === '' ? null : answers.changeover,
    feeders: keptFeeders(answers),
    apfc_kvar: Number(answers.apfc_kvar) > 0 ? Number(answers.apfc_kvar) : null,
    metering: answers.metering,
    form: answers.form.trim() || null,
    ip: answers.ip.trim() || null,
    access: answers.access.trim() || null,
    cable_entry: answers.cable_entry.trim() || null,
  }
}

/** Lines worth applying: a quantity set to zero is a line the engineer took out. */
export function linesToApply(lines: BoardLine[]): BoardLine[] {
  return lines.filter((line) => Number(line.quantity) > 0)
}

/** The proposal grouped the way a board is read, sections in the engine's order. */
export const SECTION_ORDER = ['Incomer', '2nd incomer', 'ATS', 'Outgoers', 'Accessories', 'APFC bank']

export function bySection(lines: BoardLine[]): { section: string; lines: BoardLine[] }[] {
  const groups = new Map<string, BoardLine[]>()
  for (const line of lines) {
    groups.set(line.section, [...(groups.get(line.section) ?? []), line])
  }
  const rank = (section: string) => {
    const i = SECTION_ORDER.indexOf(section)
    return i === -1 ? SECTION_ORDER.length : i
  }
  return [...groups.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([section, group]) => ({ section, lines: group }))
}

/** "14 kits in 5 sections" — what applying would put on the panel. */
export function describeBoard(lines: BoardLine[]): string {
  const kept = linesToApply(lines)
  const kits = kept.reduce((sum, line) => sum + Number(line.quantity), 0)
  if (kits === 0) return 'nothing yet'
  const sections = new Set(kept.map((l) => l.section)).size
  return `${round(kits)} kit${kits === 1 ? '' : 's'} in ${sections} section${sections === 1 ? '' : 's'}`
}

/** The lines whose kit is bigger than what was asked for, which is worth saying. */
export function notExact(lines: BoardLine[]): BoardLine[] {
  return linesToApply(lines).filter((line) => line.exact === false)
}

/** One sentence on what the proposal does not cover, or null when it covers it all. */
export function gapsSentence(proposal: BoardProposal): string | null {
  if (proposal.missing.length === 0) return null
  const first = proposal.missing[0]
  if (!first) return null
  return proposal.missing.length === 1
    ? `${first.what}: ${first.why}.`
    : `${first.what}: ${first.why}. And ${proposal.missing.length - 1} more the library cannot answer.`
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
