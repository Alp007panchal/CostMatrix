// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { CostingAssembly, CostingPanel, PanelPrice } from '../../lib/database.types'
import { confirmRemovePanel, removalMessage } from './remove-panel'

const panel = { id: 'p1', name: 'MDB 1600 A' } as CostingPanel
const kit = (id: string): CostingAssembly => ({ id, panel_id: 'p1', kind: 'kit' } as CostingAssembly)
const free = (id: string): CostingAssembly => ({ id, panel_id: 'p1', kind: 'free' } as CostingAssembly)
const price = (line_total: number): PanelPrice => ({ panel_id: 'p1', line_total } as PanelPrice)
const money = (n: number) => `KES ${n.toLocaleString()}`

describe('what the app asks before deleting a panel', () => {
  it('names the panel, so nobody deletes the wrong column', () => {
    expect(removalMessage({ panel, lines: [kit('a')], price: price(100), money }))
      .toContain('“MDB 1600 A”')
  })

  it('says how much is on it and what it is worth', () => {
    const message = removalMessage({ panel, lines: [kit('a'), kit('b'), free('c')], price: price(7_537_900), money })
    expect(message).toContain('2 kits and 1 line of loose parts')
    expect(message).toContain('worth KES 7,537,900')
    expect(message).toContain('cannot be undone')
  })

  it('counts one of a thing as one, not as 1s', () => {
    expect(removalMessage({ panel, lines: [kit('a')], price: price(10), money })).toContain('1 kit,')
    expect(removalMessage({ panel, lines: [free('c'), free('d')], price: price(10), money }))
      .toContain('2 lines of loose parts')
  })

  it('says plainly that an empty panel is no loss, and still that it will not come back', () => {
    const message = removalMessage({ panel, lines: [], price: undefined, money })
    expect(message).toContain('It is empty, so nothing is lost')
    expect(message).toContain('does not come back')
  })

  it('treats a panel priced at nothing as having no value to quote', () => {
    expect(removalMessage({ panel, lines: [kit('a')], price: price(0), money }))
      .not.toContain('worth')
  })
})

describe('the question itself', () => {
  it('removes only when the person says yes', () => {
    const remove = vi.fn()
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false)
    confirmRemovePanel({ panel, lines: [], price: undefined, money }, remove)
    expect(ask).toHaveBeenCalledOnce()
    expect(remove).not.toHaveBeenCalled()

    ask.mockReturnValue(true)
    confirmRemovePanel({ panel, lines: [], price: undefined, money }, remove)
    expect(remove).toHaveBeenCalledOnce()
    ask.mockRestore()
  })
})
