import type { Handedness, TeamId } from '../lib/types'
import { ROOK, buildDeck, cardPoints, deckPoints, effectiveSuit, pointsIn, strength, type CardId } from './cards'
import { deal, type Deal } from './deal'
import type { Rules, Suit } from './rules'

/*
 * Pure state machine for one hand of Rook. No React, no Firebase. The same
 * reducer runs on every phone (optimistic UI), inside the Firestore
 * transaction that commits a move, and in the tests.
 *
 *   bidding -> (overshoot) -> (nest: bidder picks up the Kitty and lays cards down) -> trump -> playing -> over
 *
 * Online, a phone only knows its own cards. Other seats' cards are UNKNOWN
 * placeholders; every rule below is written so a move needs only public
 * information plus the mover's own hand (the Kitty's points on the last trick
 * are what is left of the deck's 120 once every played card is counted).
 */

/** Placeholder for a card another player holds. Never parsed. */
export const UNKNOWN: CardId = '?'
export const isUnknown = (c: CardId): boolean => c === UNKNOWN

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
  /** How many cards the bidder picked up and must lay back down (0 until picked up, or when nobody takes the nest). */
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
  /** Seat that threw the cards in to end the hand early, if any. */
  claimedBySeat: number | null
  /** The cards they threw in (shown face up to everyone). */
  claimedCards: CardId[]
}

export type Action =
  | { type: 'bid'; seat: number; bid: BidAction }
  | { type: 'overshoot'; seat: number; accept: boolean }
  /** The bidder takes the Kitty into their hand (the first half of the nest phase). */
  | { type: 'pickup'; seat: number }
  | { type: 'discard'; seat: number; cards: CardId[] }
  | { type: 'trump'; seat: number; trump: Suit }
  | { type: 'play'; seat: number; card: CardId }
  /** "Throw the cards in": the seat on lead cannot lose another trick, so the hand ends now. */
  | { type: 'claim'; seat: number }

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
    claimedBySeat: null,
    claimedCards: [],
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
  // The bidder picks up the Kitty next, then lays the same number of cards back down.
  if (state.rules.bidderTakesNest && state.nest.length > 0) {
    next.phase = 'nest'
    next.nestPickedUp = 0
  }
  return next
}

/* --------------------------------------------------------------------- nest */

function applyPickup(state: HandState, seat: number): Result {
  if (state.phase !== 'nest') return fail('The Kitty is not being exchanged now.')
  if (seat !== state.bidderSeat) return fail('Only the bidder picks up the Kitty.')
  if (state.nestPickedUp > 0) return fail('The Kitty has already been picked up.')
  if (state.nest.some(isUnknown)) return fail('The Kitty cards are not available to you.')
  const hands = state.hands.map((h, i) => (i === seat ? [...h, ...state.nest] : h))
  // A Rook that came up in the Kitty stays credited to the Kitty, not the bidder (Steven's rule).
  return succeed({ ...state, hands, nest: [], nestPickedUp: state.nest.length })
}

/** Why `cards` cannot be laid down by `seat` right now, or null if they can. */
export function discardProblem(state: HandState, seat: number, cards: CardId[]): string | null {
  if (state.phase !== 'nest') return 'The Kitty is not being exchanged now.'
  if (seat !== state.bidderSeat) return 'Only the bidder exchanges with the Kitty.'
  if (state.nestPickedUp === 0) return 'Pick up the Kitty first.'
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
  if (state.turnSeat !== seat) return []
  return playableCards(state, seat)
}

/**
 * Cards `seat` could play to the current trick if it were their turn: what a
 * player may line up in advance while waiting. Before anyone has led, that
 * is the whole hand.
 */
export function playableCards(state: HandState, seat: number): CardId[] {
  if (state.phase !== 'playing' || state.trump === null) return []
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
  const inTrick = pointsIn(trick.plays.map((p) => p.card), rules)
  // Count the Kitty against the hands as they are AFTER this card leaves.
  const points = inTrick + (tookNest ? nestPoints({ ...state, hands }, inTrick) : 0)
  const tricks = [...state.tricks, { ...trick, winnerSeat, points, tookNest }]

  const moonBroken =
    state.bid === 'moon' && rules.stopEarlyOnBrokenMoon && state.teams[winnerSeat] !== state.teams[state.bidderSeat!]

  if (lastTrick || moonBroken) {
    return succeed({ ...state, hands, tricks, trick: { leadSeat: winnerSeat, plays: [] }, phase: 'over', turnSeat: winnerSeat })
  }
  return succeed({ ...state, hands, tricks, trick: { leadSeat: winnerSeat, plays: [] }, turnSeat: winnerSeat })
}

/**
 * Points in the Kitty. When the Kitty is hidden (online, after the bidder
 * laid it down) it is whatever is left of the deck's total once every played
 * card is counted, so nobody needs to see it to score the last trick.
 * `alsoPlayed` are points in cards played but not yet in `state.tricks`.
 */
function nestPoints(state: HandState, alsoPlayed = 0): number {
  const { rules } = state
  if (!state.nest.some(isUnknown)) return pointsIn(state.nest, rules)
  const played = state.tricks.reduce((n, t) => n + pointsIn(t.plays.map((p) => p.card), rules), 0)
  const inHands = state.hands.reduce((n, h) => n + pointsIn(h.filter((c) => !isUnknown(c)), rules), 0)
  return deckPoints(rules) - played - alsoPlayed - inHands
}

/* -------------------------------------------------------------------- claim */

/**
 * Every card `seat` has not seen: the deck minus played cards, minus their
 * own hand, minus the Kitty when they know it (the bidder laid it down). Any
 * of these could be in an opponent's hand, so a claim must beat them all.
 */
export function unseenCards(state: HandState, seat: number): CardId[] {
  const known = new Set<CardId>(state.hands[seat])
  for (const t of state.tricks) for (const p of t.plays) known.add(p.card)
  for (const p of state.trick.plays) known.add(p.card)
  if (!state.nest.some(isUnknown)) for (const c of state.nest) known.add(c)
  return buildDeck(state.rules).filter((c) => !known.has(c))
}

/**
 * Could a hand holding `holder` beat any of `cards` when each is led?
 * The Rook counts as a trump.
 */
export function canBeatAny(cards: CardId[], holder: CardId[], trump: Suit, rules: Rules): boolean {
  const held = holder.filter((c) => !isUnknown(c))
  const heldTrump = held.filter((c) => effectiveSuit(c, trump) === trump)
  const top = (list: CardId[]) => list.reduce((m, c) => Math.max(m, strength(c, rules)), -Infinity)
  return cards.some((card) => {
    const suit = effectiveSuit(card, trump)
    const mine = strength(card, rules)
    if (suit === trump) return top(heldTrump) > mine
    if (heldTrump.length > 0) return true
    return top(held.filter((c) => effectiveSuit(c, trump) === suit)) > mine
  })
}

/**
 * Can `seat` throw the cards in? Only when they are on lead and no card
 * they have not seen could beat any card they hold when led: their trumps
 * are higher than every unseen trump (the Rook counts), and any plain card
 * is safe only once every trump is accounted for and nothing unseen of its
 * color is higher. Uses public information and the claimer's own hand only,
 * so a phone can decide it alone. It is a sufficient test, not a complete
 * one; a hand that needs a particular order of leads is not claimable.
 */
export function canClaimRest(state: HandState, seat: number): boolean {
  if (state.phase !== 'playing' || state.turnSeat !== seat || state.trick.plays.length > 0) return false
  const trump = state.trump
  if (!trump) return false
  const mine = state.hands[seat]
  if (mine.length === 0 || mine.some(isUnknown)) return false
  return !canBeatAny(mine, unseenCards(state, seat), trump, state.rules)
}

function applyClaim(state: HandState, seat: number): Result {
  if (state.phase !== 'playing') return fail('The hand is not being played.')
  if (state.turnSeat !== seat || state.trick.plays.length > 0) return fail('You can only throw the cards in on your lead.')
  if (!canClaimRest(state, seat)) return fail('Someone could still take a trick.')
  const { rules, handedness } = state
  const hands = state.hands.map((h) => [...h])
  const tricks = [...state.tricks]
  const remaining = hands[seat].length
  // Points nobody can see from here: hidden hands and a hidden Kitty. They all
  // belong to the claimer and land on the last trick.
  const hidden =
    deckPoints(rules) -
    tricks.reduce((n, t) => n + pointsIn(t.plays.map((p) => p.card), rules), 0) -
    state.hands.reduce((n, h) => n + pointsIn(h.filter((c) => !isUnknown(c)), rules), 0) -
    (state.nest.some(isUnknown) ? 0 : pointsIn(state.nest, rules))
  const everythingKnown = !state.nest.some(isUnknown) && state.hands.every((h) => !h.some(isUnknown))
  // Record the rest as tricks won by the claimer, strongest lead first. Other
  // players' cards are included when known (practice table) and left out when
  // not (online).
  hands[seat].sort((a, b) => strength(b, rules) - strength(a, rules))
  const claimedCards = [...hands[seat]]
  for (let t = 0; t < remaining; t++) {
    const plays: Play[] = []
    for (let i = 0; i < handedness; i++) {
      const s = (seat + i) % handedness
      const card = hands[s].shift()
      if (card && !isUnknown(card)) plays.push({ seat: s, card })
    }
    const last = t === remaining - 1
    const tookNest = last && rules.nestToLastTrick
    let points = pointsIn(plays.map((p) => p.card), rules)
    if (last) points += (tookNest && everythingKnown ? pointsIn(state.nest, rules) : 0) + (everythingKnown ? 0 : hidden)
    tricks.push({ leadSeat: seat, plays, winnerSeat: seat, points, tookNest })
  }
  return succeed({ ...state, hands, tricks, trick: { leadSeat: seat, plays: [] }, phase: 'over', turnSeat: seat, claimedBySeat: seat, claimedCards })
}

/* ------------------------------------------------------------------ reducer */

export function applyAction(state: HandState, action: Action): Result {
  switch (action.type) {
    case 'bid':
      return applyBid(state, action.seat, action.bid)
    case 'overshoot':
      return applyOvershoot(state, action.seat, action.accept)
    case 'pickup':
      return applyPickup(state, action.seat)
    case 'discard':
      return applyDiscard(state, action.seat, action.cards)
    case 'trump':
      return applyTrump(state, action.seat, action.trump)
    case 'play':
      return applyPlay(state, action.seat, action.card)
    case 'claim':
      return applyClaim(state, action.seat)
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
