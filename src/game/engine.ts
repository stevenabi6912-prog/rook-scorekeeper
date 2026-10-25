import type { Handedness, TeamId } from '../lib/types'
import { ROOK, cardPoints, effectiveSuit, pointsIn, strength, type CardId } from './cards'
import { deal, type Deal } from './deal'
import type { Rules, Suit } from './rules'

/*
 * Pure state machine for one hand of Rook. No React, no Firebase. The same
 * reducer runs on every phone (optimistic UI), inside the Firestore
 * transaction that commits a move, and in the tests.
 *
 *   bidding -> (overshoot) -> (nest: bidder picks up the Kitty and lays cards down) -> trump -> playing -> over
 */

export type Bid = number | 'moon'
export type BidAction = Bid | 'pass'
export type Phase = 'bidding' | 'overshoot' | 'nest' | 'trump' | 'playing' | 'over'

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
  /** Cards each player was dealt (the bidder briefly holds more during the nest phase). */
  handSize: number
  /** Cards still held, by seat. Private in the real game; the engine sees all. */
  hands: CardId[][]
  /** The Kitty. Dealt face down (top card face up under nestTopExposed); empty while the
   *  bidder holds it; then the cards the bidder laid down, face down, until the last trick. */
  nest: CardId[]
  /** How many cards the bidder picked up and must lay back down (0 when nobody takes the nest). */
  nestPickedUp: number
  /** Seat dealt the Rook, or null when it was in the Kitty (recorded as "Kitty" for the stats). */
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
  | { type: 'discard'; seat: number; cards: CardId[] }
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
    handSize: dealt.hands[0]?.length ?? 0,
    hands: dealt.hands.map((h) => [...h]),
    nest: [...dealt.nest],
    nestPickedUp: 0,
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
  if (outbids('moon', state.bidding.highBid) && mayShoot(state, seat)) out.push('moon')
  // Everyone else has passed and nobody bid: the dealer is stuck, no passing.
  const othersPassed = state.bidding.passed.every((p, i) => p || i === seat)
  if (!(othersPassed && state.bidding.highBid === null)) out.push('pass')
  return out
}

/** Under moonOnlyAsFirstBid a player who has already called a number cannot shoot. */
function mayShoot(state: HandState, seat: number): boolean {
  return !state.rules.moonOnlyAsFirstBid || !state.bidding.calls.some((c) => c.seat === seat)
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
  if (bid === 'moon' && !mayShoot(state, seat)) return fail('Moon can only be your first bid.')

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
  const next: HandState = {
    ...state,
    phase: 'trump',
    bidderSeat,
    bid,
    overshot,
    turnSeat: bidderSeat,
    trick: { leadSeat: bidderSeat, plays: [] },
  }
  // The bidder picks up the Kitty and must lay the same number of cards back down.
  if (state.rules.bidderTakesNest && state.nest.length > 0) {
    next.phase = 'nest'
    next.hands = state.hands.map((h, i) => (i === bidderSeat ? [...h, ...state.nest] : h))
    next.nest = []
    next.nestPickedUp = state.nest.length
    // A Rook that came up in the Kitty is credited to the Kitty, not the bidder (Steven's rule).
  }
  return next
}

/* --------------------------------------------------------------------- nest */

/** Why `cards` cannot be laid down by `seat` right now, or null if they can. */
export function discardProblem(state: HandState, seat: number, cards: CardId[]): string | null {
  if (state.phase !== 'nest') return 'The Kitty is not being exchanged now.'
  if (seat !== state.bidderSeat) return 'Only the bidder exchanges with the Kitty.'
  if (cards.length !== state.nestPickedUp) return `Lay down exactly ${state.nestPickedUp} cards.`
  if (new Set(cards).size !== cards.length) return 'A card is listed twice.'
  const hand = state.hands[seat]
  if (cards.some((c) => !hand.includes(c))) return 'You do not hold that card.'
  if (!state.rules.discardPointsAllowed && cards.some((c) => cardPoints(c, state.rules) > 0)) {
    return 'Point cards cannot go into the Kitty.'
  }
  return null
}

function applyDiscard(state: HandState, seat: number, cards: CardId[]): Result {
  const problem = discardProblem(state, seat, cards)
  if (problem) return fail(problem)
  const hands = state.hands.map((h, i) => (i === seat ? h.filter((c) => !cards.includes(c)) : h))
  return succeed({ ...state, hands, nest: [...cards], phase: 'trump', turnSeat: seat })
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
    case 'discard':
      return applyDiscard(state, action.seat, action.cards)
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

/** The Kitty card everyone can see while bidding (null once it is picked up or hidden by the rules). */
export function exposedNestCard(state: HandState): CardId | null {
  if (!state.rules.nestTopExposed || state.nest.length === 0) return null
  if (state.phase !== 'bidding' && state.phase !== 'overshoot') {
    // Without a pickup the dealt Kitty stays on the table, still showing, until the last trick.
    if (state.rules.bidderTakesNest || state.tricks.some((t) => t.tookNest)) return null
  }
  return state.nest[0]
}

/** Number of tricks in a full hand. */
export function totalTricks(state: HandState): number {
  return state.handSize
}
