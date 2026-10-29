import { useEffect, useRef } from 'react'
import { botDecision } from '../../game/bots'
import type { Rng } from '../../game/rng'
import { toHandInput } from '../../game/score'
import type { DataStore } from '../../data/store'
import { currentTotals, scoreHand, teamsAtTarget } from '../../lib/scoring'
import type { Game, Hand } from '../../lib/types'
import { commitMove } from './moves'
import type { MatchStore } from './store'
import type { MatchDoc } from './types'
import { toState } from './view'

/*
 * What the host's phone does for the table, because nothing runs on a
 * server: move the bots, move for a person whose clock has run out, write
 * each finished hand to the scorekeeper, and finish the game at 500.
 */

/** The scorekeeper's number for the hand this table is on. */
export function scorekeeperHandNumber(match: MatchDoc): number {
  return match.firstHandNumber + match.handNumber - 1
}

const BOT_DELAY_MS = 900
/** Extra time past the clock before the host moves for an absent person (their own phone gets first go). */
const GRACE_MS = 20000

export function useHostDuties(opts: {
  matchStore: MatchStore
  dataStore: DataStore
  match: MatchDoc | null
  game: Game | null | undefined
  hands: Hand[] | null
  rng: Rng
  turnLimitMs: number
}) {
  const { matchStore, dataStore, match, game, hands, rng, turnLimitMs } = opts
  const isHost = !!match && match.hostUid === matchStore.uid
  const scoringRef = useRef<number | null>(null)
  // When this phone first saw each decision, so the takeover clock does not
  // depend on another device's clock being in step with ours.
  const seenRef = useRef<{ key: string; at: number } | null>(null)

  // Bots, and people whose clock ran out.
  useEffect(() => {
    if (!isHost || !match || match.status !== 'playing' || !match.pub || match.pub.phase === 'over') return
    const pub = match.pub
    const seat = pub.turnSeat
    const info = match.seats[seat]
    const key = `${match.handNumber}:${pub.phase}:${pub.tricks.length}:${pub.trick.plays.length}:${pub.bidding.calls.length}:${pub.nestPickedUp}:${seat}`
    if (seenRef.current?.key !== key) seenRef.current = { key, at: Date.now() }
    const sinceSeen = Date.now() - seenRef.current.at
    const delay = info.bot ? BOT_DELAY_MS + rng() * 500 : Math.max(0, turnLimitMs + GRACE_MS - sinceSeen)
    const timer = setTimeout(() => {
      commitMove(matchStore, match.id, seat, (state) => botDecision(state, seat, rng, info.bot ? {} : { overshootAccept: false })).catch(() => {
        /* another phone moved first, or the move was refused; the next snapshot re-evaluates */
      })
    }, delay)
    return () => clearTimeout(timer)
  }, [isHost, match, matchStore, rng, turnLimitMs])

  // A finished hand goes to the scorekeeper exactly once; the game ends at 500.
  useEffect(() => {
    if (!isHost || !match || !game || !hands || match.status !== 'playing' || !match.pub) return
    const pub = match.pub
    if (pub.phase !== 'over' || match.scoredHandNumber >= match.handNumber) return
    if (scoringRef.current === match.handNumber) return
    scoringRef.current = match.handNumber
    const state = toState(pub, 0, [])
    const input = toHandInput(state, game.seatOrder)
    const skHand = scorekeeperHandNumber(match)
    const before = currentTotals(hands.filter((h) => h.handNumber < skHand))
    const after = scoreHand(before, input).totals
    ;(async () => {
      try {
        // Skip the write if an earlier attempt already landed (a reload, or a change of host
        // right at the end of the hand). Ask the store afresh rather than trusting the
        // subscription, which may lag.
        const fresh = await dataStore.getHands(game.id)
        if (!fresh.some((h) => h.handNumber === skHand)) await dataStore.addHand(game.id, input)
        const at = teamsAtTarget(after)
        const winner = at.length === 0 ? null : at.length === 1 ? at[0] : after.A >= after.B ? 'A' : 'B'
        await matchStore.transact(match.id, async (tx) => {
          const m = await tx.getMatch()
          tx.setMatch({ scoredHandNumber: m.handNumber, ...(winner ? { status: 'finished', winner } : {}) })
        })
        if (winner) await dataStore.updateGame(game.id, { status: 'finished', winner, finishedAt: Date.now() })
      } catch {
        scoringRef.current = null
      }
    })()
  }, [isHost, match, game, hands, dataStore, matchStore])

  return { isHost }
}
