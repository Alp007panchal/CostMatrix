import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { Company, Profile, UserRole } from '../../lib/database.types'

/**
 * Everything a screen needs to know about who is asking: the Supabase session,
 * their profile, their company and their roles.
 *
 * These are conveniences for deciding what to show. They are not the security
 * boundary — that is row-level security in Postgres. A screen that forgets to
 * hide a button is untidy; the database still refuses the write.
 */
export interface SessionState {
  session: Session | null
  profile: Profile | null
  company: Company | null
  /** Every company this person may see: their own, or all of them for the master admin. */
  companies: Company[]
  companyName: (id: string | null | undefined) => string
  roles: UserRole[]
  loading: boolean
  isMasterAdmin: boolean
  hasRole: (role: UserRole) => boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [roles, setRoles] = useState<UserRole[]>([])
  const [loading, setLoading] = useState(true)

  async function loadPerson(userId: string) {
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle<Profile>()

    setProfile(profileRow ?? null)

    if (!profileRow) {
      setCompany(null)
      setCompanies([])
      setRoles([])
      return
    }

    // Row-level security returns one company to most people and all of them
    // to the master admin, so one query serves both.
    const [{ data: companyRows }, { data: roleRows }] = await Promise.all([
      supabase.from('companies').select('*').order('name'),
      supabase.from('user_roles').select('role').eq('user_id', userId),
    ])

    const all = (companyRows ?? []) as Company[]
    setCompanies(all)
    setCompany(all.find((c) => c.id === profileRow.company_id) ?? null)
    setRoles((roleRows ?? []).map((r) => (r as { role: UserRole }).role))
  }

  async function refresh() {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    if (data.session) {
      await loadPerson(data.session.user.id)
    } else {
      setProfile(null)
      setCompany(null)
      setCompanies([])
      setRoles([])
    }
    setLoading(false)
  }

  useEffect(() => {
    void refresh()

    // Fires on sign-in, sign-out and token refresh, including in another tab.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next) {
        void loadPerson(next.user.id)
      } else {
        setProfile(null)
        setCompany(null)
        setCompanies([])
        setRoles([])
      }
      setLoading(false)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  const value: SessionState = {
    session,
    profile,
    company,
    companies,
    companyName: (id) => companies.find((c) => c.id === id)?.name ?? '—',
    roles,
    loading,
    isMasterAdmin: profile?.is_master_admin ?? false,
    hasRole: (role) => roles.includes(role),
    refresh,
    signOut: async () => {
      await supabase.auth.signOut()
    },
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside a SessionProvider')
  return value
}
