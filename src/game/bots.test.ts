import { describe, expect, it } from 'vitest'
import type { TeamId } from '../lib/types'
import { botDecision, botDiscard, botMaxBid } from './bots'
import { ROOK } from './cards'
import { applyAction, startHand, startHandFromDeal, type HandState } from './engine'
import { seededRng } from './rng'
import { FAMILY_RULES } from './rules'
import { summarizeHand } from './score'

const TEAMS4: TeamId[] = ['A', 'B', 'A', 'B']

/** Plays a whole hand with bots in every seat; throws on any illegal move. */
function playOut(state: HandState, rng: () => number): HandState {
  let s = state
  let guard = 0
  while (s.phase !== 'over') {
    const action = botDecision(s, s.turnSeat, rng)
    if (!action) throw new Error(`no decision in ${s.phase}`)
    const r = applyAction(s, action)
    if (!r.ok) throw new Error(`${action.type} by ${action.seat}: ${r.error}`)
    s = r.state
    if (++guard > 500) throw new Error('hand did not end')
  }
  return s
}

describe('bots', () => {
  it('play whole hands legally, 4- and 6-handed, and every point is accounted for', () => {
    const rng = seededRng('bots')
    for (let i = 0; i < 40; i++) {
      const handedness = i % 3 === 0 ? 6 : 4
      const teams: TeamId[] = handedness === 6 ? ['A', 'B', 'A', 'B', 'A', 'B'] : TEAMS4
      const s = playOut(startHand({ rules: FAMILY_RULES, handedness, teams, dealerSeat: i % handedness, seed: `h${i}` }), rng)
      const r = summarizeHand(s)
      expect(r.pointsByTeam.A + r.pointsByTeam.B).toBe(120)
    }
  })

  it('bid what the hand is worth', () => {
    const strong = startHandFromDeal(
      { rules: FAMILY_RULES, handedness: 4, teams: TEAMS4, dealerSeat: 3 },
      { hands: [['G14', 'G13', 'G12', 'G11', ROOK, 'R14', 'Y14', 'B5', 'G5'], ['R5'], ['R6'], ['R7']], nest: ['Y10', 'B6', 'B7', 'B8', 'B9'] },
    )
    const weak = startHandFromDeal(
      { rules: FAMILY_RULES, handedness: 4, teams: TEAMS4, dealerSeat: 3 },
      { hands: [['G6', 'R7', 'Y8', 'B9', 'G7', 'R8', 'Y9', 'B6', 'R9'], ['R5'], ['R6'], ['R7']], nest: ['Y10', 'B6', 'B7', 'B8', 'B9'] },
    )
    expect(botMaxBid(strong, 0)).toBeGreaterThanOrEqual(85)
    expect(botMaxBid(weak, 0)).toBeLessThan(65)
    // A middling hand (four trumps, nothing on top) must not reach 90.
    const middling = startHandFromDeal(
      { rules: FAMILY_RULES, handedness: 4, teams: TEAMS4, dealerSeat: 3 },
      { hands: [['G9', 'G8', 'G7', 'G6', 'R10', 'Y12', 'B9', 'B5', 'Y6'], ['R5'], ['R6'], ['R7']], nest: ['Y10', 'B6', 'B7', 'B8', 'B9'] },
    )
    expect(botMaxBid(middling, 0)).toBeLessThan(75)
    expect(botDecision(weak, 0, seededRng('x'))).toEqual({ type: 'bid', seat: 0, bid: 'pass' })
  })

  it('do not trump their own partner when the partner holds the trick', () => {
    // Trump is green. Seat 2 (partner of seat 0) leads black 14 and is winning; seat 0 is
    // void in black and holds a point trump plus a harmless yellow card.
    let s = startHandFromDeal(
      { rules: FAMILY_RULES, handedness: 4, teams: TEAMS4, dealerSeat: 1 },
      { hands: [['G10', 'Y6', 'R7'], ['B5', 'R8', 'Y9'], ['B14', 'B6', 'R9'], ['B7', 'Y7', 'R10']], nest: [] },
    )
    for (const a of [{ type: 'bid', seat: 2, bid: 70 }, { type: 'bid', seat: 3, bid: 'pass' }, { type: 'bid', seat: 0, bid: 'pass' }, { type: 'bid', seat: 1, bid: 'pass' }, { type: 'trump', seat: 2, trump: 'green' }, { type: 'play', seat: 2, card: 'B14' }, { type: 'play', seat: 3, card: 'B7' }] as const) {
      const r = applyAction(s, a)
      if (!r.ok) throw new Error(r.error)
      s = r.state
    }
    const choice = botDecision(s, 0, seededRng('p'))
    expect(choice).toEqual({ type: 'play', seat: 0, card: 'Y6' })
  })

  it('never lay trump, the Rook or a 14 into the Kitty when they have a choice', () => {
    let s = startHandFromDeal(
      { rules: FAMILY_RULES, handedness: 4, teams: TEAMS4, dealerSeat: 3 },
      { hands: [['G14', 'G13', 'G12', 'G11', ROOK, 'R14', 'Y6', 'B5', 'B6'], ['R5'], ['R6'], ['R7']], nest: ['Y10', 'B7', 'B8', 'Y7', 'R8'] },
    )
    for (const a of [{ type: 'bid', seat: 0, bid: 100 }, { type: 'bid', seat: 1, bid: 'pass' }, { type: 'bid', seat: 2, bid: 'pass' }, { type: 'bid', seat: 3, bid: 'pass' }, { type: 'pickup', seat: 0 }] as const) {
      const r = applyAction(s, a)
      if (!r.ok) throw new Error(r.error)
      s = r.state
    }
    const laid = botDiscard(s, 0)
    expect(laid).toHaveLength(5)
    expect(laid).not.toContain(ROOK)
    expect(laid).not.toContain('R14')
    expect(laid.some((c) => c.startsWith('G'))).toBe(false)
  })
})
