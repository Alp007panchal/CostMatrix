// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const reported: Array<{ kind: string; message: string; detail: string | null | undefined }> = []
vi.mock('../lib/report-error', () => ({
  reportError: (kind: string, message: string, detail?: string | null) => {
    reported.push({ kind, message, detail })
  },
}))

import { ErrorBoundary } from './ErrorBoundary'
import { Async } from '../ui/Async'

beforeEach(() => {
  reported.length = 0
  // React logs the caught error; that noise is not the test's business.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Boom(): never {
  throw new Error('Cannot read properties of null')
}

describe('a screen that stops drawing', () => {
  it('is reported, and still shows the person what happened', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    expect(reported).toHaveLength(1)
    expect(reported[0]?.kind).toBe('render')
    expect(reported[0]?.message).toBe('Cannot read properties of null')
    // The component stack is what makes a report worth reading; it was being
    // thrown away before this.
    expect(reported[0]?.detail).toBeTruthy()

    // And the screen still says its piece: reporting replaces nothing.
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/Cannot read properties of null/)).toBeTruthy()
  })

  it('reports nothing when the screen draws normally', () => {
    render(
      <ErrorBoundary>
        <p>all well</p>
      </ErrorBoundary>,
    )
    expect(reported).toHaveLength(0)
  })
})

describe('a load that fails', () => {
  // This is the half that never reaches the error boundary at all: TanStack
  // Query catches it, so before this it was invisible to the administrator.
  it('is reported, and still shows the message', () => {
    render(
      <Async query={{ isPending: false, error: new Error('Could not read the kits'), data: undefined }}>
        {() => <p>never drawn</p>}
      </Async>,
    )

    expect(reported).toEqual([{ kind: 'load', message: 'Could not read the kits', detail: undefined }])
    expect(screen.getByText('Could not read the kits')).toBeTruthy()
  })

  it('reports nothing while a query is still loading', () => {
    render(
      <Async query={{ isPending: true, error: null, data: undefined }}>{() => <p>x</p>}</Async>,
    )
    expect(reported).toHaveLength(0)
  })

  it('reports nothing when the query succeeds, including when it is empty', () => {
    render(
      <Async query={{ isPending: false, error: null, data: [] }} empty={<p>nothing yet</p>}>
        {() => <p>x</p>}
      </Async>,
    )
    expect(screen.getByText('nothing yet')).toBeTruthy()
    expect(reported).toHaveLength(0)
  })
})
