import type { Trump } from '../lib/types'

/** Rook suits are the four colors; the scorekeeper already names them. */
export type Suit = Trump
export const SUITS: Suit[] = ['red', 'yellow', 'green', 'black']

/**
 * Every rule the family answered in docs/online-play-plan.md, as data, so a
 * different answer is a one-line change and tests can exercise variants.
 */
export interface Rules {
  /** Ranks taken out of every color before dealing. */
  removedRanks: number[]
  /** When the 1 is in the deck, does it rank above the 14? */
  oneIsHigh: boolean
  /** Where the Rook sits among the trumps. */
  rookRank: 'high' | 'low'
  rookPoints: number
  /** Point value of each rank (ranks not listed score 0). */
  points: Record<number, number>
  nestSize: number
  /** Nobody picks the nest up; its points go to whoever wins the last trick. */
  nestToLastTrick: boolean
  /** The top card of the nest is dealt face up so everyone sees it while bidding. */
  nestTopExposed: boolean
  /** The Rook may only be played when void in the led color (or when trump is led). */
  rookOnlyWhenVoid: boolean
  minBid: number
  maxBid: number
  bidStep: number
  /** Bid everyone passes to the dealer. */
  dealerStuckBid: number
  /** Moon means the bidding team must take every trick (not merely every point). */
  moonRequiresAllTricks: boolean
  /** End the hand the moment a Moon can no longer be made. */
  stopEarlyOnBrokenMoon: boolean
  /** After someone bids Moon the dealer may take the Moon for themselves. */
  dealerMayOvershoot: boolean
  /** Moon may only be a player's first call; once you have bid a number you cannot shoot. */
  moonOnlyAsFirstBid: boolean
}

/** Steven's family rules, answered 2026-10-25. See the plan doc for open questions. */
export const FAMILY_RULES: Rules = {
  // 5 through 14 in each color plus the Rook: 41 cards, 120 points.
  removedRanks: [1, 2, 3, 4],
  oneIsHigh: true,
  rookRank: 'high',
  rookPoints: 20,
  points: { 5: 5, 10: 10, 14: 10 },
  nestSize: 5,
  nestToLastTrick: true,
  nestTopExposed: true,
  rookOnlyWhenVoid: true,
  minBid: 65,
  maxBid: 120,
  bidStep: 5,
  dealerStuckBid: 65,
  moonRequiresAllTricks: true,
  stopEarlyOnBrokenMoon: false,
  dealerMayOvershoot: true,
  moonOnlyAsFirstBid: true,
}

export const ALL_RANKS: number[] = Array.from({ length: 14 }, (_, i) => i + 1)

export function ranksInPlay(rules: Rules): number[] {
  return ALL_RANKS.filter((r) => !rules.removedRanks.includes(r))
}
