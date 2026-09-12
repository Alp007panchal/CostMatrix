import { afterEach, describe, expect, it, vi } from 'vitest'
import { readCostingView, writeCostingView } from './costing-view'

/** The view preference lives in the person's own browser, and must survive it not working. */
describe('which view this person reads a costing in', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('starts panel by panel', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => {} } })
    expect(readCostingView()).toBe('panels')
  })

  it('remembers the grid', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v) },
      },
    })
    writeCostingView('grid')
    expect(readCostingView()).toBe('grid')
    writeCostingView('panels')
    expect(readCostingView()).toBe('panels')
  })

  it('falls back to panel by panel when storage throws, and saving never does', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => { throw new Error('blocked') },
        setItem: () => { throw new Error('blocked') },
      },
    })
    expect(readCostingView()).toBe('panels')
    expect(() => writeCostingView('grid')).not.toThrow()
  })
})
