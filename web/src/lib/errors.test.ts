import { describe, expect, it } from 'vitest'
import { functionErrorMessage } from './errors'

describe('functionErrorMessage', () => {
  it('reads the sentence the function meant to show', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: { json: async () => ({ error: 'A user with this email address has already been registered' }) },
    })
    expect(await functionErrorMessage(error, 'Could not send the invitation')).toBe(
      'A user with this email address has already been registered',
    )
  })

  it('falls back to the error message when there is no body', async () => {
    expect(await functionErrorMessage(new Error('Failed to fetch'), 'Could not remove')).toBe('Failed to fetch')
  })

  it('falls back when the body is not JSON', async () => {
    const error = Object.assign(new Error('non-2xx'), {
      context: { json: async () => { throw new Error('not json') } },
    })
    expect(await functionErrorMessage(error, 'Could not remove')).toBe('non-2xx')
  })

  it('uses the caller´s wording when nothing else is known', async () => {
    expect(await functionErrorMessage(null, 'Could not remove')).toBe('Could not remove')
  })
})
