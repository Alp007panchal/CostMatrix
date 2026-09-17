import { useSession } from '../auth/session'
import { AssistantPanel } from './AssistantPanel'

/**
 * Ask the assistant about the company's own jobs (roadmap 3.7, migration 0135).
 *
 * The same panel as on an enquiry and a costing, pointed at the company rather
 * than a record: the conversation's entity is the company itself, so the model
 * has no one costing in front of it and finds what a question needs with
 * `search_costings`.
 *
 * **It answers; it cannot change anything.** A proposal must be about a costing
 * or an enquiry — the database's own check constraint says so — so there is
 * nothing to apply here, and `canApply` is false for the same reason it is on
 * a read-only screen: there is no Apply to press.
 *
 * Behind the `assistant` switch through the route, which is off by default.
 */
export function AssistantPage() {
  const { company } = useSession()
  if (!company) return null

  return (
    <>
      <h1>Ask about your jobs</h1>
      <p className="muted">
        Questions across {company.name}’s own costings and quotations — what you quoted a customer,
        what is waiting for approval, what a job came to. It reads only what you could see by
        clicking, and it answers: to change a costing, open the costing and ask there.
      </p>
      <AssistantPanel entityType="company" entityId={company.id} canApply={false} startOpen />
    </>
  )
}
