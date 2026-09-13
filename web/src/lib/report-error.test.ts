// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('./supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))

import { forgetSentErrors, reportError } from './report-error'

function online(is: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: is, configurable: true })
}

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null })
  forgetSentErrors()
  online(true)
  window.history.pushState({}, '', '/costings/2f1c9e7a-1111-4222-8333-444455556666')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('reporting a failure', () => {
  it('sends the kind, the route and the message', () => {
    reportError('render', 'Cannot read properties of null', 'at PanelCard')
    expect(rpc).toHaveBeenCalledTimes(1)
    const [name, args] = rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(name).toBe('report_error')
    expect(args['kind']).toBe('render')
    expect(args['message']).toBe('Cannot read properties of null')
    expect(args['detail']).toBe('at PanelCard')
    expect(args['path']).toBe('/costings/2f1c9e7a-1111-4222-8333-444455556666')
  })

  it('sends the route and not the query string', () => {
    // A path finds the job. A query string could carry anything.
    window.history.pushState({}, '', '/costings?secret=whatever')
    reportError('load', 'Could not read the kits')
    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(args['path']).toBe('/costings')
    expect(String(args['path'])).not.toContain('secret')
  })

  it('sends the same failure once per page view, not once per render', () => {
    reportError('render', 'the same thing')
    reportError('render', 'the same thing')
    reportError('render', 'the same thing')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('but a different failure, or the same one on another screen, is its own report', () => {
    reportError('render', 'the same thing')
    reportError('render', 'something else')
    window.history.pushState({}, '', '/quotations')
    reportError('render', 'the same thing')
    expect(rpc).toHaveBeenCalledTimes(3)
  })

  it('says nothing when the browser is offline', () => {
    // A train tunnel is not a fault in the app.
    online(false)
    reportError('load', 'Failed to fetch')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('says nothing when there is nothing to say', () => {
    reportError('render', '')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('truncates rather than refusing, because a cut report still says what broke', () => {
    reportError('render', 'm'.repeat(900), 'd'.repeat(4000))
    const [, args] = rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(String(args['message'])).toHaveLength(500)
    expect(String(args['detail'])).toHaveLength(2000)
  })
})

describe('it can never be the thing that breaks a screen', () => {
  it('does not throw when the call is rejected', async () => {
    rpc.mockRejectedValue(new Error('network down'))
    expect(() => reportError('render', 'a crash')).not.toThrow()
    await Promise.resolve()
  })

  it('does not throw when the call returns an error', () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    expect(() => reportError('render', 'a crash')).not.toThrow()
  })

  it('does not throw when the client itself is broken', () => {
    rpc.mockImplementation(() => {
      throw new Error('no client')
    })
    expect(() => reportError('render', 'a crash')).not.toThrow()
  })
})
