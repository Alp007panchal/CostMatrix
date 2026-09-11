import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * Where a recovery or invitation link lands: the one page in the app that sets a
 * password. It is reached at /reset-password, which is the address
 * `resetPasswordForEmail` has always asked Supabase to send people to and the
 * address the invitation function now uses.
 *
 * It sits outside RequireAuth on purpose. Somebody following an invitation has a
 * session but may not yet belong to a company, and RequireAuth would stop them
 * with "your account has not been added to a company yet" — true, but useless
 * when all they need to do is choose a password.
 */

const MIN_LENGTH = 8

export function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // null while we are still finding out, so the page does not flash "link expired".
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  useEffect(() => {
    // Supabase reads the token out of the URL itself and raises an auth event.
    // A link that has expired or been used comes back as an error in the URL
    // fragment instead, which is worth repeating rather than hiding.
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const linkError = fragment.get('error_description') ?? fragment.get('error')
    if (linkError) setError(linkError.replace(/\+/g, ' '))

    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setHasSession(data.session !== null)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session) {
        setHasSession(true)
        setError(null)
      }
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`)
      return
    }
    if (password !== again) {
      setError('The two passwords are not the same.')
      return
    }

    setBusy(true)
    setError(null)
    const { error: saveError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (saveError) setError(saveError.message)
    else setDone(true)
  }

  if (done) {
    return (
      <Shell title="Password set">
        <p className="ok">Your password is saved. You are signed in.</p>
        <div className="row end">
          {/* A full load rather than a route change, so the app starts from the
              new session rather than the one the recovery link left behind. */}
          <button type="button" className="primary" onClick={() => window.location.assign('/')}>
            Go to CostMatrix
          </button>
        </div>
      </Shell>
    )
  }

  if (hasSession === false) {
    return (
      <Shell title="This link cannot be used">
        {error && <p className="error">{error}</p>}
        <p className="muted">
          Password links can only be used once, and they expire. Ask for a new one from the sign-in
          page: enter your email address and press <strong>Forgot password</strong>.
        </p>
        <div className="row end">
          <button type="button" onClick={() => window.location.assign('/')}>
            Back to sign in
          </button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell title="Choose a password">
      <form onSubmit={save}>
        <p className="muted">
          This is your own password for CostMatrix. Nobody else knows it, including whoever invited
          you.
        </p>

        <label className="field">
          <span>New password</span>
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            required
            minLength={MIN_LENGTH}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Type it again</span>
          <input
            type="password"
            value={again}
            autoComplete="new-password"
            required
            onChange={(e) => setAgain(e.target.value)}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="row end">
          <button type="submit" className="primary" disabled={busy || hasSession === null}>
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </div>

        <p className="muted" style={{ fontSize: '.8125rem', marginTop: '1rem' }}>
          At least {MIN_LENGTH} characters.
        </p>
      </form>
    </Shell>
  )
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="centred">
      <div className="card narrow">
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  )
}
