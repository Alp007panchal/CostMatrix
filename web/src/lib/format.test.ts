import { describe, expect, it } from 'vitest'
import { marginToMarkup, money, percent, roleLabel } from './format'

describe('money', () => {
  it('shows two decimals and the company label', () => {
    expect(money(5784800, 'KSH')).toBe('KSH 5,784,800.00')
  })
  it('defaults to the ISO code', () => {
    expect(money(1234.5)).toBe('KES 1,234.50')
  })
})

describe('percent', () => {
  it('drops trailing zeros', () => {
    expect(percent(16)).toBe('16%')
    expect(percent(12.5)).toBe('12.5%')
  })
})

describe('marginToMarkup', () => {
  // Margins are applied by division, so 20% of the selling price is a 25%
  // markup on cost. This is the number people get wrong, hence the test.
  it('converts a margin on price to a markup on cost', () => {
    expect(marginToMarkup(20)).toBeCloseTo(25)
    expect(marginToMarkup(10)).toBeCloseTo(11.111, 3)
    expect(marginToMarkup(50)).toBeCloseTo(100)
  })
  it('is zero for no margin', () => {
    expect(marginToMarkup(0)).toBe(0)
  })
})

describe('roleLabel', () => {
  it('reads as English', () => {
    expect(roleLabel('company_admin')).toBe('Company admin')
    expect(roleLabel('costing_engineer')).toBe('Costing engineer')
  })
})
