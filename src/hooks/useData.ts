import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../data/StoreContext'
import type { Game, Hand, Plan, Player } from '../lib/types'

/**
 * Turns raw Firestore errors into something a family member can act on, and
 * keeps the Firebase error code so a screenshot of the message is enough to
 * work out what went wrong.
 */
export function describeStoreError(e: Error): string {
  const code = (e as { code?: string }).code ?? ''
  const msg = e.message ?? ''
  if (code === 'permission-denied' || /insufficient permissions|permission-denied/i.test(msg)) {
    return 'Firebase refused it (permission-denied). Close the app completely and open it again; if it keeps happening, send a screenshot of this message.'
  }
  if (code === 'unavailable' || /unavailable|network|offline/i.test(msg)) return 'Could not reach Firebase. Check your connection and try again.'
  if (code === 'failed-precondition' || /indexeddb|indexed database/i.test(msg)) {
    return `This browser's storage is not working for Firebase (${code || 'storage'}: ${msg}). Close the app completely and open it again.`
  }
  return `${code ? `${code}: ` : ''}${msg || 'Something went wrong talking to Firebase.'}`
}

export function usePlayers() {
  const store = useStore()
  const [players, setPlayers] = useState<Player[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => store.subscribePlayers(setPlayers, (e) => setError(describeStoreError(e))), [store])
  const byId = useMemo(() => new Map((players ?? []).map((p) => [p.id, p])), [players])
  return { players, byId, loading: players === null, error }
}

export function usePlans() {
  const store = useStore()
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => store.subscribePlans(setPlans, (e) => setError(describeStoreError(e))), [store])
  return { plans, error }
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
