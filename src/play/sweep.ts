import { useEffect, useRef } from 'react'
import { useMatchStore, useStore } from '../data/StoreContext'
import { useGames } from '../hooks/useData'
import { leadingTeam, replayHands } from '../lib/scoring'
import type { Game } from '../lib/types'
import { IDLE_TABLE_MS, abandonIdle, touchTable } from './match/moves'
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

/**
 * Phones at a table touch it once it has gone this long without a write, so a
 * table waiting for players (or for the host to deal) is not taken for idle.
 */
export const KEEP_ALIVE_AFTER_MS = IDLE_TABLE_MS / 2

export function needsTouch(m: MatchDoc, now = Date.now()): boolean {
  return (m.status === 'seating' || m.status === 'playing') && now >= m.updatedAt + KEEP_ALIVE_AFTER_MS
}

/** While `here` (seated at, or hosting, this table), keep it from going idle. */
export function useKeepAlive(match: MatchDoc | null | undefined, here: boolean) {
  const store = useMatchStore()
  const id = match?.id
  const status = match?.status
  const updatedAt = match?.updatedAt ?? 0
  useEffect(() => {
    if (!id || !here || (status !== 'seating' && status !== 'playing')) return
    const touch = () => {
      if (document.visibilityState === 'hidden') return
      if (Date.now() >= updatedAt + KEEP_ALIVE_AFTER_MS) touchTable(store, id).catch(() => undefined)
    }
    touch()
    const t = setInterval(touch, 30_000)
    document.addEventListener('visibilitychange', touch)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', touch)
    }
  }, [store, id, status, updatedAt, here])
}

/**
 * An online game to finish or delete: its table is gone, closed or idle. A game
 * is written a moment before its table, and a phone in the lobby may see the
 * one before the other, so a game younger than the idle limit is left alone.
 */
export function orphanedOnlineGame(g: Game, table: MatchDoc | undefined, now = Date.now()): boolean {
  if (g.mode !== 'online' || g.status !== 'active') return false
  if (now < g.createdAt + IDLE_TABLE_MS) return false
  return !table || table.status === 'abandoned' || table.status === 'finished' || isIdle(table, now)
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
        if (busy.current.has(g.id) || !orphanedOnlineGame(g, byGame.get(g.id), now)) continue
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
