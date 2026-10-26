import { SUITS, ranksInPlay, type Rules, type Suit } from './rules'

/**
 * Cards travel as short strings so Firestore documents stay small and
 * readable: "R10" is the red 10, "Y14" the yellow 14, "ROOK" the bird.
 */
export type CardId = string

export const ROOK: CardId = 'ROOK'

export interface SuitCard {
  kind: 'suit'
  suit: Suit
  rank: number
}
export interface RookCard {
  kind: 'rook'
}
export type Card = SuitCard | RookCard

const LETTER: Record<Suit, string> = { red: 'R', yellow: 'Y', green: 'G', black: 'B' }
const SUIT_BY_LETTER: Record<string, Suit> = { R: 'red', Y: 'yellow', G: 'green', B: 'black' }

export function cardId(card: Card): CardId {
  return card.kind === 'rook' ? ROOK : `${LETTER[card.suit]}${card.rank}`
}

export function parseCard(id: CardId): Card {
  if (id === ROOK) return { kind: 'rook' }
  const m = /^([RYGB])(\d{1,2})$/.exec(id)
  const suit = m ? SUIT_BY_LETTER[m[1]] : undefined
  const rank = m ? Number(m[2]) : NaN
  if (!suit || !Number.isInteger(rank) || rank < 1 || rank > 14) throw new Error(`Not a card: ${id}`)
  return { kind: 'suit', suit, rank }
}

export function isCardId(id: unknown): id is CardId {
  if (typeof id !== 'string') return false
  try {
    parseCard(id)
    return true
  } catch {
    return false
  }
}

export const isRook = (id: CardId): boolean => id === ROOK

/** The printed color of a card; null for the Rook. */
export function suitOf(id: CardId): Suit | null {
  const c = parseCard(id)
  return c.kind === 'suit' ? c.suit : null
}

export function rankOf(id: CardId): number | null {
  const c = parseCard(id)
  return c.kind === 'suit' ? c.rank : null
}

/** The suit a card follows and is beaten by: the Rook is always a trump. */
export function effectiveSuit(id: CardId, trump: Suit): Suit {
  return suitOf(id) ?? trump
}

/**
 * Strength within a color, higher wins. A 1 that ranks high becomes 15. The
 * Rook is above every trump when high and below every trump when low.
 */
export function strength(id: CardId, rules: Rules): number {
  const c = parseCard(id)
  if (c.kind === 'rook') return rules.rookRank === 'high' ? 100 : 0
  if (c.rank === 1 && rules.oneIsHigh) return 15
  return c.rank
}

export function cardPoints(id: CardId, rules: Rules): number {
  const c = parseCard(id)
  if (c.kind === 'rook') return rules.rookPoints
  return rules.points[c.rank] ?? 0
}

export function pointsIn(cards: CardId[], rules: Rules): number {
  return cards.reduce((sum, c) => sum + cardPoints(c, rules), 0)
}

/** Every card in the deck for these rules, in a fixed order (unshuffled). */
export function buildDeck(rules: Rules): CardId[] {
  const deck: CardId[] = []
  for (const suit of SUITS) for (const rank of ranksInPlay(rules)) deck.push(cardId({ kind: 'suit', suit, rank }))
  deck.push(ROOK)
  return deck
}

/** Total points in the deck; the scorekeeper assumes 120. */
export function deckPoints(rules: Rules): number {
  return pointsIn(buildDeck(rules), rules)
}

/**
 * Display order for a hand: colors grouped, trump (with the Rook) on the
 * right, each color low to high. Without a trump yet the Rook goes last.
 */
export function sortHand(cards: CardId[], trump: Suit | null, rules: Rules): CardId[] {
  const order = [...SUITS.filter((s) => s !== trump), ...(trump ? [trump] : [])]
  const suitIndex = (id: CardId) => {
    const s = suitOf(id)
    if (s === null) return order.length // Rook after everything, or with trump
    return order.indexOf(s)
  }
  return [...cards].sort((a, b) => {
    const ia = isRook(a) && trump ? order.indexOf(trump) : suitIndex(a)
    const ib = isRook(b) && trump ? order.indexOf(trump) : suitIndex(b)
    return ia - ib || strength(a, rules) - strength(b, rules)
  })
}
