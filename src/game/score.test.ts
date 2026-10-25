import { describe, expect, it } from 'vitest'
import { scoreHand } from '../lib/scoring'
import type { TeamId } from '../lib/types'
import { ROOK, type CardId } from './cards'
import { mustApply, startHandFromDeal, type HandState } from './engine'
import { FAMILY_RULES } from './rules'
import { moonStillPossible, summarizeHand, tallies, toHandInput } from './score'

const TEAMS: TeamId[] = ['A', 'B', 'A', 'B']
const PLAYERS = ['p-steven', 'p-abi', 'p-mom', 'p-dad']

/** Two-trick hand. Seat 0 (team A) bids; who wins is decided by the hands. */
function playOut(hands: CardId[][], nest: CardId[], bid: number | 'moon', plays: [number, CardId][]): HandState {
  let s = startHandFromDeal({ rules: FAMILY_RULES, handedness: 4, teams: TEAMS, dealerSeat: 3 }, { hands, nest })
  s = mustApply(s, { type: 'bid', seat: 0, bid })
  if (s.phase === 'overshoot') s = mustApply(s, { type: 'overshoot', seat: 3, accept: false })
  for (const seat of [1, 2, 3]) if (s.phase === 'bidding') s = mustApply(s, { type: 'bid', seat, bid: 'pass' })
  if (s.phase === 'nest') s = mustApply(s, { type: 'discard', seat: 0, cards: nest }) // lay the Kitty straight back
  s = mustApply(s, { type: 'trump', seat: 0, trump: 'green' })
  for (const [seat, card] of plays) s = mustApply(s, { type: 'play', seat, card })
  return s
}

const HANDS: CardId[][] = [
  ['G14', 'R10'],
  ['G5', 'R14'],
  ['G6', 'R5'],
  ['G7', 'R7'],
]
const NEST = ['Y10', ROOK, 'B6', 'B7', 'B8'] // 30 points

describe('scoring a finished hand', () => {
  it('normal bid made: bidding team points, Rook holder, trump', () => {
    // Trick 1: seat 0 leads G14 and wins (G14 10 + G5 5). Trick 2: seat 0 leads R10, seat 1's R14 wins 25 + nest 30.
    const s = playOut(HANDS, NEST, 65, [
      [0, 'G14'], [1, 'G5'], [2, 'G6'], [3, 'G7'],
      [0, 'R10'], [1, 'R14'], [2, 'R5'], [3, 'R7'],
    ])
    expect(s.phase).toBe('over')
    const r = summarizeHand(s)
    expect(r.bidTeam).toBe('A')
    expect(r.pointsByTeam).toEqual({ A: 15, B: 55 })
    expect(r.tricksByTeam).toEqual({ A: 1, B: 1 })
    expect(r.made).toBe(false)
    expect(r.pointsByTeam.A + r.pointsByTeam.B).toBe(70) // only 70 points were in this short deck

    const input = toHandInput(s, PLAYERS)
    expect(input).toEqual({
      dealerId: 'p-dad',
      bidderId: 'p-steven',
      bidTeam: 'A',
      bid: 65,
      pointsTaken: 15,
      rookHolderId: 'kitty', // the Rook was in the Kitty: recorded as Kitty, not the bidder
      trump: 'green',
    })
    expect(input.moonMade).toBeUndefined()
    // and the scorekeeper sets them: A loses the 65 bid, B gets 120 - 15
    expect(scoreHand({ A: 100, B: 100 }, input).totals).toEqual({ A: 35, B: 205 })
  })

  it('records the Rook holder when a player was dealt it', () => {
    const hands: CardId[][] = [['G14', 'R10'], ['G5', 'R14'], [ROOK, 'R5'], ['G7', 'R7']]
    const s = playOut(hands, ['Y10', 'B5', 'B6', 'B7', 'B8'], 65, [
      [0, 'G14'], [1, 'G5'], [2, ROOK], [3, 'G7'],
      [2, 'R5'], [3, 'R7'], [0, 'R10'], [1, 'R14'],
    ])
    expect(toHandInput(s, PLAYERS).rookHolderId).toBe('p-mom')
    expect(s.tricks[0].winnerSeat).toBe(2)
  })

  it('Moon made: every trick taken by the bidding team', () => {
    // Team A (seats 0 and 2) take both tricks.
    const hands: CardId[][] = [['G14', 'R10'], ['G5', 'Y14'], ['G6', 'R14'], ['G7', 'R7']]
    const s = playOut(hands, NEST, 'moon', [
      [0, 'G14'], [1, 'G5'], [2, 'G6'], [3, 'G7'],
      [0, 'R10'], [1, 'Y14'], [2, 'R14'], [3, 'R7'],
    ])
    const r = summarizeHand(s)
    expect(r.moonMade).toBe(true)
    expect(r.made).toBe(true)
    expect(r.tricksByTeam).toEqual({ A: 2, B: 0 })
    const input = toHandInput(s, PLAYERS)
    expect(input.bid).toBe('moon')
    expect(input.moonMade).toBe(true)
    expect(scoreHand({ A: 120, B: 200 }, input).totals).toEqual({ A: 500, B: 200 })
  })

  it('Moon missed: a single trick lost breaks it even with all the points', () => {
    // Trick 1 to seat 1 (team B) with zero points; A takes everything else.
    const hands: CardId[][] = [['G5', 'R10'], ['G6', 'R14'], ['G7', 'R5'], ['G8', 'R7']]
    const s = playOut(hands, NEST, 'moon', [
      [0, 'G5'], [1, 'G6'], [2, 'G7'], [3, 'G8'],
      [3, 'R7'], [0, 'R10'], [1, 'R14'], [2, 'R5'],
    ])
    expect(s.tricks[0].winnerSeat).toBe(3) // B
    expect(s.tricks[1].winnerSeat).toBe(1) // B again
    const r = summarizeHand(s)
    expect(r.moonMade).toBe(false)
    expect(r.pointsByTeam).toEqual({ A: 0, B: 60 })
    const input = toHandInput(s, PLAYERS)
    expect(input.moonMade).toBe(false)
    expect(input.pointsTaken).toBe(0)
    // A drops to the multiple of 500 below; B gets 120 - 0
    expect(scoreHand({ A: 620, B: 100 }, input).totals).toEqual({ A: 500, B: 220 })
  })

  it('moonStillPossible and tallies work mid-hand for a live scoreboard', () => {
    const hands: CardId[][] = [['G5', 'R10'], ['G6', 'R14'], ['G7', 'R5'], ['G8', 'R7']]
    let s = startHandFromDeal({ rules: FAMILY_RULES, handedness: 4, teams: TEAMS, dealerSeat: 3 }, { hands, nest: NEST })
    s = mustApply(s, { type: 'bid', seat: 0, bid: 'moon' })
    s = mustApply(s, { type: 'overshoot', seat: 3, accept: false })
    s = mustApply(s, { type: 'discard', seat: 0, cards: NEST })
    s = mustApply(s, { type: 'trump', seat: 0, trump: 'green' })
    expect(moonStillPossible(s)).toBe(true)
    for (const [seat, card] of [[0, 'G5'], [1, 'G6'], [2, 'G7'], [3, 'G8']] as [number, CardId][]) s = mustApply(s, { type: 'play', seat, card })
    expect(moonStillPossible(s)).toBe(false)
    expect(tallies(s)).toEqual({ points: { A: 0, B: 5 }, tricks: { A: 0, B: 1 } })
    expect(() => summarizeHand(s)).toThrow(/not over/)
  })

  it('an overshoot is scored as the dealer\'s Moon', () => {
    const hands: CardId[][] = [['G5', 'R10'], ['G6', 'R14'], ['G7', 'R5'], ['G14', 'R7']]
    let s = startHandFromDeal({ rules: FAMILY_RULES, handedness: 4, teams: TEAMS, dealerSeat: 3 }, { hands, nest: NEST })
    s = mustApply(s, { type: 'bid', seat: 0, bid: 'moon' })
    s = mustApply(s, { type: 'overshoot', seat: 3, accept: true })
    expect(s.bidderSeat).toBe(3)
    s = mustApply(s, { type: 'discard', seat: 3, cards: NEST })
    s = mustApply(s, { type: 'trump', seat: 3, trump: 'green' })
    for (const [seat, card] of [[3, 'G14'], [0, 'G5'], [1, 'G6'], [2, 'G7'], [3, 'R7'], [0, 'R10'], [1, 'R14'], [2, 'R5']] as [number, CardId][]) {
      s = mustApply(s, { type: 'play', seat, card })
    }
    const input = toHandInput(s, PLAYERS)
    expect(input.bidderId).toBe('p-dad')
    expect(input.bidTeam).toBe('B')
    expect(input.bid).toBe('moon')
    expect(input.moonMade).toBe(true) // B took both tricks (G14, then R14)
  })
})
