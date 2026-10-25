import { describe, expect, it } from 'vitest'
import { ROOK, buildDeck, cardId, cardPoints, deckPoints, effectiveSuit, isCardId, parseCard, sortHand, strength } from './cards'
import { deal, handSize } from './deal'
import { seededRng, shuffle } from './rng'
import { FAMILY_RULES, type Rules } from './rules'

const R = FAMILY_RULES

describe('deck', () => {
  it('has 5-14 in four colors plus the Rook: 41 cards', () => {
    const deck = buildDeck(R)
    expect(deck).toHaveLength(41)
    expect(new Set(deck).size).toBe(41)
    expect(deck).toContain(ROOK)
    expect(deck).not.toContain('R1')
    expect(deck).not.toContain('R4')
    expect(deck).toContain('R5')
    expect(deck).toContain('B14')
  })

  it('totals exactly 120 points, as the scorekeeper assumes', () => {
    expect(deckPoints(R)).toBe(120)
  })

  it('scores 5s, 10s, 14s and the Rook; everything else is zero', () => {
    expect(cardPoints('R5', R)).toBe(5)
    expect(cardPoints('Y10', R)).toBe(10)
    expect(cardPoints('G14', R)).toBe(10)
    expect(cardPoints(ROOK, R)).toBe(20)
    expect(cardPoints('B13', R)).toBe(0)
    expect(cardPoints('B6', R)).toBe(0)
  })

  it('round-trips card ids', () => {
    for (const id of buildDeck(R)) expect(cardId(parseCard(id))).toBe(id)
    expect(isCardId('R10')).toBe(true)
    expect(isCardId('ROOK')).toBe(true)
    expect(isCardId('P10')).toBe(false)
    expect(isCardId('R15')).toBe(false)
    expect(isCardId(42)).toBe(false)
  })

  it('ranks the Rook above every trump and the 1 high when it is in play', () => {
    expect(strength(ROOK, R)).toBeGreaterThan(strength('R14', R))
    expect(strength('R14', R)).toBeGreaterThan(strength('R5', R))
    const withOnes: Rules = { ...R, removedRanks: [2, 3, 4] }
    expect(strength('R1', withOnes)).toBeGreaterThan(strength('R14', withOnes))
    const oneLow: Rules = { ...withOnes, oneIsHigh: false }
    expect(strength('R1', oneLow)).toBeLessThan(strength('R5', oneLow))
    const rookLow: Rules = { ...R, rookRank: 'low' }
    expect(strength(ROOK, rookLow)).toBeLessThan(strength('R5', rookLow))
  })

  it('treats the Rook as a trump card', () => {
    expect(effectiveSuit(ROOK, 'green')).toBe('green')
    expect(effectiveSuit('R7', 'green')).toBe('red')
  })

  it('sorts a hand by color with trump and the Rook on the right, low to high', () => {
    const sorted = sortHand(['G14', ROOK, 'R5', 'Y9', 'G6', 'R12'], 'green', R)
    expect(sorted).toEqual(['R5', 'R12', 'Y9', 'G6', 'G14', ROOK])
    const noTrump = sortHand(['G14', ROOK, 'R5'], null, R)
    expect(noTrump).toEqual(['R5', 'G14', ROOK])
  })
})

describe('rng', () => {
  it('is deterministic for a seed and different across seeds', () => {
    const a = seededRng('hand-1')
    const b = seededRng('hand-1')
    const c = seededRng('hand-2')
    const sa = Array.from({ length: 5 }, a)
    expect(Array.from({ length: 5 }, b)).toEqual(sa)
    expect(Array.from({ length: 5 }, c)).not.toEqual(sa)
    for (const x of sa) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('shuffles without losing or duplicating cards', () => {
    const deck = buildDeck(R)
    const s = shuffle(deck, seededRng('x'))
    expect(s).toHaveLength(deck.length)
    expect([...s].sort()).toEqual([...deck].sort())
    expect(s).not.toEqual(deck)
  })
})

describe('deal', () => {
  it('deals 9 each and a 5-card nest to 4 players', () => {
    expect(handSize(R, 4)).toBe(9)
    const d = deal(R, 4, 'seed')
    expect(d.hands).toHaveLength(4)
    for (const h of d.hands) expect(h).toHaveLength(9)
    expect(d.nest).toHaveLength(5)
    const all = [...d.hands.flat(), ...d.nest]
    expect(all).toHaveLength(41)
    expect(new Set(all).size).toBe(41)
  })

  it('deals 6 each and a 5-card nest to 6 players', () => {
    expect(handSize(R, 6)).toBe(6)
    const d = deal(R, 6, 'seed')
    for (const h of d.hands) expect(h).toHaveLength(6)
    expect(d.nest).toHaveLength(5)
  })

  it('is reproducible from the seed so a deal can be verified afterwards', () => {
    expect(deal(R, 4, 'abc')).toEqual(deal(R, 4, 'abc'))
    expect(deal(R, 4, 'abc')).not.toEqual(deal(R, 4, 'abd'))
  })

  it('refuses a deck that does not divide evenly', () => {
    // Removing the 5s as well leaves 37 cards: 32 after the nest, not divisible by 6.
    const noFives: Rules = { ...R, removedRanks: [1, 2, 3, 4, 5] }
    expect(() => handSize(noFives, 6)).toThrow(/does not deal evenly/)
    expect(handSize(noFives, 4)).toBe(8)
  })
})
