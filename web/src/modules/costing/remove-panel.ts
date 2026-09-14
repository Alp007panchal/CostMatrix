import type { CostingAssembly, CostingPanel, PanelPrice } from '../../lib/database.types'

/**
 * What the app asks before it deletes a panel.
 *
 * Until now it asked nothing: **Remove panel** in the panel tab deleted a panel
 * and every kit on it on one click, with no undo and no trace — the one genuinely
 * destructive button in the costing editor was also the only one that never
 * checked. Adding the same button to the grid made that worse rather than better,
 * so the question comes first and both buttons go through this.
 *
 * The wording is here, and pure, because it is the thing that has to be right: a
 * person reading "Remove panel?" clicks yes, and a person reading "Remove MDB
 * 1600 A? It has 7 kits on it, worth KES 7,537,900" reads it again. So the
 * message names the panel, says how much is on it and what it is worth, and says
 * plainly that nothing brings it back.
 */

export interface RemovalFacts {
  panel: CostingPanel
  /** The kit and free lines on this panel. */
  lines: CostingAssembly[]
  price: PanelPrice | undefined
  /** How a price is written, so this file needs no formatting helper. */
  money: (amount: number) => string
}

export function removalMessage({ panel, lines, price, money }: RemovalFacts): string {
  const kits = lines.filter((l) => l.kind === 'kit').length
  const free = lines.filter((l) => l.kind === 'free').length
  const what = [
    kits === 0 ? null : `${kits} kit${kits === 1 ? '' : 's'}`,
    free === 0 ? null : `${free} line${free === 1 ? '' : 's'} of loose parts`,
  ].filter((s) => s !== null)

  const worth = price === undefined || price.line_total === 0 ? null : money(price.line_total)

  if (what.length === 0 && worth === null) {
    return `Remove “${panel.name}”? It is empty, so nothing is lost — but it does not come back.`
  }

  const holds = what.length === 0 ? 'It holds nothing' : `It holds ${what.join(' and ')}`
  const value = worth === null ? '' : `, worth ${worth}`
  return `Remove “${panel.name}”? ${holds}${value}. This cannot be undone, and the costing is repriced without it.`
}

/**
 * Asks, then removes. The one place `window.confirm` is called for a panel, so a
 * second screen cannot quietly grow a delete that skips the question.
 */
export function confirmRemovePanel(facts: RemovalFacts, remove: () => void): void {
  if (window.confirm(removalMessage(facts))) remove()
}
