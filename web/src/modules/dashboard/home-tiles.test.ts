import { describe, expect, it } from 'vitest'
import type { DeskItem, LibraryHealthRow, QuotationFollowup, QuotationRow } from '../../lib/database.types'
import { exceptions, homeTiles } from './home-tiles'

const TODAY = '2026-09-14'

const desk = (over: Partial<DeskItem> = {}): DeskItem => ({
  kind: 'waiting_for_you', sort_order: 20, entity: 'costing', entity_id: 'c1',
  reference: 'NPP-201', title: 'Kenya Power', since: '2026-09-11T09:00:00Z', days: 3,
  detail: 'Ruaraka MDB', ...over,
})

const quote = (over: Partial<QuotationRow> = {}): QuotationRow => ({
  id: 'q1', status: 'sent', sent_at: '2026-09-02T09:00:00Z', decided_at: null,
  reference_no: 'NPP-196', customer_name: 'Bamburi Cement',
  ...over,
} as QuotationRow)

const followup = (over: Partial<QuotationFollowup> = {}): QuotationFollowup => ({
  id: 'f1', quotation_id: 'q1', company_id: 'co', due_on: '2026-09-20', note: null,
  assigned_to: null, done_at: null, created_at: '2026-09-01T09:00:00Z', ...over,
})

const health = (over: Partial<LibraryHealthRow> = {}): LibraryHealthRow => ({
  severity: 'refuses', items: 8, ...over,
} as LibraryHealthRow)

describe('the four tiles', () => {
  it('counts what is submitted to you and names the oldest', () => {
    const [approval] = homeTiles([desk(), desk({ entity_id: 'c2', reference: 'NPP-203', days: 1 })], [], [], TODAY)
    expect(approval?.value).toBe('2')
    expect(approval?.delta).toContain('oldest 3 days ago')
    expect(approval?.delta).toContain('NPP-201')
    expect(approval?.tone).toBe('watch')
  })

  it('leaves the approval tile plain when nothing is submitted', () => {
    const [approval] = homeTiles([], [], [], TODAY)
    expect(approval?.value).toBe('0')
    expect(approval?.tone).toBeUndefined()
  })

  it('splits quotations out into sent and released-but-never-sent', () => {
    const tiles = homeTiles([], [quote(), quote({ id: 'q2', status: 'released', sent_at: null })], [], TODAY)
    expect(tiles[1]?.value).toBe('2')
    expect(tiles[1]?.delta).toBe('1 sent · 1 released but never sent')
  })

  it('counts only quotations decided in this calendar month as won', () => {
    const tiles = homeTiles(
      [],
      [
        quote({ id: 'w1', status: 'won', decided_at: '2026-09-03T09:00:00Z', reference_no: 'NPP-190' }),
        quote({ id: 'w2', status: 'won', decided_at: '2026-08-30T09:00:00Z', reference_no: 'NPP-188' }),
      ],
      [],
      TODAY,
    )
    expect(tiles[3]?.value).toBe('1')
    expect(tiles[3]?.delta).toBe('NPP-190')
  })

  it('turns the follow-up tile red only once something is actually late', () => {
    const onTime = homeTiles([], [], [followup()], TODAY)
    expect(onTime[2]?.value).toBe('0')
    expect(onTime[2]?.tone).toBeUndefined()
    expect(onTime[2]?.delta).toBe('1 open, none overdue')

    const late = homeTiles([], [], [followup({ due_on: '2026-09-11' }), followup({ id: 'f2' })], TODAY)
    expect(late[2]?.value).toBe('1')
    expect(late[2]?.tone).toBe('crit')
    expect(late[2]?.delta).toBe('2 open · longest 3 days late')
  })

  it('ignores a follow-up that has been done', () => {
    const tiles = homeTiles([], [], [followup({ due_on: '2026-09-01', done_at: '2026-09-02T08:00:00Z' })], TODAY)
    expect(tiles[2]?.value).toBe('0')
    expect(tiles[2]?.delta).toBe('0 open, none overdue')
  })
})

describe('the exception bar', () => {
  it('says nothing at all when there is nothing to decide', () => {
    expect(exceptions([], [], [], TODAY)).toEqual([])
  })

  it('puts approvals first, then overdue follow-ups, then the library', () => {
    const found = exceptions([desk()], [followup({ due_on: '2026-09-10' })], [health()], TODAY)
    expect(found.map((e) => e.src)).toEqual([
      'Costings · approval', 'Quotations · follow-ups', 'Library health',
    ])
  })

  it('never shows more than three, because a bar of everything is a bar of nothing', () => {
    const found = exceptions(
      [desk(), desk({ entity_id: 'c2' })],
      [followup({ due_on: '2026-09-01' })],
      [health(), health({ severity: 'silent', items: 284 })],
      TODAY,
    )
    expect(found.length).toBe(3)
  })

  it('marks a library that only costs silently as amber, not red', () => {
    const [only] = exceptions([], [], [health({ severity: 'silent', items: 284 })], TODAY)
    expect(only?.watch).toBe(true)
    expect(only?.hl).toBe('The library has gaps that cost silently')
    expect(only?.fig).toBe(284)
  })

  it('reports the stopping faults in red and mentions the silent ones beside them', () => {
    const [only] = exceptions([], [], [health({ items: 8 }), health({ severity: 'silent', items: 284 })], TODAY)
    expect(only?.watch).toBeUndefined()
    expect(only?.fig).toBe(8)
    expect(only?.why).toContain('284 more')
  })
})
