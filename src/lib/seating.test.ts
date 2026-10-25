import { describe, expect, it } from 'vitest'
import { autoTeamName, interleave, moveItem, nextDealerId, nextSeat, validateSeating } from './seating'
import type { Hand } from './types'

const teams4 = { A: { name: 'A', playerIds: ['a1', 'a2'] }, B: { name: 'B', playerIds: ['b1', 'b2'] } }
const teams6 = {
  A: { name: 'A', playerIds: ['a1', 'a2', 'a3'] },
  B: { name: 'B', playerIds: ['b1', 'b2', 'b3'] },
}

describe('validateSeating', () => {
  it('accepts alternating 4-handed seating', () => {
    expect(validateSeating(4, teams4, ['a1', 'b1', 'a2', 'b2']).ok).toBe(true)
    expect(validateSeating(4, teams4, ['b2', 'a1', 'b1', 'a2']).ok).toBe(true)
  })
  it('rejects two teammates next to each other', () => {
    const v = validateSeating(4, teams4, ['a1', 'a2', 'b1', 'b2'])
    expect(v.ok).toBe(false)
    expect(v.errors[0]).toMatch(/alternate/)
  })
  it('checks wraparound (last seat next to first)', () => {
    // a1 b1 b2 a2 -> a2 next to a1 around the table, and b1 next to b2
    expect(validateSeating(4, teams4, ['a1', 'b1', 'b2', 'a2']).ok).toBe(false)
  })
  it('accepts alternating 6-handed seating', () => {
    expect(validateSeating(6, teams6, ['a1', 'b1', 'a2', 'b2', 'a3', 'b3']).ok).toBe(true)
  })
  it('rejects wrong team sizes', () => {
    const bad = { A: { name: 'A', playerIds: ['a1'] }, B: { name: 'B', playerIds: ['b1', 'b2', 'b3'] } }
    expect(validateSeating(4, bad, ['a1', 'b1', 'b2', 'b3']).ok).toBe(false)
  })
  it('rejects duplicates and missing seats', () => {
    expect(validateSeating(4, teams4, ['a1', 'b1', 'a1', 'b2']).ok).toBe(false)
    expect(validateSeating(4, teams4, ['a1', 'b1', 'a2']).ok).toBe(false)
  })
})

describe('interleave', () => {
  it('produces an alternating default', () => {
    expect(interleave(teams6)).toEqual(['a1', 'b1', 'a2', 'b2', 'a3', 'b3'])
    expect(validateSeating(6, teams6, interleave(teams6)).ok).toBe(true)
  })
})

describe('dealer rotation', () => {
  const game = { seatOrder: ['a1', 'b1', 'a2', 'b2'], firstDealerId: 'a2' }
  const h = (n: number, dealerId: string): Hand => ({
    id: String(n), handNumber: n, dealerId, bidderId: 'a1', bidTeam: 'A', bid: 80, pointsTaken: 80, createdAt: n,
  })
  it('first dealer deals hand 1', () => {
    expect(nextDealerId(game, [])).toBe('a2')
  })
  it('rotates clockwise through the seats and wraps', () => {
    expect(nextDealerId(game, [h(1, 'a2')])).toBe('b2')
    expect(nextDealerId(game, [h(1, 'a2'), h(2, 'b2')])).toBe('a1')
  })
  it('continues from a manual override', () => {
    expect(nextDealerId(game, [h(1, 'a2'), h(2, 'a1')])).toBe('b1')
  })
  it('nextSeat falls back to first seat for unknown player', () => {
    expect(nextSeat(game.seatOrder, 'zzz')).toBe('a1')
  })
})

describe('autoTeamName', () => {
  it('joins first names', () => {
    expect(autoTeamName(['Steven Wireman', 'Abi'])).toBe('Steven & Abi')
    expect(autoTeamName(['Mom', 'Dad', 'Grandma'])).toBe('Mom, Dad & Grandma')
    expect(autoTeamName(['Solo'])).toBe('Solo')
  })
})

describe('moveItem', () => {
  it('moves within bounds and ignores out of bounds', () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3])
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 3, 2])
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3])
  })
})
