import { RULES, otherTeam, type Bid, type Hand, type HandInput, type TeamId } from './types'

export interface Scores {
  A: number
  B: number
}

/** How a single hand changed the score. */
export interface HandOutcome {
  made: boolean
  /** Points added to each team. For the shooting team on a moon this is the
   *  difference between the new total and the old one (informational). */
  delta: Scores
  /** For a moon, the total the shooting team was SET to. */
  setTo?: number
  /** Totals after this hand. */
  totals: Scores
}

export interface ScoredHand {
  hand: Hand
  outcome: HandOutcome
}

const T = RULES.TOTAL_POINTS

/** Next multiple of 500 strictly above `score`. */
export function nextMultipleAbove(score: number, step = RULES.TARGET_SCORE): number {
  return (Math.floor(score / step) + 1) * step
}

/** Next multiple of 500 strictly below `score`. */
export function nextMultipleBelow(score: number, step = RULES.TARGET_SCORE): number {
  return (Math.ceil(score / step) - 1) * step
}

export type ScoreInput = Pick<HandInput, 'bidTeam' | 'bid' | 'pointsTaken' | 'moonMade'>

/**
 * Pure scoring of one hand. `before` are the totals entering the hand.
 */
export function scoreHand(before: Scores, hand: ScoreInput): HandOutcome {
  const bidTeam = hand.bidTeam
  const other = otherTeam(bidTeam)
  const totals: Scores = { ...before }
  const delta: Scores = { A: 0, B: 0 }

  if (hand.bid === 'moon') {
    const made = hand.moonMade === true
    const p = made ? T : clampPoints(hand.pointsTaken)
    const setTo = made ? nextMultipleAbove(before[bidTeam]) : nextMultipleBelow(before[bidTeam])
    totals[bidTeam] = setTo
    totals[other] = before[other] + (made ? 0 : T - p)
    delta[bidTeam] = setTo - before[bidTeam]
    delta[other] = totals[other] - before[other]
    return { made, delta, setTo, totals }
  }

  const bid = hand.bid
  const p = clampPoints(hand.pointsTaken)
  const made = p >= bid
  delta[bidTeam] = made ? p : -bid
  delta[other] = T - p
  totals[bidTeam] = before[bidTeam] + delta[bidTeam]
  totals[other] = before[other] + delta[other]
  return { made, delta, totals }
}

function clampPoints(p: number): number {
  if (!Number.isFinite(p)) return 0
  return Math.max(0, Math.min(T, p))
}

/** Hands sorted by handNumber, then by creation time as a tiebreaker. */
export function sortHands<H extends Pick<Hand, 'handNumber' | 'createdAt'>>(hands: H[]): H[] {
  return [...hands].sort((a, b) => a.handNumber - b.handNumber || a.createdAt - b.createdAt)
}

/**
 * Replays every hand in order from 0-0. Because a moon SETS a team's total,
 * running totals can only be derived by replaying, never by summing.
 */
export function replayHands(hands: Hand[]): ScoredHand[] {
  let totals: Scores = { A: 0, B: 0 }
  const out: ScoredHand[] = []
  for (const hand of sortHands(hands)) {
    const outcome = scoreHand(totals, hand)
    totals = outcome.totals
    out.push({ hand, outcome })
  }
  return out
}

export function currentTotals(hands: Hand[]): Scores {
  const replayed = replayHands(hands)
  return replayed.length ? replayed[replayed.length - 1].outcome.totals : { A: 0, B: 0 }
}

/** Teams at or over the target. Empty when the game is still going. */
export function teamsAtTarget(totals: Scores): TeamId[] {
  return (['A', 'B'] as TeamId[]).filter((t) => totals[t] >= RULES.TARGET_SCORE)
}

export function leadingTeam(totals: Scores): TeamId | null {
  if (totals.A === totals.B) return null
  return totals.A > totals.B ? 'A' : 'B'
}

export const BID_OPTIONS: number[] = (() => {
  const out: number[] = []
  for (let b = RULES.MIN_BID; b <= RULES.MAX_BID; b += RULES.BID_STEP) out.push(b)
  return out
})()

export const POINT_OPTIONS: number[] = (() => {
  const out: number[] = []
  for (let p = 0; p <= T; p += RULES.POINT_STEP) out.push(p)
  return out
})()

export function isValidBid(bid: Bid): boolean {
  if (bid === 'moon') return true
  return Number.isInteger(bid) && bid >= RULES.MIN_BID && bid <= RULES.MAX_BID && bid % RULES.BID_STEP === 0
}

export function isValidPoints(p: number, max: number = T): boolean {
  return Number.isInteger(p) && p >= 0 && p <= max && p % RULES.POINT_STEP === 0
}

export function describeBid(bid: Bid): string {
  return bid === 'moon' ? 'Moon' : String(bid)
}
