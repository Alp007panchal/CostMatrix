import { useQuery } from '@tanstack/react-query'
import { fitSentence } from '../library/dimension-fields'
import { panelFit } from './api'

/**
 * One line on a panel saying whether what is on it will fit the cubicles bought
 * for it (foundations F12). Area only — the real arrangement is the layout canvas
 * of a later phase — and silent while nothing has been measured, so it never
 * nags a library that has no dimensions in it yet.
 *
 * It changes no price and nothing depends on it; it is a warning, not a rule.
 */
export function PanelFitLine({ panelId }: { panelId: string }) {
  const fit = useQuery({ queryKey: ['panel-fit', panelId], queryFn: () => panelFit(panelId) })
  if (!fit.data) return null

  // Nothing measured at all: say nothing rather than explain an empty answer.
  if (fit.data.verdict === 'unknown' && fit.data.kits_measured === 0) return null

  const { tone, text } = fitSentence(fit.data)
  const className = tone === 'ok' ? 'ok' : tone === 'error' ? 'error' : 'muted'
  return (
    <p className={className} style={{ fontSize: '.8125rem', margin: '.3rem 0 0' }}>
      {text}
    </p>
  )
}
