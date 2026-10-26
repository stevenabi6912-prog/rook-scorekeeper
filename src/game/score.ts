import { ROOK_IN_KITTY, otherTeam, type HandInput, type TeamId } from '../lib/types'
import type { HandState } from './engine'

export interface HandResult {
  bidTeam: TeamId
  bid: number | 'moon'
  pointsByTeam: Record<TeamId, number>
  tricksByTeam: Record<TeamId, number>
  /** Bid made (for a Moon: every trick taken, or every point when the rules only ask for points). */
  made: boolean
  /** Only meaningful when bid === 'moon'. */
  moonMade: boolean
  /** Every trick was played (false when a hand was cut short by a broken Moon). */
  complete: boolean
  /** Seat that threw the cards in, if the hand ended on a claim. */
  claimedBySeat: number | null
}

function emptyTeams(): Record<TeamId, number> {
  return { A: 0, B: 0 }
}

/** Points and tricks taken so far, by team. Safe to call mid-hand for a live scoreboard. */
export function tallies(state: HandState): { points: Record<TeamId, number>; tricks: Record<TeamId, number> } {
  const points = emptyTeams()
  const tricks = emptyTeams()
  for (const t of state.tricks) {
    const team = state.teams[t.winnerSeat]
    points[team] += t.points
    tricks[team] += 1
  }
  return { points, tricks }
}

/** Could the bidding team still make a Moon? */
export function moonStillPossible(state: HandState): boolean {
  if (state.bid !== 'moon' || state.bidderSeat === null) return true
  const team = state.teams[state.bidderSeat]
  if (state.rules.moonRequiresAllTricks) return state.tricks.every((t) => state.teams[t.winnerSeat] === team)
  return tallies(state).points[otherTeam(team)] === 0
}

export function summarizeHand(state: HandState): HandResult {
  if (state.phase !== 'over') throw new Error('The hand is not over.')
  if (state.bidderSeat === null || state.bid === null) throw new Error('No bidder.')
  const bidTeam = state.teams[state.bidderSeat]
  const { points, tricks } = tallies(state)
  const complete = state.hands.every((h) => h.length === 0)
  if (state.bid === 'moon') {
    const moonMade = complete && moonStillPossible(state)
    return { bidTeam, bid: 'moon', pointsByTeam: points, tricksByTeam: tricks, made: moonMade, moonMade, complete, claimedBySeat: state.claimedBySeat }
  }
  return {
    bidTeam,
    bid: state.bid,
    pointsByTeam: points,
    tricksByTeam: tricks,
    made: points[bidTeam] >= state.bid,
    moonMade: false,
    complete,
    claimedBySeat: state.claimedBySeat,
  }
}

/**
 * The finished hand as the scorekeeper records it. `seatPlayerIds` maps seat
 * index to the scorekeeper player id (the game's seatOrder rotated so that
 * seat 0 is whoever the match calls seat 0). The existing scoring engine then
 * applies the family's 500-jump Moon rules unchanged.
 */
export function toHandInput(state: HandState, seatPlayerIds: string[]): HandInput {
  const r = summarizeHand(state)
  const input: HandInput = {
    dealerId: seatPlayerIds[state.dealerSeat],
    bidderId: seatPlayerIds[state.bidderSeat!],
    bidTeam: r.bidTeam,
    bid: r.bid,
    // For a made Moon the scorekeeper expects 120; every trick taken means
    // every point taken, so this is already the deck total.
    pointsTaken: r.pointsByTeam[r.bidTeam],
    rookHolderId: state.rookHolderSeat === null ? ROOK_IN_KITTY : seatPlayerIds[state.rookHolderSeat],
    trump: state.trump,
  }
  if (r.bid === 'moon') input.moonMade = r.moonMade
  return input
}
