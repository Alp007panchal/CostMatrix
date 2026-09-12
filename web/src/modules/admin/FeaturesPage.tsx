import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import type { CompanyFeature } from '../../lib/database.types'
import { listFeatures, setFeature } from './api'
import { featureSummary, orderFeatures, switchNote } from './features'

/**
 * What this company has switched on (the road to production). Every advanced
 * feature arrives **off**, and only the master administrator may switch one on —
 * the database refuses anybody else, so this screen shows the switch to a
 * company administrator as read-only rather than pretending.
 *
 * The three marked in red change what an existing costing does. Those are worth
 * trying on staging before they are switched on for work that goes to a customer.
 */
export function FeaturesPage() {
  const { company, isMasterAdmin } = useSession()
  const queryClient = useQueryClient()
  const features = useQuery({ queryKey: ['features'], queryFn: listFeatures })

  const flip = useMutation({
    mutationFn: ({ feature, on }: { feature: CompanyFeature; on: boolean }) =>
      setFeature(company?.id as string, feature.option_key, on),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['features'] })
      // Everything downstream of a switch: the totals, the panels, the rules.
      await queryClient.invalidateQueries({ queryKey: ['costing'] })
    },
  })

  if (!company) return null

  return (
    <>
      <h1>Features</h1>
      <p className="muted">
        Everything built since the foundations arrives <strong>switched off</strong>, for every
        company, and stays off until it is switched on here. That is what lets new work reach the
        live app one piece at a time instead of all at once.
      </p>
      <p className="muted">
        Three of them <span className="error">change what an existing costing does</span> and are
        marked. Try those on the staging app first and read a real job's total before and after.
        {!isMasterAdmin && ' Only the master administrator can change these.'}
      </p>

      {flip.error && <p className="error">{String(flip.error)}</p>}

      <Async query={features} empty="No features yet.">
        {(list) => (
          <>
            <p className="muted">{featureSummary(list)}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Feature</th><th>What it does</th><th>State</th></tr>
                </thead>
                <tbody>
                  {orderFeatures(list).map((feature) => (
                    <tr key={feature.code} className={feature.is_on ? undefined : 'inactive'}>
                      <td>
                        <div><strong>{feature.name}</strong></div>
                        <div
                          className={feature.changes_costings ? 'error' : 'muted'}
                          style={{ fontSize: '.8125rem' }}
                        >
                          {switchNote(feature)}
                        </div>
                      </td>
                      <td className="muted" style={{ maxWidth: '34rem' }}>{feature.blurb}</td>
                      <td>
                        {isMasterAdmin ? (
                          <button
                            className={feature.is_on ? undefined : 'primary'}
                            disabled={flip.isPending}
                            onClick={() => flip.mutate({ feature, on: !feature.is_on })}
                          >
                            {feature.is_on ? 'Switch off' : 'Switch on'}
                          </button>
                        ) : (
                          <span className="muted">{feature.is_on ? 'On' : 'Off'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Async>
    </>
  )
}
