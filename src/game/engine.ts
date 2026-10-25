import type { Handedness, TeamId } from '../lib/types'
import { ROOK, effectiveSuit, pointsIn, strength, type CardId } from './cards'
import { deal, type Deal } from './deal'
import type { Rules, Suit } from './rules'

/*
 * Pure state machine for one hand of Rook. No React, no Firebase. The same
 * reducer runs on every phone (optimistic UI), inside the Firestore
 * transaction that commits a move, and in the tests.
 *
 *   bidding -> (overshoot) -> trump -> playing -> over
 */

export type Bid = number | 'moon'
export type BidAction = Bid | 'pass'
export type Phase = 'bidding' | 'overshoot' | 'trump' | 'playing' | 'over'

export interface Play {
  seat: number
  card: CardId
}

export interface Trick {
  leadSeat: number
  plays: Play[]
}

export interface TakenTrick extends Trick {
  winnerSeat: number
  /** Card points in the trick, plus the nest on the last trick. */
  points: number
  /** True on the trick that collected the nest. */
  tookNest: boolean
}

export interface BiddingState {
  turnSeat: number
  /** Every call in order, including passes. */
  calls: { seat: number; bid: BidAction }[]
  passed: boolean[]
  highBid: Bid | null
  highSeat: number | null
}

export interface HandState {
  rules: Rules
  handedness: Handedness
  /** Team of each seat, by seat index. */
  teams: TeamId[]
  dealerSeat: number
  /** Cards still held, by seat. Private in the real game; the engine sees all. */
  hands: CardId[][]
  nest: CardId[]
  /** Seat dealt the Rook, or null when it is in the nest. */
  rookHolderSeat: number | null
  phase: Phase
  bidding: BiddingState
  bidderSeat: number | null
  bid: Bid | null
  /** The dealer took a Moon away from the first shooter. */
  overshot: boolean
  trump: Suit | null
  /** Whose move it is in every phase. */
  turnSeat: number
  trick: Trick
  tricks: TakenTrick[]
}

export type Action =
  | { type: 'bid'; seat: number; bid: BidAction }
  | { type: 'overshoot'; seat: number; accept: boolean }
  | { type: 'trump'; seat: number; trump: Suit }
  | { type: 'play'; seat: number; card: CardId }

export type Result = { ok: true; state: HandState } | { ok: false; error: string }

const fail = (error: string): Result => ({ ok: false, error })
const succeed = (state: HandState): Result => ({ ok: true, state })

export function nextSeat(seat: number, handedness: number): number {
  return (seat + 1) % handedness
}

export interface StartHandOptions {
  rules: Rules
  handedness: Handedness
  teams: TeamId[]
  dealerSeat: number
  seed: string
}

/** Shuffle and deal from a seed, then open the bidding left of the dealer. */
export function startHand(opts: StartHandOptions): HandState {
  return startHandFromDeal(opts, deal(opts.rules, opts.handedness, opts.seed))
}

/** Same as startHand but with the cards given (tests, or a verified published deal). */
export function startHandFromDeal(opts: Omit<StartHandOptions, 'seed'>, dealt: Deal): HandState {
  const { rules, handedness, teams, dealerSeat } = opts
  if (teams.length !== handedness) throw new Error('teams must have one entry per seat')
  if (dealt.hands.length !== handedness) throw new Error('deal does not match handedness')
  const first = nextSeat(dealerSeat, handedness)
  const rookHolderSeat = dealt.hands.findIndex((h) => h.includes(ROOK))
  return {
    rules,
    handedness,
    teams: [...teams],
    dealerSeat,
    hands: dealt.hands.map((h) => [...h]),
    nest: [...dealt.nest],
    rookHolderSeat: rookHolderSeat === -1 ? null : rookHolderSeat,
    phase: 'bidding',
    bidding: {
      turnSeat: first,
      calls: [],
      passed: Array.from({ length: handedness }, () => false),
      highBid: null,
      highSeat: null,
    },
    bidderSeat: null,
    bid: null,
    overshot: false,
    trump: null,
    turnSeat: first,
    trick: { leadSeat: first, plays: [] },
    tricks: [],
  }
}

/* ------------------------------------------------------------------ bidding */

export function isValidBidAmount(bid: number, rules: Rules): boolean {
  return Number.isInteger(bid) && bid >= rules.minBid && bid <= rules.maxBid && bid % rules.bidStep === 0
}

function outbids(bid: Bid, high: Bid | null): boolean {
  if (high === null) return true
  if (high === 'moon') return false
  if (bid === 'moon') return true
  return bid > high
}

/** The calls `seat` may make right now; empty when it is not their turn. */
export function legalBids(state: HandState, seat: number): BidAction[] {
  if (state.phase !== 'bidding' || state.turnSeat !== seat || state.bidding.passed[seat]) return []
  const { rules } = state
  const out: BidAction[] = []
  for (let b = rules.minBid; b <= rules.maxBid; b += rules.bidStep) if (outbids(b, state.bidding.highBid)) out.push(b)
  if (outbids('moon', state.bidding.highBid)) out.push('moon')
  // Everyone else has passed and nobody bid: the dealer is stuck, no passing.
  const othersPassed = state.bidding.passed.every((p, i) => p || i === seat)
  if (!(othersPassed && state.bidding.highBid === null)) out.push('pass')
  return out
}

function applyBid(state: HandState, seat: number, bid: BidAction): Result {
  if (state.phase !== 'bidding') return fail('Bidding is over.')
  if (state.turnSeat !== seat) return fail('Not your turn to bid.')
  if (state.bidding.passed[seat]) return fail('You already passed.')
  const { rules, handedness } = state
  const b: BiddingState = {
    ...state.bidding,
    calls: [...state.bidding.calls, { seat, bid }],
    passed: [...state.bidding.passed],
  }

  if (bid === 'pass') {
    b.passed[seat] = true
    if (b.passed.every(Boolean)) {
      // Nobody bid: the dealer takes it at the minimum.
      return succeed(closeBidding({ ...state, bidding: b }, state.dealerSeat, rules.dealerStuckBid))
    }
    const remaining = b.passed.filter((p) => !p).length
    if (remaining === 1 && b.highSeat !== null && !b.passed[b.highSeat]) {
      return succeed(closeBidding({ ...state, bidding: b }, b.highSeat, b.highBid!))
    }
    b.turnSeat = nextActiveSeat(b, seat, handedness)
    return succeed({ ...state, bidding: b, turnSeat: b.turnSeat })
  }

  if (bid !== 'moon' && !isValidBidAmount(bid, rules)) {
    return fail(`Bids are ${rules.minBid} to ${rules.maxBid} in steps of ${rules.bidStep}, or Moon.`)
  }
  if (!outbids(bid, b.highBid)) return fail('You must bid higher than the current bid.')

  b.highBid = bid
  b.highSeat = seat

  if (bid === 'moon') {
    // Nothing outbids a Moon, so the auction ends here. The dealer alone may
    // still take it away ("overshoot") if they have not passed.
    const dealer = state.dealerSeat
    if (rules.dealerMayOvershoot && seat !== dealer && !b.passed[dealer]) {
      return succeed({ ...state, bidding: { ...b, turnSeat: dealer }, phase: 'overshoot', turnSeat: dealer })
    }
    return succeed(closeBidding({ ...state, bidding: b }, seat, 'moon'))
  }

  const remaining = b.passed.filter((p) => !p).length
  if (remaining === 1) return succeed(closeBidding({ ...state, bidding: b }, seat, bid))
  b.turnSeat = nextActiveSeat(b, seat, handedness)
  return succeed({ ...state, bidding: b, turnSeat: b.turnSeat })
}

function nextActiveSeat(b: BiddingState, from: number, handedness: number): number {
  let s = nextSeat(from, handedness)
  for (let i = 0; i < handedness && b.passed[s]; i++) s = nextSeat(s, handedness)
  return s
}

function closeBidding(state: HandState, bidderSeat: number, bid: Bid, overshot = false): HandState {
  return {
    ...state,
    phase: 'trump',
    bidderSeat,
    bid,
    overshot,
    turnSeat: bidderSeat,
    trick: { leadSeat: bidderSeat, plays: [] },
  }
}

function applyOvershoot(state: HandState, seat: number, accept: boolean): Result {
  if (state.phase !== 'overshoot') return fail('There is no Moon to overshoot.')
  if (seat !== state.dealerSeat) return fail('Only the dealer may overshoot.')
  const shooter = state.bidding.highSeat!
  const calls = [...state.bidding.calls, { seat, bid: accept ? ('moon' as const) : ('pass' as const) }]
  const bidding = { ...state.bidding, calls }
  if (accept) return succeed(closeBidding({ ...state, bidding: { ...bidding, highSeat: seat } }, seat, 'moon', true))
  return succeed(closeBidding({ ...state, bidding }, shooter, 'moon'))
}

/* -------------------------------------------------------------------- trump */

function applyTrump(state: HandState, seat: number, trump: Suit): Result {
  if (state.phase !== 'trump') return fail('Trump cannot be named now.')
  if (seat !== state.bidderSeat) return fail('Only the bidder names trump.')
  return succeed({
    ...state,
    phase: 'playing',
    trump,
    turnSeat: state.bidderSeat,
    trick: { leadSeat: state.bidderSeat, plays: [] },
  })
}

/* --------------------------------------------------------------------- play */

/**
 * Cards `seat` may legally play to the current trick. Leading: anything.
 * Following: the led color if held (the Rook counts as trump, so it follows a
 * trump lead and, under rookOnlyWhenVoid, may not be thrown on another color
 * while you still hold that color). Void: anything.
 */
export function legalPlays(state: HandState, seat: number): CardId[] {
  if (state.phase !== 'playing' || state.turnSeat !== seat || state.trump === null) return []
  const hand = state.hands[seat]
  const lead = state.trick.plays[0]
  if (!lead) return [...hand]
  const trump = state.trump
  const led = effectiveSuit(lead.card, trump)
  const following = hand.filter((c) => effectiveSuit(c, trump) === led)
  if (following.length === 0) return [...hand]
  if (led !== trump && !state.rules.rookOnlyWhenVoid && hand.includes(ROOK)) return [...following, ROOK]
  return following
}

/** Seat that wins a complete trick. */
export function trickWinner(trick: Trick, trump: Suit, rules: Rules): number {
  if (trick.plays.length === 0) throw new Error('empty trick')
  const led = effectiveSuit(trick.plays[0].card, trump)
  const trumps = trick.plays.filter((p) => effectiveSuit(p.card, trump) === trump)
  const pool = trumps.length ? trumps : trick.plays.filter((p) => effectiveSuit(p.card, trump) === led)
  return pool.reduce((best, p) => (strength(p.card, rules) > strength(best.card, rules) ? p : best)).seat
}

function applyPlay(state: HandState, seat: number, card: CardId): Result {
  if (state.phase !== 'playing') return fail('Cards cannot be played now.')
  if (state.turnSeat !== seat) return fail('Not your turn.')
  if (!state.hands[seat].includes(card)) return fail('You do not hold that card.')
  if (!legalPlays(state, seat).includes(card)) return fail('You must follow the led color.')

  const { handedness, rules, trump } = state
  const hands = state.hands.map((h, i) => (i === seat ? h.filter((c) => c !== card) : h))
  const trick: Trick = { ...state.trick, plays: [...state.trick.plays, { seat, card }] }

  if (trick.plays.length < handedness) {
    return succeed({ ...state, hands, trick, turnSeat: nextSeat(seat, handedness) })
  }

  const winnerSeat = trickWinner(trick, trump!, rules)
  const lastTrick = hands.every((h) => h.length === 0)
  const tookNest = lastTrick && rules.nestToLastTrick
  const points = pointsIn(trick.plays.map((p) => p.card), rules) + (tookNest ? pointsIn(state.nest, rules) : 0)
  const tricks = [...state.tricks, { ...trick, winnerSeat, points, tookNest }]

  const moonBroken =
    state.bid === 'moon' && rules.stopEarlyOnBrokenMoon && state.teams[winnerSeat] !== state.teams[state.bidderSeat!]

  if (lastTrick || moonBroken) {
    return succeed({ ...state, hands, tricks, trick: { leadSeat: winnerSeat, plays: [] }, phase: 'over', turnSeat: winnerSeat })
  }
  return succeed({ ...state, hands, tricks, trick: { leadSeat: winnerSeat, plays: [] }, turnSeat: winnerSeat })
}

/* ------------------------------------------------------------------ reducer */

export function applyAction(state: HandState, action: Action): Result {
  switch (action.type) {
    case 'bid':
      return applyBid(state, action.seat, action.bid)
    case 'overshoot':
      return applyOvershoot(state, action.seat, action.accept)
    case 'trump':
      return applyTrump(state, action.seat, action.trump)
    case 'play':
      return applyPlay(state, action.seat, action.card)
  }
}

/** Convenience for tests and bots: throws instead of returning an error. */
export function mustApply(state: HandState, action: Action): HandState {
  const r = applyAction(state, action)
  if (!r.ok) throw new Error(`${action.type} by seat ${action.seat}: ${r.error}`)
  return r.state
}

/** Number of tricks in a full hand. */
export function totalTricks(state: HandState): number {
  return state.hands.reduce((n, h) => n + h.length, 0) / state.handedness + state.tricks.length
}
