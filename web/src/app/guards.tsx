import type { ReactNode } from 'react'
import { useSession } from '../modules/auth/session'
import { SignInPage } from '../modules/auth/SignInPage'
import type { UserRole } from '../lib/database.types'

/**
 * Route guards. These decide what to render, not what is permitted: every rule
 * here is enforced again by row-level security in the database, which is the
 * only place that matters. A screen that forgets to hide a button is untidy;
 * the database still refuses the write.
 */

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useSession()

  if (loading) return <p className="empty">Loading…</p>
  if (!session) return <SignInPage />

  // Signed in with no profile: the account exists in Supabase but nobody has
  // attached it to a company. Say so plainly rather than show an empty app.
  if (!profile) {
    return (
      <Message title="Almost there">
        Your sign-in works, but your account has not been added to a company yet. Ask your
        administrator to finish setting you up.
      </Message>
    )
  }

  if (!profile.is_active) {
    return (
      <Message title="Account deactivated">
        This account has been deactivated. Speak to your administrator if that is wrong.
      </Message>
    )
  }

  return <>{children}</>
}

/**
 * Renders children for the master admin, or for anyone holding `role`.
 * `masterAdminOnly` narrows a screen to the master admin alone.
 */
export function RequireRole({
  role,
  masterAdminOnly = false,
  children,
}: {
  role?: UserRole
  masterAdminOnly?: boolean
  children: ReactNode
}) {
  const { hasRole, isMasterAdmin } = useSession()
  const allowed = masterAdminOnly ? isMasterAdmin : isMasterAdmin || (role !== undefined && hasRole(role))

  if (!allowed) {
    return (
      <div className="card">
        <h1>Not your screen</h1>
        <p className="muted">
          You do not have the role this page needs. If you think you should, ask your company
          administrator to give it to you.
        </p>
      </div>
    )
  }

  return <>{children}</>
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="centred">
      <div className="card narrow">
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
    </div>
  )
}
