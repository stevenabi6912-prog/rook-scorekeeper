import { useEffect, useRef } from 'react'
import { useMatchStore, useStore } from '../data/StoreContext'
import { useGames } from '../hooks/useData'
import { leadingTeam, replayHands } from '../lib/scoring'
import { IDLE_TABLE_MS, abandonIdle } from './match/moves'
import type { MatchDoc } from './match/types'

/*
 * Tidying up after online play. A table with no action for five minutes is
 * closed, and an online game whose table is gone, closed or idle is finished
 * (or deleted when no hand was ever scored). Games scored by hand are never
 * touched. Whichever phone is looking at the lobby or the Score tab does it.
 */

export function isIdle(m: MatchDoc, now = Date.now()): boolean {
  return (m.status === 'seating' || m.status === 'playing') && now > m.updatedAt + IDLE_TABLE_MS
}

export function useIdleSweep(matches: MatchDoc[] | null) {
  const matchStore = useMatchStore()
  const dataStore = useStore()
  const { games } = useGames()
  const busy = useRef(new Set<string>())

  useEffect(() => {
    if (!matches || !games) return
    const run = async () => {
      const now = Date.now()
      for (const m of matches) {
        if (!isIdle(m, now) || busy.current.has(m.id)) continue
        busy.current.add(m.id)
        await abandonIdle(matchStore, m.id).catch(() => undefined) // another phone may have beaten us to it
      }
      const byGame = new Map(matches.map((m) => [m.gameId, m]))
      for (const g of games) {
        if (g.mode !== 'online' || g.status !== 'active' || busy.current.has(g.id)) continue
        const table = byGame.get(g.id)
        const tableGone = !table || table.status === 'abandoned' || table.status === 'finished' || isIdle(table, now)
        if (!tableGone) continue
        busy.current.add(g.id)
        try {
          const hands = await dataStore.getHands(g.id)
          if (hands.length === 0) {
            await dataStore.deleteGame(g.id)
          } else {
            const totals = replayHands(hands).at(-1)?.outcome.totals ?? { A: 0, B: 0 }
            await dataStore.updateGame(g.id, { status: 'finished', winner: leadingTeam(totals), finishedAt: now })
          }
        } catch {
          /* someone else may have finished it */
        }
      }
    }
    run()
    const t = setInterval(run, 60_000)
    return () => clearInterval(t)
  }, [matches, games, matchStore, dataStore])
}
