import { describe, expect, it } from 'vitest'
import type { TeamId } from '../lib/types'
import { botDiscard } from './bots'
import { ROOK, type CardId } from './cards'
import type { Deal } from './deal'
import {
  UNKNOWN,
  applyAction,
  canClaimRest,
  exposedNestCard,
  legalBids,
  legalPlays,
  mustApply,
  startHand,
  startHandFromDeal,
  totalTricks,
  trickWinner,
  type Action,
  type HandState,
} from './engine'
import { seededRng } from './rng'
import { FAMILY_RULES, type Rules } from './rules'

const R = FAMILY_RULES
const TEAMS4: TeamId[] = ['A', 'B', 'A', 'B']

/** Hand with the given cards; seats are padded with harmless filler so sizes match. */
function fixed(hands: CardId[][], nest: CardId[] = [], dealerSeat = 3, rules: Rules = R): HandState {
  const dealt: Deal = { hands, nest }
  return startHandFromDeal({ rules, handedness: 4, teams: TEAMS4, dealerSeat }, dealt)
}

/**
 * Runs the bidding so that `bidderSeat` wins at `bid`, lays the picked-up
 * Kitty straight back down (so hands stay as the test dealt them), and names `trump`.
 */
function throughBidding(state: HandState, bidderSeat: number, bid: number | 'moon', trump: 'red' | 'yellow' | 'green' | 'black') {
  let s = state
  const kitty = state.nest
  // Everyone passes except the bidder, in turn order.
  while (s.phase === 'bidding') {
    const seat = s.turnSeat
    s = mustApply(s, { type: 'bid', seat, bid: seat === bidderSeat ? bid : 'pass' })
  }
  if (s.phase === 'overshoot') s = mustApply(s, { type: 'overshoot', seat: s.dealerSeat, accept: false })
  if (s.phase === 'nest') {
    s = mustApply(s, { type: 'pickup', seat: bidderSeat })
    s = mustApply(s, { type: 'discard', seat: bidderSeat, cards: kitty })
  }
  expect(s.phase).toBe('trump')
  expect(s.bidderSeat).toBe(bidderSeat)
  return mustApply(s, { type: 'trump', seat: bidderSeat, trump })
}

const bid = (seat: number, b: number | 'moon' | 'pass'): Action => ({ type: 'bid', seat, bid: b })
const play = (seat: number, card: CardId): Action => ({ type: 'play', seat, card })

describe('start of hand', () => {
  it('opens bidding left of the dealer and records who was dealt the Rook', () => {
    const s = startHand({ rules: R, handedness: 4, teams: TEAMS4, dealerSeat: 2, seed: 's' })
    expect(s.phase).toBe('bidding')
    expect(s.turnSeat).toBe(3)
    expect(s.bidding.turnSeat).toBe(3)
    const holder = s.hands.findIndex((h) => h.includes(ROOK))
    expect(s.rookHolderSeat).toBe(holder === -1 ? null : holder)
    expect(totalTricks(s)).toBe(9)
  })

  it('exposes the top Kitty card for everyone while bidding, until the bidder picks it up', () => {
    const s = fixed([['R5'], ['R6'], ['R7'], ['R8']], ['Y10', ROOK, 'B6'])
    expect(exposedNestCard(s)).toBe('Y10')
    expect(exposedNestCard({ ...s, rules: { ...R, nestTopExposed: false } })).toBeNull()
    let t = throughBidding(s, 0, 65, 'green')
    expect(exposedNestCard(t)).toBeNull() // picked up and laid back face down
    t = mustApply(t, play(0, 'R5'))
    t = mustApply(t, play(1, 'R6'))
    t = mustApply(t, play(2, 'R7'))
    t = mustApply(t, play(3, 'R8'))
    expect(t.phase).toBe('over')
    expect(exposedNestCard(t)).toBeNull()
    expect(t.tricks[0].points).toBe(5 + 30) // the whole Kitty, exposed card included, went to the last trick
  })

  it('Rook in the nest means no holder', () => {
    const s = fixed([['R5'], ['R6'], ['R7'], ['R8']], [ROOK])
    expect(s.rookHolderSeat).toBeNull()
  })
})

describe('bidding', () => {
  const base = () => fixed([['R5'], ['R6'], ['R7'], ['R8']], [], 3) // seat 0 bids first

  it('goes clockwise, pass is final, last bidder standing wins', () => {
    let s = base()
    s = mustApply(s, bid(0, 65))
    expect(s.turnSeat).toBe(1)
    s = mustApply(s, bid(1, 70))
    s = mustApply(s, bid(2, 'pass'))
    s = mustApply(s, bid(3, 75))
    expect(s.turnSeat).toBe(0) // seat 2 is skipped from now on
    s = mustApply(s, bid(0, 80))
    expect(s.turnSeat).toBe(1)
    s = mustApply(s, bid(1, 'pass'))
    expect(s.turnSeat).toBe(3)
    s = mustApply(s, bid(3, 'pass'))
    expect(s.phase).toBe('trump')
    expect(s.bidderSeat).toBe(0)
    expect(s.bid).toBe(80)
    expect(s.turnSeat).toBe(0)
  })

  it('rejects out-of-turn, too-low, off-step and re-entry after passing', () => {
    let s = base()
    expect(applyAction(s, bid(1, 65)).ok).toBe(false)
    s = mustApply(s, bid(0, 70))
    expect(applyAction(s, bid(1, 70)).ok).toBe(false)
    expect(applyAction(s, bid(1, 65)).ok).toBe(false)
    expect(applyAction(s, bid(1, 72)).ok).toBe(false)
    expect(applyAction(s, bid(1, 125)).ok).toBe(false)
    s = mustApply(s, bid(1, 'pass'))
    s = mustApply(s, bid(2, 75))
    s = mustApply(s, bid(3, 'pass'))
    // seat 1 has passed; it is seat 0's turn, and seat 1 may never re-enter
    expect(s.turnSeat).toBe(0)
    expect(applyAction(s, bid(1, 80)).ok).toBe(false)
    expect(legalBids(s, 1)).toEqual([])
  })

  it('lists legal calls: any higher bid (jumps allowed), Moon, and pass', () => {
    let s = base()
    expect(legalBids(s, 0)).toEqual([65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 'moon', 'pass'])
    s = mustApply(s, bid(0, 80)) // opening bid need not be 65
    expect(legalBids(s, 1)).toEqual([85, 90, 95, 100, 105, 110, 115, 120, 'moon', 'pass'])
    s = mustApply(s, bid(1, 110)) // and a jump from 80 to 110 is fine
    expect(legalBids(s, 2)).toEqual([115, 120, 'moon', 'pass'])
    expect(legalBids(s, 0)).toEqual([])
  })

  it('Moon may only be a player\'s first call', () => {
    let s = base()
    s = mustApply(s, bid(0, 65))
    s = mustApply(s, bid(1, 70))
    s = mustApply(s, bid(2, 'pass'))
    s = mustApply(s, bid(3, 'pass'))
    // seat 0 already bid 65, so no Moon now
    expect(legalBids(s, 0)).not.toContain('moon')
    expect(applyAction(s, bid(0, 'moon')).ok).toBe(false)
    expect(applyAction(s, bid(0, 'moon'))).toMatchObject({ ok: false, error: /first bid/ })
    // but a first call may be a Moon straight away
    expect(legalBids(base(), 0)).toContain('moon')
  })

  it('sticks the dealer with 65 when everyone passes', () => {
    let s = base()
    s = mustApply(s, bid(0, 'pass'))
    s = mustApply(s, bid(1, 'pass'))
    s = mustApply(s, bid(2, 'pass'))
    expect(legalBids(s, 3)).not.toContain('pass')
    s = mustApply(s, bid(3, 'pass'))
    expect(s.phase).toBe('trump')
    expect(s.bidderSeat).toBe(3)
    expect(s.bid).toBe(65)
  })

  it('a Moon ends the auction and offers the dealer an overshoot', () => {
    let s = base()
    s = mustApply(s, bid(0, 'moon'))
    expect(s.phase).toBe('overshoot')
    expect(s.turnSeat).toBe(3)
    expect(applyAction(s, bid(1, 'pass')).ok).toBe(false)
    expect(applyAction(s, { type: 'overshoot', seat: 1, accept: true }).ok).toBe(false)

    const declined = mustApply(s, { type: 'overshoot', seat: 3, accept: false })
    expect(declined.phase).toBe('trump')
    expect(declined.bidderSeat).toBe(0)
    expect(declined.bid).toBe('moon')
    expect(declined.overshot).toBe(false)

    const taken = mustApply(s, { type: 'overshoot', seat: 3, accept: true })
    expect(taken.phase).toBe('trump')
    expect(taken.bidderSeat).toBe(3)
    expect(taken.bid).toBe('moon')
    expect(taken.overshot).toBe(true)
  })

  it('no overshoot when the dealer already passed, or when the dealer shoots', () => {
    let s = base()
    s = mustApply(s, bid(0, 65))
    s = mustApply(s, bid(1, 'pass'))
    s = mustApply(s, bid(2, 'pass'))
    s = mustApply(s, bid(3, 'pass'))
    expect(s.phase).toBe('trump') // seat 0 won at 65 outright
    let t = base()
    t = mustApply(t, bid(0, 70))
    t = mustApply(t, bid(1, 'pass'))
    t = mustApply(t, bid(2, 'pass'))
    t = mustApply(t, bid(3, 'pass'))
    expect(t.bidderSeat).toBe(0)

    // Dealer passes early, then someone shoots (only possible when a Moon
    // need not be a first call): straight to trump, no overshoot.
    let u = fixed([['R5'], ['R6'], ['R7'], ['R8']], [], 3, { ...R, moonOnlyAsFirstBid: false })
    u = mustApply(u, bid(0, 65))
    u = mustApply(u, bid(1, 70))
    u = mustApply(u, bid(2, 75))
    u = mustApply(u, bid(3, 'pass'))
    u = mustApply(u, bid(0, 'moon'))
    expect(u.phase).toBe('trump')
    expect(u.bidderSeat).toBe(0)

    // Dealer shoots: nobody to overshoot.
    let v = base()
    v = mustApply(v, bid(0, 65))
    v = mustApply(v, bid(1, 'pass'))
    v = mustApply(v, bid(2, 'pass'))
    v = mustApply(v, bid(3, 'moon'))
    expect(v.phase).toBe('trump')
    expect(v.bidderSeat).toBe(3)
  })

  it('overshoot can be switched off', () => {
    let s = fixed([['R5'], ['R6'], ['R7'], ['R8']], [], 3, { ...R, dealerMayOvershoot: false })
    s = mustApply(s, bid(0, 'moon'))
    expect(s.phase).toBe('trump')
    expect(s.bidderSeat).toBe(0)
  })
})

describe('the Kitty exchange', () => {
  const KITTY: CardId[] = ['Y10', ROOK, 'B6', 'B7', 'B8']
  const dealt = () => fixed([['R5', 'R6', 'G14'], ['R7', 'Y5', 'G5'], ['R8', 'Y6', 'G6'], ['R9', 'Y7', 'G7']], KITTY)
  const won = () => {
    let s = dealt()
    s = mustApply(s, bid(0, 80))
    s = mustApply(s, bid(1, 'pass'))
    s = mustApply(s, bid(2, 'pass'))
    s = mustApply(s, bid(3, 'pass'))
    return s
  }

  it('the bidder picks up the whole Kitty and must lay the same number back down', () => {
    let s = won()
    expect(s.phase).toBe('nest')
    expect(s.turnSeat).toBe(0)
    expect(s.nestPickedUp).toBe(0)
    expect(s.nest).toEqual(KITTY) // still on the table until picked up
    expect(applyAction(s, { type: 'discard', seat: 0, cards: KITTY })).toMatchObject({ ok: false, error: /Pick up/ })
    expect(applyAction(s, { type: 'pickup', seat: 1 }).ok).toBe(false)
    s = mustApply(s, { type: 'pickup', seat: 0 })
    expect(applyAction(s, { type: 'pickup', seat: 0 })).toMatchObject({ ok: false, error: /already/ })
    expect(s.hands[0]).toEqual(['R5', 'R6', 'G14', ...KITTY])
    expect(s.hands[1]).toHaveLength(3)
    expect(s.nest).toEqual([])
    expect(s.nestPickedUp).toBe(5)
    expect(s.rookHolderSeat).toBeNull() // the Rook came up in the Kitty: credited to the Kitty, not the bidder
    expect(applyAction(s, { type: 'trump', seat: 0, trump: 'red' }).ok).toBe(false)
  })

  it('rejects bad lay-downs', () => {
    const s = mustApply(won(), { type: 'pickup', seat: 0 })
    expect(applyAction(s, { type: 'discard', seat: 1, cards: ['R7', 'Y5', 'G5', 'R7', 'Y5'] }).ok).toBe(false)
    expect(applyAction(s, { type: 'discard', seat: 0, cards: ['R5', 'R6'] })).toMatchObject({ ok: false, error: /exactly 5/ })
    expect(applyAction(s, { type: 'discard', seat: 0, cards: ['R5', 'R5', 'R6', 'G14', 'Y10'] })).toMatchObject({ ok: false, error: /twice/ })
    expect(applyAction(s, { type: 'discard', seat: 0, cards: ['R7', 'R5', 'R6', 'G14', 'Y10'] })).toMatchObject({ ok: false, error: /not hold/ })
  })

  it('after laying down, the hand is back to size, the Kitty is face down, and trump is next', () => {
    let s = mustApply(won(), { type: 'pickup', seat: 0 })
    s = mustApply(s, { type: 'discard', seat: 0, cards: ['B6', 'B7', 'B8', 'R5', 'Y10'] })
    expect(s.phase).toBe('trump')
    expect(s.hands[0]).toEqual(['R6', 'G14', ROOK])
    expect(s.nest).toEqual(['B6', 'B7', 'B8', 'R5', 'Y10'])
    expect(exposedNestCard(s)).toBeNull()
    expect(totalTricks(s)).toBe(3)
    // the laid-down points (R5 + Y10 = 15) go to whoever wins the last trick
    s = mustApply(s, { type: 'trump', seat: 0, trump: 'green' })
    const order = [0, 1, 2, 3]
    for (const card of [['R6', 'R7', 'R8', 'R9'], ['G14', 'G5', 'G6', 'G7'], [ROOK, 'Y5', 'Y6', 'Y7']]) {
      // winner of the previous trick leads; seats are arranged so seat 0's lead order holds for trick 1 only
      let lead = s.turnSeat
      for (let i = 0; i < 4; i++) {
        const seat = order[(order.indexOf(lead) + i) % 4]
        s = mustApply(s, play(seat, card[seat]))
      }
      lead = s.turnSeat
    }
    expect(s.phase).toBe('over')
    const last = s.tricks[2]
    expect(last.tookNest).toBe(true)
    expect(last.winnerSeat).toBe(0)
    expect(last.points).toBe(20 + 5 + 15) // Rook + Y5 in the trick, plus the Kitty
  })

  it('point cards can be kept out of the Kitty by rule', () => {
    let s = fixed([['R5', 'R6', 'G14'], ['R7', 'Y5', 'G5'], ['R8', 'Y6', 'G6'], ['R9', 'Y7', 'G7']], KITTY, 3, { ...R, discardPointsAllowed: false })
    s = mustApply(s, bid(0, 80))
    s = mustApply(s, bid(1, 'pass'))
    s = mustApply(s, bid(2, 'pass'))
    s = mustApply(s, bid(3, 'pass'))
    s = mustApply(s, { type: 'pickup', seat: 0 })
    expect(applyAction(s, { type: 'discard', seat: 0, cards: ['B6', 'B7', 'B8', 'R5', 'R6'] })).toMatchObject({ ok: false, error: /Point cards/ })
    expect(applyAction(s, { type: 'discard', seat: 0, cards: ['B6', 'B7', 'B8', 'R6', ROOK] }).ok).toBe(false)
  })

  it('without a pickup rule the Kitty stays on the table (variant)', () => {
    let s = fixed([['R5'], ['R6'], ['R7'], ['R8']], KITTY, 3, { ...R, bidderTakesNest: false })
    s = mustApply(s, bid(0, 65))
    s = mustApply(s, bid(1, 'pass'))
    s = mustApply(s, bid(2, 'pass'))
    s = mustApply(s, bid(3, 'pass'))
    expect(s.phase).toBe('trump')
    expect(s.nest).toEqual(KITTY)
    expect(s.hands[0]).toEqual(['R5'])
  })
})

describe('trump', () => {
  it('only the bidder names trump, then leads', () => {
    let s = fixed([['R5'], ['R6'], ['R7'], ['R8']])
    s = mustApply(s, bid(0, 'pass'))
    s = mustApply(s, bid(1, 65))
    s = mustApply(s, bid(2, 'pass'))
    s = mustApply(s, bid(3, 'pass'))
    expect(applyAction(s, { type: 'trump', seat: 0, trump: 'red' }).ok).toBe(false)
    expect(applyAction(s, play(1, 'R6')).ok).toBe(false)
    s = mustApply(s, { type: 'trump', seat: 1, trump: 'green' })
    expect(s.phase).toBe('playing')
    expect(s.trump).toBe('green')
    expect(s.turnSeat).toBe(1)
    expect(s.trick.leadSeat).toBe(1)
  })
})

describe('legal plays', () => {
  // seat 0 leads; trump is green
  const state = () =>
    throughBidding(
      fixed([
        ['R10', 'R6', 'G7', 'B5'],
        ['R14', 'Y9', ROOK, 'G12'],
        ['Y5', 'Y6', 'G5', 'B8'],
        ['R7', 'G14', 'G6', 'B14'],
      ]),
      0,
      65,
      'green',
    )

  it('the leader may play anything', () => {
    expect(legalPlays(state(), 0)).toEqual(['R10', 'R6', 'G7', 'B5'])
    expect(legalPlays(state(), 1)).toEqual([])
  })

  it('must follow the led color; the Rook may not be thrown while you hold that color', () => {
    const s = mustApply(state(), play(0, 'R10'))
    expect(legalPlays(s, 1)).toEqual(['R14'])
    expect(applyAction(s, play(1, ROOK)).ok).toBe(false)
    expect(applyAction(s, play(1, 'Y9')).ok).toBe(false)
  })

  it('void in the led color: anything goes, Rook included', () => {
    let s = mustApply(state(), play(0, 'R10'))
    s = mustApply(s, play(1, 'R14'))
    expect(legalPlays(s, 2)).toEqual(['Y5', 'Y6', 'G5', 'B8'])
    s = mustApply(s, play(2, 'G5'))
    expect(legalPlays(s, 3)).toEqual(['R7'])
  })

  it('trump led: the Rook follows as a trump', () => {
    const s = mustApply(state(), play(0, 'G7'))
    expect(legalPlays(s, 1)).toEqual([ROOK, 'G12'])
  })

  it('Rook led: others must play trump if able', () => {
    const s0 = throughBidding(
      fixed([
        [ROOK, 'R6'],
        ['R14', 'G12'],
        ['Y5', 'Y6'],
        ['G14', 'B14'],
      ]),
      0,
      65,
      'green',
    )
    const s = mustApply(s0, play(0, ROOK))
    expect(legalPlays(s, 1)).toEqual(['G12'])
    const s2 = mustApply(s, play(1, 'G12'))
    expect(legalPlays(s2, 2)).toEqual(['Y5', 'Y6'])
  })

  it('under the looser rule the Rook may be thrown on any trick', () => {
    const loose = throughBidding(
      fixed(
        [
          ['R10', 'R6'],
          ['R14', ROOK],
          ['Y5', 'Y6'],
          ['R7', 'G14'],
        ],
        [],
        3,
        { ...R, rookOnlyWhenVoid: false },
      ),
      0,
      65,
      'green',
    )
    const s = mustApply(loose, play(0, 'R10'))
    expect(legalPlays(s, 1)).toEqual(['R14', ROOK])
  })

  it('rejects a card you do not hold and plays out of turn', () => {
    const s = state()
    expect(applyAction(s, play(0, 'Y5')).ok).toBe(false)
    expect(applyAction(s, play(2, 'Y5')).ok).toBe(false)
  })
})

describe('trick winner', () => {
  const t = (cards: CardId[], leadSeat = 0) => ({ leadSeat, plays: cards.map((card, i) => ({ seat: (leadSeat + i) % 4, card })) })

  it('highest of the led color wins when no trump is played', () => {
    expect(trickWinner(t(['R10', 'R14', 'R6', 'Y14']), 'green', R)).toBe(1)
    expect(trickWinner(t(['R10', 'Y14', 'B14', 'R6']), 'green', R)).toBe(0)
  })

  it('any trump beats the led color; highest trump wins', () => {
    expect(trickWinner(t(['R10', 'G5', 'R14', 'G6']), 'green', R)).toBe(3)
  })

  it('the Rook is the highest trump', () => {
    expect(trickWinner(t(['G14', 'G5', ROOK, 'G6']), 'green', R)).toBe(2)
    expect(trickWinner(t(['R14', ROOK, 'R10', 'G14']), 'green', R)).toBe(1)
  })

  it('the Rook ranks low when the rules say so', () => {
    expect(trickWinner(t(['G14', 'G5', ROOK, 'G6']), 'green', { ...R, rookRank: 'low' })).toBe(0)
    expect(trickWinner(t(['R14', ROOK, 'R10', 'Y14']), 'green', { ...R, rookRank: 'low' })).toBe(1)
  })

  it('the 1 is high when it is in play', () => {
    const withOnes = { ...R, removedRanks: [2, 3, 4] }
    expect(trickWinner(t(['R14', 'R1', 'R10', 'R5']), 'green', withOnes)).toBe(1)
  })
})

describe('throwing the cards in', () => {
  // Trump is green. Seat 0 holds the Rook and the green 14: nothing unseen can top either.
  const unbeatable = () =>
    throughBidding(
      fixed([
        ['G14', ROOK],
        ['R14', 'Y9'],
        ['Y5', 'B8'],
        ['R7', 'B14'],
      ]),
      0,
      80,
      'green',
    )

  it('is allowed on lead when nothing you have not seen can beat any of your cards', () => {
    const s = unbeatable()
    expect(canClaimRest(s, 0)).toBe(true)
    expect(canClaimRest(s, 1)).toBe(false) // not on lead
    const done = mustApply(s, { type: 'claim', seat: 0 })
    expect(done.phase).toBe('over')
    expect(done.claimedBySeat).toBe(0)
    expect(done.tricks).toHaveLength(2)
    expect(done.tricks.every((t) => t.winnerSeat === 0)).toBe(true)
    expect(done.tricks[1].tookNest).toBe(true)
    expect(done.hands.flat()).toHaveLength(0)
    // every dealt point ends up counted: G14 10 + ROOK 20 + R14 10 + Y5 5 + B14 10
    expect(done.tricks.reduce((n, t) => n + t.points, 0)).toBe(55)
  })

  it('is decided from public information plus your own hand, so it works when other hands are hidden', () => {
    const s = unbeatable()
    const hidden = { ...s, hands: s.hands.map((h, i) => (i === 0 ? h : h.map(() => UNKNOWN))), nest: s.nest.map(() => UNKNOWN) }
    expect(canClaimRest(hidden, 0)).toBe(true)
    const done = mustApply(hidden, { type: 'claim', seat: 0 })
    expect(done.phase).toBe('over')
    // with other hands and the Kitty hidden, everything unaccounted for in the deck is the claimer's
    expect(done.tricks.reduce((n, t) => n + t.points, 0)).toBe(120)
    // only the claimer's cards are in the archive; the rest were never seen
    expect(done.tricks.flatMap((t) => t.plays).every((p) => p.seat === 0)).toBe(true)
  })

  it('is refused while a higher trump, or any trump against a plain card, is still unseen', () => {
    const higherTrumpOut = throughBidding(fixed([['G13', 'R5'], ['G14', 'Y9'], ['Y5', 'B8'], ['R7', 'B14']]), 0, 80, 'green')
    expect(canClaimRest(higherTrumpOut, 0)).toBe(false)
    expect(applyAction(higherTrumpOut, { type: 'claim', seat: 0 })).toMatchObject({ ok: false, error: /still take/ })
    // A top plain card is never safe while any trump is unaccounted for.
    const plain = throughBidding(fixed([['R14', 'B14'], ['R13', 'Y9'], ['Y5', 'B8'], ['R7', 'B13']]), 0, 80, 'green')
    expect(canClaimRest(plain, 0)).toBe(false)
  })

  it('cannot be used mid-trick', () => {
    let s = unbeatable()
    s = mustApply(s, play(0, 'G14'))
    expect(canClaimRest(s, 1)).toBe(false)
    expect(applyAction(s, { type: 'claim', seat: 1 }).ok).toBe(false)
  })

  it('makes a Moon when the claimer\'s team already had every trick', () => {
    let s = throughBidding(fixed([['G14', ROOK, 'G13'], ['R14', 'Y9', 'Y6'], ['Y5', 'B8', 'B9'], ['R7', 'B14', 'R8']]), 0, 'moon', 'green')
    s = mustApply(s, play(0, 'G13'))
    s = mustApply(s, play(1, 'Y6'))
    s = mustApply(s, play(2, 'B9'))
    s = mustApply(s, play(3, 'R8'))
    expect(s.turnSeat).toBe(0)
    expect(canClaimRest(s, 0)).toBe(true)
    const done = mustApply(s, { type: 'claim', seat: 0 })
    expect(done.tricks.every((t) => t.winnerSeat === 0)).toBe(true)
    // G14 10 + ROOK 20 + R14 10 + Y5 5 + B14 10
    expect(done.tricks.reduce((n, t) => n + t.points, 0)).toBe(55)
  })
})

describe('playing a hand', () => {
  it('winner leads the next trick, points accumulate, nest goes to the last trick', () => {
    let s = throughBidding(
      fixed(
        [
          ['R10', 'G6'],
          ['R14', 'Y9'],
          ['R5', 'G5'],
          ['R7', 'B14'],
        ],
        ['Y10', ROOK, 'B6', 'B7', 'B8'],
      ),
      0,
      65,
      'green',
    )
    s = mustApply(s, play(0, 'R10'))
    s = mustApply(s, play(1, 'R14'))
    s = mustApply(s, play(2, 'R5'))
    s = mustApply(s, play(3, 'R7'))
    expect(s.tricks).toHaveLength(1)
    expect(s.tricks[0].winnerSeat).toBe(1)
    expect(s.tricks[0].points).toBe(25)
    expect(s.tricks[0].tookNest).toBe(false)
    expect(s.turnSeat).toBe(1)
    expect(s.trick.leadSeat).toBe(1)

    s = mustApply(s, play(1, 'Y9'))
    s = mustApply(s, play(2, 'G5')) // void in yellow, trumps
    s = mustApply(s, play(3, 'B14'))
    s = mustApply(s, play(0, 'G6')) // higher trump
    expect(s.phase).toBe('over')
    expect(s.tricks[1].winnerSeat).toBe(0)
    // G5 (5) + B14 (10) in the trick, plus the nest: Y10 + ROOK = 30
    expect(s.tricks[1].points).toBe(45)
    expect(s.tricks[1].tookNest).toBe(true)
    expect(s.hands.every((h) => h.length === 0)).toBe(true)
  })

  it('a broken Moon plays on by default but can end the hand early', () => {
    const hands: CardId[][] = [
      ['G14', 'R6'],
      ['G5', 'R14'],
      ['G6', 'R5'],
      ['G7', 'R7'],
    ]
    let s = throughBidding(fixed(hands), 0, 'moon', 'green')
    s = mustApply(s, play(0, 'R6'))
    s = mustApply(s, play(1, 'R14'))
    s = mustApply(s, play(2, 'R5'))
    s = mustApply(s, play(3, 'R7'))
    expect(s.tricks[0].winnerSeat).toBe(1) // opponents took a trick
    expect(s.phase).toBe('playing')

    let e = throughBidding(fixed(hands, [], 3, { ...R, stopEarlyOnBrokenMoon: true }), 0, 'moon', 'green')
    e = mustApply(e, play(0, 'R6'))
    e = mustApply(e, play(1, 'R14'))
    e = mustApply(e, play(2, 'R5'))
    e = mustApply(e, play(3, 'R7'))
    expect(e.phase).toBe('over')
  })

  it('a full random hand accounts for every card and all 120 points', () => {
    const rng = seededRng('full-hand')
    for (let game = 0; game < 25; game++) {
      let s = startHand({ rules: R, handedness: game % 2 ? 4 : 6, teams: game % 2 ? TEAMS4 : ['A', 'B', 'A', 'B', 'A', 'B'], dealerSeat: game % 4, seed: `g${game}` })
      while (s.phase === 'bidding' || s.phase === 'overshoot') {
        if (s.phase === 'overshoot') {
          s = mustApply(s, { type: 'overshoot', seat: s.dealerSeat, accept: rng() < 0.5 })
          continue
        }
        const options = legalBids(s, s.turnSeat)
        s = mustApply(s, bid(s.turnSeat, options[Math.floor(rng() * options.length)]))
      }
      if (s.phase === 'nest') {
        s = mustApply(s, { type: 'pickup', seat: s.bidderSeat! })
        s = mustApply(s, { type: 'discard', seat: s.bidderSeat!, cards: botDiscard(s, s.bidderSeat!) })
      }
      s = mustApply(s, { type: 'trump', seat: s.bidderSeat!, trump: 'red' })
      const tricks = totalTricks(s)
      while (s.phase === 'playing') {
        const options = legalPlays(s, s.turnSeat)
        expect(options.length).toBeGreaterThan(0)
        s = mustApply(s, play(s.turnSeat, options[Math.floor(rng() * options.length)]))
      }
      expect(s.phase).toBe('over')
      expect(s.tricks).toHaveLength(tricks)
      expect(s.tricks.filter((t) => t.tookNest)).toHaveLength(1)
      expect(s.tricks.reduce((n, t) => n + t.points, 0)).toBe(120)
      expect(s.hands.flat()).toHaveLength(0)
    }
  })
})
