import { useQuery } from '@tanstack/react-query'
import type { CompanyFeature } from '../../lib/database.types'
import { isOn } from './features'
import { listFeatures } from './api'

/**
 * Which advanced features are switched on here. One query, cached under one key,
 * so the navigation, the costing screen and the Features page ask once between
 * them rather than once each.
 *
 * While it is loading, `on()` answers **false** — a feature that flickers into
 * view and out again is worse than one that appears a moment late.
 */
export function useFeatures(): { features: CompanyFeature[]; on: (code: string) => boolean } {
  const query = useQuery({ queryKey: ['features'], queryFn: listFeatures, staleTime: 5 * 60_000 })
  const features = query.data ?? []
  return { features, on: (code: string) => isOn(query.data, code) }
}
