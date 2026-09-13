// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TermsPage } from './TermsPage'
import { TERMS_SECTIONS } from './terms'

afterEach(cleanup)

function show() {
  render(
    <MemoryRouter>
      <TermsPage />
    </MemoryRouter>,
  )
}

describe('the terms page', () => {
  it('draws every section, with nothing dropped', () => {
    show()
    for (const section of TERMS_SECTIONS) {
      expect(screen.getByRole('heading', { name: section.heading })).toBeTruthy()
    }
  })

  it('needs no session — it renders with nothing mocked', () => {
    // The point of the page is that somebody without an account can read it, so
    // it must not reach for the session, the query client or Supabase. If it
    // ever starts to, this test fails rather than the page failing in front of
    // an invited person who has not signed in yet.
    expect(() => show()).not.toThrow()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('What CostMatrix stores')
  })

  it('offers a way back into the app', () => {
    show()
    const back = screen.getByRole('link', { name: /back to the app/i })
    expect(back.getAttribute('href')).toBe('/')
  })
})
