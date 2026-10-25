import type { Handedness } from '../lib/types'
import { buildDeck, type CardId } from './cards'
import { seededRng, shuffle } from './rng'
import type { Rules } from './rules'

export interface Deal {
  /** One array of card ids per seat, in seat order. */
  hands: CardId[][]
  nest: CardId[]
}

/** Cards each player receives; throws if the deck does not divide evenly. */
export function handSize(rules: Rules, handedness: Handedness): number {
  const deckSize = buildDeck(rules).length
  const remaining = deckSize - rules.nestSize
  if (remaining <= 0 || remaining % handedness !== 0) {
    throw new Error(
      `A ${deckSize}-card deck with a ${rules.nestSize}-card nest does not deal evenly to ${handedness} players.`,
    )
  }
  return remaining / handedness
}

/**
 * Deterministic deal from a seed. Dealing is round-robin starting left of the
 * dealer (seat 0 is wherever the caller says it is); the nest is the last
 * cards off the deck.
 */
export function deal(rules: Rules, handedness: Handedness, seed: string): Deal {
  const size = handSize(rules, handedness)
  const deck = shuffle(buildDeck(rules), seededRng(seed))
  const hands: CardId[][] = Array.from({ length: handedness }, () => [])
  let i = 0
  for (let round = 0; round < size; round++) {
    for (let seat = 0; seat < handedness; seat++) hands[seat].push(deck[i++])
  }
  const nest = deck.slice(i)
  return { hands, nest }
}
