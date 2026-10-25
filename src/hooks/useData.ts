import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../data/StoreContext'
import type { Game, Hand, Player } from '../lib/types'

/** Turns raw Firestore errors into something a family member can act on. */
export function describeStoreError(e: Error): string {
  const msg = e.message ?? ''
  if (/insufficient permissions|permission-denied/i.test(msg)) {
    return 'Firestore refused the request. The security rules have probably not been published yet: in the Firebase console open Firestore Database → Rules, paste the contents of firestore.rules, and click Publish.'
  }
  if (/unavailable|network/i.test(msg)) return 'Could not reach Firebase. Check your connection.'
  return msg || 'Something went wrong talking to Firebase.'
}

export function usePlayers() {
  const store = useStore()
  const [players, setPlayers] = useState<Player[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => store.subscribePlayers(setPlayers, (e) => setError(describeStoreError(e))), [store])
  const byId = useMemo(() => new Map((players ?? []).map((p) => [p.id, p])), [players])
  return { players, byId, loading: players === null, error }
}

export function useGames() {
  const store = useStore()
  const [games, setGames] = useState<Game[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => store.subscribeGames(setGames, (e) => setError(describeStoreError(e))), [store])
  return { games, loading: games === null, error }
}

export function useGame(gameId: string | undefined) {
  const store = useStore()
  const [game, setGame] = useState<Game | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!gameId) return
    setGame(undefined)
    return store.subscribeGame(gameId, setGame, (e) => setError(describeStoreError(e)))
  }, [store, gameId])
  return { game, loading: game === undefined, error }
}

export function useHands(gameId: string | undefined) {
  const store = useStore()
  const [hands, setHands] = useState<Hand[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!gameId) return
    setHands(null)
    return store.subscribeHands(gameId, setHands, (e) => setError(describeStoreError(e)))
  }, [store, gameId])
  return { hands, loading: hands === null, error }
}

/**
 * One-time load of every game's hands, keyed by game id. Re-fetches whenever
 * the set of games changes (a new game or a finished one).
 */
export function useAllHands(games: Game[] | null) {
  const store = useStore()
  const [handsByGame, setHandsByGame] = useState<Record<string, Hand[]> | null>(null)
  // null while games are still loading; a distinct string once loaded, even
  // when the list is empty, so the effect runs and the spinner clears.
  const key = useMemo(() => (games ? 'loaded:' + games.map((g) => `${g.id}:${g.status}`).join(',') : null), [games])
  useEffect(() => {
    if (key === null || !games) return
    let cancelled = false
    Promise.all(games.map(async (g) => [g.id, await store.getHands(g.id)] as const))
      .then((entries) => {
        if (!cancelled) setHandsByGame(Object.fromEntries(entries))
      })
      .catch(() => {
        if (!cancelled) setHandsByGame({})
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key])
  return handsByGame
}
