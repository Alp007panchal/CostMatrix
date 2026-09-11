// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SetPasswordPage } from './SetPasswordPage'

const getSession = vi.fn()
const updateUser = vi.fn()
const unsubscribe = vi.fn()

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      updateUser: (args: { password: string }) => updateUser(args),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe } } }),
    },
  },
}))

const withSession = () => getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
const withoutSession = () => getSession.mockResolvedValue({ data: { session: null } })

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: /Save password/ }))
}

beforeEach(() => {
  getSession.mockReset()
  updateUser.mockReset()
  window.location.hash = ''
})
afterEach(cleanup)

describe('the page that sets a password', () => {
  it('asks for a password twice when the link gave a session', async () => {
    withSession()
    render(<SetPasswordPage />)
    await waitFor(() => expect(screen.getByText('Choose a password')).toBeDefined())
    expect(screen.getByLabelText(/New password/)).toBeDefined()
    expect(screen.getByLabelText(/Type it again/)).toBeDefined()
  })

  it('says a used or expired link cannot be used, and repeats Supabase’s reason', async () => {
    window.location.hash = '#error=access_denied&error_description=Email+link+is+invalid+or+has+expired'
    withoutSession()
    render(<SetPasswordPage />)
    await waitFor(() => expect(screen.getByText('This link cannot be used')).toBeDefined())
    expect(screen.getByText('Email link is invalid or has expired')).toBeDefined()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('refuses two passwords that differ, without calling Supabase', async () => {
    withSession()
    render(<SetPasswordPage />)
    await waitFor(() => expect(screen.getByText('Choose a password')).toBeDefined())
    type(/New password/, 'correct horse battery')
    type(/Type it again/, 'something else entirely')
    save()
    await waitFor(() => expect(screen.getByText('The two passwords are not the same.')).toBeDefined())
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('refuses a password that is too short, without calling Supabase', async () => {
    withSession()
    render(<SetPasswordPage />)
    await waitFor(() => expect(screen.getByText('Choose a password')).toBeDefined())
    type(/New password/, 'short')
    type(/Type it again/, 'short')
    save()
    await waitFor(() => expect(screen.getByText('Use at least 8 characters.')).toBeDefined())
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('saves the password and says so', async () => {
    withSession()
    updateUser.mockResolvedValue({ error: null })
    render(<SetPasswordPage />)
    await waitFor(() => expect(screen.getByText('Choose a password')).toBeDefined())
    type(/New password/, 'a long enough password')
    type(/Type it again/, 'a long enough password')
    save()
    await waitFor(() => expect(screen.getByText('Password set')).toBeDefined())
    expect(updateUser).toHaveBeenCalledWith({ password: 'a long enough password' })
  })

  it('shows what Supabase said when saving fails', async () => {
    withSession()
    updateUser.mockResolvedValue({ error: { message: 'New password should be different from the old password.' } })
    render(<SetPasswordPage />)
    await waitFor(() => expect(screen.getByText('Choose a password')).toBeDefined())
    type(/New password/, 'a long enough password')
    type(/Type it again/, 'a long enough password')
    save()
    await waitFor(() =>
      expect(screen.getByText('New password should be different from the old password.')).toBeDefined(),
    )
  })
})
