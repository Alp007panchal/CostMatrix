import { describe, expect, it } from 'vitest'
import type { QuotationFollowup, QuotationRow, QuotationValidity } from '../../lib/database.types'
import { keepTab, quotationTiles } from './quotation-view'
import { statusChip, whatNext } from './what-next'

const TODAY = '2026-09-14'

const q = (over: Partial<QuotationRow> = {}): QuotationRow => ({
  id: 'q1', status: 'sent', sent_at: '2026-09-01T09:00:00Z', decided_at: null,
  reference_no: 'NPP-196', ...over,
} as QuotationRow)

const val = (over: Partial<QuotationValidity> = {}): QuotationValidity => ({
  quotation_id: 'q1', company_id: 'co', costing_id: 'c1', reference_no: 'NPP-196',
  status: 'sent', valid_until: '2026-10-01', expired_at: null, sent_at: null,
  customer_name: 'Bamburi', days_left: 17, has_run_out: false, ...over,
})

const f = (over: Partial<QuotationFollowup> = {}): QuotationFollowup => ({
  id: 'f1', quotation_id: 'q1', company_id: 'co', due_on: '2026-09-20', note: null,
  assigned_to: null, done_at: null, created_at: '2026-09-01', ...over,
})

describe('the tabs', () => {
  it('keeps released and sent under Open, and drops the ones that have run out', () => {
    expect(keepTab(q({ status: 'released' }), val(), 'open')).toBe(true)
    expect(keepTab(q(), val({ has_run_out: true }), 'open')).toBe(false)
    expect(keepTab(q({ status: 'won' }), undefined, 'open')).toBe(false)
  })

  it('puts one that has run out under Expired and nowhere else', () => {
    expect(keepTab(q(), val({ has_run_out: true }), 'expired')).toBe(true)
    expect(keepTab(q(), val(), 'expired')).toBe(false)
    // A won quotation that also ran out is won, not expired: the answer came.
    expect(keepTab(q({ status: 'won' }), val({ has_run_out: true }), 'expired')).toBe(false)
  })

  it('shows everything under All, superseded revisions included', () => {
    expect(keepTab(q({ status: 'superseded' }), undefined, 'all')).toBe(true)
    expect(keepTab(q({ status: 'superseded' }), undefined, 'open')).toBe(false)
  })
})

describe('the four tiles', () => {
  it('splits what is out into sent and never sent', () => {
    const tiles = quotationTiles([q(), q({ id: 'q2', status: 'released', sent_at: null })], [], [], TODAY)
    expect(tiles[0]?.value).toBe('2')
    expect(tiles[0]?.delta).toBe('1 sent · 1 released but never sent')
  })

  it('counts an overdue reminder only against a quotation that is still open', () => {
    const late = f({ due_on: '2026-09-10' })
    expect(quotationTiles([q()], [], [late], TODAY)[1]?.value).toBe('1')
    // Won last week: the reminder is stale, not a thing to do today.
    expect(quotationTiles([q({ status: 'won' })], [], [late], TODAY)[1]?.value).toBe('0')
  })

  it('counts the ones running out inside a fortnight, and not the ones already gone', () => {
    const tiles = quotationTiles(
      [q(), q({ id: 'q2' }), q({ id: 'q3' })],
      [val({ days_left: 9 }), val({ quotation_id: 'q2', days_left: 30 }), val({ quotation_id: 'q3', days_left: -2, has_run_out: true })],
      [],
      TODAY,
    )
    expect(tiles[2]?.value).toBe('1')
    expect(tiles[2]?.tone).toBe('watch')
  })

  it('says won out of decided, which is the number a sales meeting asks for', () => {
    const tiles = quotationTiles(
      [
        q({ id: 'w', status: 'won', decided_at: '2026-09-05T09:00:00Z' }),
        q({ id: 'l', status: 'lost', decided_at: '2026-09-06T09:00:00Z' }),
        q({ id: 'old', status: 'won', decided_at: '2026-08-20T09:00:00Z' }),
      ],
      [], [], TODAY,
    )
    expect(tiles[3]?.value).toBe('1')
    expect(tiles[3]?.delta).toBe('1 of 2 decided')
  })
})

describe('the what-next column', () => {
  it('asks for the one move each state needs', () => {
    expect(whatNext(q({ status: 'released', sent_at: null }), val(), null, TODAY)).toBe('Send it, then mark it sent')
    expect(whatNext(q(), val(), null, TODAY)).toBe('Chase it, or set a reminder')
    expect(whatNext(q(), val(), '2026-09-20', TODAY)).toBe('Reminder 2026-09-20')
    expect(whatNext(q(), val(), '2026-09-10', TODAY)).toBe('Chase it — reminder was 2026-09-10')
    expect(whatNext(q(), val({ has_run_out: true }), '2026-09-20', TODAY)).toBe('It has run out — revise it')
  })

  it('asks for nothing once the answer has come', () => {
    expect(whatNext(q({ status: 'won' }), val(), '2026-09-10', TODAY)).toBe('—')
    expect(whatNext(q({ status: 'lost' }), undefined, null, TODAY)).toBe('—')
    expect(whatNext(q({ status: 'superseded' }), undefined, null, TODAY)).toBe('—')
  })

  it('shows EXPIRED on the chip even though the status is still sent', () => {
    expect(statusChip(q(), val({ has_run_out: true }))).toEqual({ text: 'EXPIRED', tone: 'warn' })
    expect(statusChip(q(), val())).toEqual({ text: 'SENT', tone: 'blue' })
    expect(statusChip(q({ status: 'won' }), val({ has_run_out: true }))).toEqual({ text: 'WON', tone: 'ok' })
  })
})
