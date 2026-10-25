import { replayHands } from './scoring'
import type { Game, Hand, Player, TeamId } from './types'

export interface PlayerStats {
  playerId: string
  gamesPlayed: number
  wins: number
  bids: number
  bidsMade: number
  /** Average of numeric bids (moons excluded). */
  averageBid: number | null
  moonsAttempted: number
  moonsMade: number
  rookHeld: number
}

export interface GameSummary {
  game: Game
  totals: { A: number; B: number }
  handCount: number
}

export function summarizeGame(game: Game, hands: Hand[]): GameSummary {
  const replayed = replayHands(hands)
  const totals = replayed.length ? replayed[replayed.length - 1].outcome.totals : { A: 0, B: 0 }
  return { game, totals, handCount: replayed.length }
}

function teamOfPlayer(game: Game, playerId: string): TeamId | null {
  if (game.teams.A.playerIds.includes(playerId)) return 'A'
  if (game.teams.B.playerIds.includes(playerId)) return 'B'
  return null
}

/**
 * Aggregates stats per player across games. `handsByGame` maps game id -> hands.
 * Wins only count finished games with a recorded winner.
 */
export function computePlayerStats(
  players: Player[],
  games: Game[],
  handsByGame: Record<string, Hand[]>,
): PlayerStats[] {
  const map = new Map<string, PlayerStats & { bidSum: number }>()
  const get = (id: string) => {
    let s = map.get(id)
    if (!s) {
      s = {
        playerId: id, gamesPlayed: 0, wins: 0, bids: 0, bidsMade: 0, averageBid: null,
        moonsAttempted: 0, moonsMade: 0, rookHeld: 0, bidSum: 0,
      }
      map.set(id, s)
    }
    return s
  }
  for (const p of players) get(p.id)

  for (const game of games) {
    const participants = [...game.teams.A.playerIds, ...game.teams.B.playerIds]
    for (const id of participants) {
      const s = get(id)
      s.gamesPlayed++
      if (game.status === 'finished' && game.winner && teamOfPlayer(game, id) === game.winner) s.wins++
    }
    for (const { hand, outcome } of replayHands(handsByGame[game.id] ?? [])) {
      const s = get(hand.bidderId)
      if (hand.bid === 'moon') {
        s.moonsAttempted++
        if (outcome.made) s.moonsMade++
      } else {
        s.bids++
        s.bidSum += hand.bid
        if (outcome.made) s.bidsMade++
      }
      if (hand.rookHolderId) get(hand.rookHolderId).rookHeld++
    }
  }

  return [...map.values()].map(({ bidSum, ...s }) => ({
    ...s,
    averageBid: s.bids ? Math.round((bidSum / s.bids) * 10) / 10 : null,
  }))
}
