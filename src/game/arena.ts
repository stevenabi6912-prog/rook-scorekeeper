import { applyAction, startHand, type Action, type HandState } from './engine'
import { seededRng, type Rng } from './rng'
import { FAMILY_RULES } from './rules'
import { summarizeHand } from './score'
import type { Handedness, TeamId } from '../lib/types'

/*
 * Bot tournament: the same deals played with one strategy on team A and
 * another on team B, then again with the sides swapped, so luck of the deal
 * cancels out. Used by the arena test to prove a change to the bots helps.
 */

export type Strategy = (state: HandState, seat: number, rng: Rng) => Action | null

export interface ArenaResult {
  hands: number
  /** Average points per hand for strategy X (over both seatings). */
  pointsX: number
  pointsY: number
  /** Hands where X's side made its bid / set Y's bid, as rates. */
  xBidMade: number
  yBidMade: number
}

export function playHand(seed: string, handedness: Handedness, teams: TeamId[], strategyOf: (seat: number) => Strategy, rng: Rng): HandState {
  let s = startHand({ rules: FAMILY_RULES, handedness, teams, dealerSeat: 0, seed })
  let guard = 0
  while (s.phase !== 'over') {
    const action = strategyOf(s.turnSeat)(s, s.turnSeat, rng)
    if (!action) throw new Error(`no action in ${s.phase}`)
    const r = applyAction(s, action)
    if (!r.ok) throw new Error(`${action.type} by ${action.seat}: ${r.error}`)
    s = r.state
    if (++guard > 400) throw new Error('hand did not end')
  }
  return s
}

export function arena(x: Strategy, y: Strategy, hands: number, handedness: Handedness = 4, seedPrefix = 'arena'): ArenaResult {
  const teams: TeamId[] = handedness === 6 ? ['A', 'B', 'A', 'B', 'A', 'B'] : ['A', 'B', 'A', 'B']
  let px = 0
  let py = 0
  let xMade = 0
  let yMade = 0
  let xBids = 0
  let yBids = 0
  for (let i = 0; i < hands; i++) {
    for (const xIsA of [true, false]) {
      const rng = seededRng(`${seedPrefix}-${i}-${xIsA}`)
      const s = playHand(`${seedPrefix}-${i}`, handedness, teams, (seat) => ((teams[seat] === 'A') === xIsA ? x : y), rng)
      const r = summarizeHand(s)
      const xTeam: TeamId = xIsA ? 'A' : 'B'
      const yTeam: TeamId = xIsA ? 'B' : 'A'
      px += r.pointsByTeam[xTeam]
      py += r.pointsByTeam[yTeam]
      if (r.bidTeam === xTeam) {
        xBids++
        if (r.made) xMade++
      } else {
        yBids++
        if (r.made) yMade++
      }
    }
  }
  const n = hands * 2
  return { hands: n, pointsX: px / n, pointsY: py / n, xBidMade: xBids ? xMade / xBids : 0, yBidMade: yBids ? yMade / yBids : 0 }
}
