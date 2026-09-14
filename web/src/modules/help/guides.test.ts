import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GUIDES, guidesFor, isYours } from './guides'
import type { UserRole } from '../../lib/database.types'

/**
 * The routes the app actually has, read from the router rather than copied.
 * A guide that sends somebody to a screen which does not exist is worse than
 * no guide, and a list of links is exactly the thing that rots quietly.
 */
function routesInTheApp(): Set<string> {
  const app = readFileSync(fileURLToPath(new URL('../../app/App.tsx', import.meta.url)), 'utf8')
  const paths = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1] ?? '')
  return new Set(paths.map((p) => (p.startsWith('/') ? p : `/${p}`)))
}

describe('every screen a guide names', () => {
  const routes = routesInTheApp()

  it('is a real route in the app', () => {
    expect(routes.size).toBeGreaterThan(10) // the reader itself is working
    for (const guide of GUIDES) {
      for (const step of guide.steps) {
        expect(routes.has(step.where), `${guide.title}: ${step.where}`).toBe(true)
      }
    }
  })

  it('would be caught if it were not', () => {
    // Proving the guard bites, rather than trusting that it does.
    expect(routes.has('/admin/a-screen-that-does-not-exist')).toBe(false)
  })
})

describe('the guides themselves', () => {
  it('covers the three roles a person can hold, plus one for everybody', () => {
    const roles = GUIDES.map((g) => g.role)
    expect(roles).toContain('costing_engineer')
    expect(roles).toContain('approver')
    expect(roles).toContain('company_admin')
    expect(roles).toContain(null)
  })

  it('is a page, not a manual', () => {
    // The point of a one-page guide is that somebody reads all of it.
    for (const guide of GUIDES) {
      expect(guide.steps.length).toBeGreaterThanOrEqual(3)
      expect(guide.steps.length).toBeLessThanOrEqual(6)
      expect(guide.blurb.length).toBeGreaterThan(20)
      for (const step of guide.steps) expect(step.action.length).toBeGreaterThan(10)
    }
  })

  it('says the two things people mistake for faults', () => {
    const all = JSON.stringify(GUIDES).toLowerCase()
    expect(all).toContain('freezes every price')
    expect(all).toContain('deactivated rather than deleted')
  })
})

describe('whose guide is whose', () => {
  const roles = (...r: UserRole[]) => r

  it('puts your own first and the one for everybody last', () => {
    const order = guidesFor(roles('approver'), false).map((g) => g.role)
    expect(order[0]).toBe('approver')
    expect(order[order.length - 1]).toBe(null)
  })

  it('gives somebody with two roles both of theirs first', () => {
    const order = guidesFor(roles('costing_engineer', 'approver'), false).map((g) => g.role)
    expect(order.slice(0, 2).sort()).toEqual(['approver', 'costing_engineer'])
  })

  it('treats the master administrator as an administrator', () => {
    expect(isYours(GUIDES[2]!, [], true)).toBe(true)
  })

  it('still shows every guide to somebody with no roles yet', () => {
    // An invited person before anybody has given them a role should not meet
    // an empty page.
    expect(guidesFor([], false)).toHaveLength(GUIDES.length)
  })

  it('marks nothing as yours when nothing is', () => {
    for (const guide of GUIDES) expect(isYours(guide, [], false)).toBe(false)
  })
})
