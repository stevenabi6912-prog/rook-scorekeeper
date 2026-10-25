import { ROOK, cardPoints, effectiveSuit, strength, suitOf, type CardId } from './cards'
import { legalBids, legalPlays, trickWinner, type BidAction, type HandState } from './engine'
import type { Rng } from './rng'
import { SUITS, type Suit } from './rules'

/*
 * Simple, always-legal computer players for the practice table. They are
 * meant to be plausible opponents, not strong ones.
 */

function bySuit(hand: CardId[]): Record<Suit, CardId[]> {
  const out: Record<Suit, CardId[]> = { red: [], yellow: [], green: [], black: [] }
  for (const c of hand) {
    const s = suitOf(c)
    if (s) out[s].push(c)
  }
  return out
}

/** The color this hand would like as trump: longest, then most high cards. */
export function botTrump(state: HandState, seat: number): Suit {
  const groups = bySuit(state.hands[seat])
  let best: Suit = 'red'
  let bestScore = -1
  for (const s of SUITS) {
    const cards = groups[s]
    const score = cards.length * 10 + cards.reduce((n, c) => n + strength(c, state.rules), 0) / 14
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  return best
}

/** Rough value of a hand, as the highest bid the bot is happy to make. */
export function botMaxBid(state: HandState, seat: number): number {
  const hand = state.hands[seat]
  const groups = bySuit(hand)
  const longest = Math.max(...SUITS.map((s) => groups[s].length))
  const highCards = hand.filter((c) => strength(c, state.rules) >= 13).length
  const points = hand.reduce((n, c) => n + cardPoints(c, state.rules), 0)
  const rook = hand.includes(ROOK) ? 15 : 0
  const raw = 45 + longest * 5 + highCards * 4 + points * 0.4 + rook
  return Math.floor(raw / 5) * 5
}

export function botBid(state: HandState, seat: number, rng: Rng): BidAction {
  const options = legalBids(state, seat)
  if (options.length === 0) throw new Error('bot has no legal bid')
  const numbers = options.filter((o): o is number => typeof o === 'number')
  const max = botMaxBid(state, seat)
  const hand = state.hands[seat]
  const groups = bySuit(hand)
  const longest = Math.max(...SUITS.map((s) => groups[s].length))
  // A monster hand shoots once in a while.
  if (options.includes('moon') && hand.includes(ROOK) && longest >= 7 && rng() < 0.6) return 'moon'
  const lowest = numbers[0]
  if (lowest === undefined) return options.includes('pass') ? 'pass' : options[0]
  if (lowest > max) return options.includes('pass') ? 'pass' : lowest
  // Usually the minimum; sometimes a small jump to keep things lively.
  const jump = rng() < 0.2 ? 5 : 0
  const choice = Math.min(lowest + jump, max)
  return numbers.includes(choice) ? choice : lowest
}

/**
 * Which cards to lay back into the Kitty: keep the intended trump and the
 * Rook, then shed zero-point cards from the shortest colors, lowest first.
 */
export function botDiscard(state: HandState, seat: number): CardId[] {
  const hand = state.hands[seat]
  const keepSuit = botTrump(state, seat)
  const groups = bySuit(hand)
  const ranked = [...hand].sort((a, b) => {
    const score = (c: CardId) => {
      if (c === ROOK) return 1000
      const suit = suitOf(c)!
      const trumpBonus = suit === keepSuit ? 500 : 0
      return trumpBonus + cardPoints(c, state.rules) * 10 + groups[suit].length * 3 + strength(c, state.rules)
    }
    return score(a) - score(b)
  })
  let picks = ranked.slice(0, state.nestPickedUp)
  if (!state.rules.discardPointsAllowed) {
    const free = ranked.filter((c) => cardPoints(c, state.rules) === 0)
    if (free.length >= state.nestPickedUp) picks = free.slice(0, state.nestPickedUp)
  }
  return picks
}

function winnerIfPlayed(state: HandState, seat: number, card: CardId): number {
  const trick = { ...state.trick, plays: [...state.trick.plays, { seat, card }] }
  return trickWinner(trick, state.trump!, state.rules)
}

const points = (c: CardId, state: HandState) => cardPoints(c, state.rules)
const str = (c: CardId, state: HandState) => strength(c, state.rules)

function lowest(cards: CardId[], state: HandState): CardId {
  return [...cards].sort((a, b) => points(a, state) - points(b, state) || str(a, state) - str(b, state))[0]
}
function highest(cards: CardId[], state: HandState): CardId {
  return [...cards].sort((a, b) => str(b, state) - str(a, state))[0]
}
function juiciest(cards: CardId[], state: HandState): CardId {
  return [...cards].sort((a, b) => points(b, state) - points(a, state) || str(a, state) - str(b, state))[0]
}

export function botPlay(state: HandState, seat: number, rng: Rng): CardId {
  const legal = legalPlays(state, seat)
  if (legal.length === 0) throw new Error('bot has no legal play')
  if (legal.length === 1) return legal[0]
  const trump = state.trump!
  const myTeam = state.teams[seat]
  const bidding = state.bidderSeat !== null && state.teams[state.bidderSeat] === myTeam

  if (state.trick.plays.length === 0) {
    const trumps = legal.filter((c) => effectiveSuit(c, trump) === trump)
    const plain = legal.filter((c) => effectiveSuit(c, trump) !== trump)
    if (bidding && trumps.length >= 2 && rng() < 0.7) return highest(trumps, state)
    if (plain.length) {
      const groups = bySuit(plain)
      const suit = SUITS.filter((s) => s !== trump).sort((a, b) => groups[b].length - groups[a].length)[0]
      const cards = groups[suit].length ? groups[suit] : plain
      return rng() < 0.6 ? highest(cards, state) : lowest(cards, state)
    }
    return highest(trumps, state)
  }

  const currentWinner = trickWinner(state.trick, trump, state.rules)
  const partnerWinning = state.teams[currentWinner] === myTeam && currentWinner !== seat
  const last = state.trick.plays.length === state.handedness - 1
  const winning = legal.filter((c) => winnerIfPlayed(state, seat, c) === seat)

  if (partnerWinning) {
    // Feed the trick points, unless an opponent still to play could beat it; then be modest.
    return last || rng() < 0.5 ? juiciest(legal, state) : lowest(legal, state)
  }
  if (winning.length) {
    if (last) return juiciest(winning, state)
    const trickPoints = state.trick.plays.reduce((n, p) => n + points(p.card, state), 0)
    // Not worth a high card for an empty trick unless bidding.
    if (trickPoints === 0 && !bidding && rng() < 0.5) return lowest(legal, state)
    return lowest(winning, state) === winning[0] ? [...winning].sort((a, b) => str(a, state) - str(b, state))[0] : winning[0]
  }
  return lowest(legal, state)
}
