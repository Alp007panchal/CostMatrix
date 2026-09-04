import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * Sign in, and ask for a reset link. There is no sign-up: people are invited
 * by an administrator, which is also enforced in the Supabase auth settings.
 */
export function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function signIn(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError(signInError.message)
    setBusy(false)
  }

  async function sendReset() {
    if (!email) {
      setError('Enter your email address first, then ask for a reset link.')
      return
    }
    setBusy(true)
    setError(null)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setError(resetError ? resetError.message : null)
    if (!resetError) setNotice(`If ${email} has an account, a reset link is on its way.`)
    setBusy(false)
  }

  return (
    <div className="centred">
      <form className="card narrow" onSubmit={signIn}>
        <h1>CostMatrix</h1>
        <p className="muted">Costing and quotation for electrical panel boards.</p>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            autoComplete="username"
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="error">{error}</p>}
        {notice && <p className="ok">{notice}</p>}

        <div className="row end">
          <button type="button" onClick={sendReset} disabled={busy}>
            Forgot password
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>

        <p className="muted" style={{ fontSize: '.8125rem', marginTop: '1rem' }}>
          Accounts are created by an administrator. If you do not have one, ask yours.
        </p>
      </form>
    </div>
  )
}
