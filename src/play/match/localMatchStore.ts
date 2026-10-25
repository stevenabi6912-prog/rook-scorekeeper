import type { CardId } from '../../game/cards'
import type { MatchStore, MatchTx } from './store'
import type { MatchDoc, NewMatch } from './types'

interface LocalMatchData {
  matches: Record<string, MatchDoc>
  seats: Record<string, CardId[][]>
  nests: Record<string, CardId[]>
}

const DEVICE_KEY = 'rook.deviceId'

/** A stable id for this browser, standing in for the Firebase uid in demo mode. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = 'dev-' + Math.random().toString(36).slice(2, 10)
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return 'dev-local'
  }
}

/**
 * Demo-mode match store kept in this browser's localStorage. Nothing syncs
 * between devices and nothing is private: it exists so the whole online flow
 * (seats, bots, host duties, scoring) can be exercised on one phone.
 */
export function createLocalMatchStore(familyCode: string): MatchStore {
  const KEY = `rook.local.matches.${familyCode}`
  const listeners = new Set<() => void>()
  let data: LocalMatchData = load()

  function load(): LocalMatchData {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) return JSON.parse(raw) as LocalMatchData
    } catch {
      /* ignore */
    }
    return { matches: {}, seats: {}, nests: {} }
  }
  function save() {
    localStorage.setItem(KEY, JSON.stringify(data))
    listeners.forEach((l) => l())
  }
  function listen(fn: () => void) {
    listeners.add(fn)
    fn()
    return () => listeners.delete(fn)
  }
  const id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  let queue: Promise<unknown> = Promise.resolve()

  return {
    kind: 'local',
    uid: deviceId(),

    subscribeMatches(cb) {
      return listen(() => cb(Object.values(data.matches).sort((a, b) => b.createdAt - a.createdAt)))
    },
    subscribeMatch(matchId, cb) {
      return listen(() => cb(data.matches[matchId] ?? null))
    },
    subscribeSeat(matchId, seat, cb) {
      return listen(() => cb(data.seats[matchId]?.[seat] ?? null))
    },
    async createMatch(m: NewMatch) {
      const match: MatchDoc = { ...m, id: id(), createdAt: Date.now(), updatedAt: Date.now() }
      data = { ...data, matches: { ...data.matches, [match.id]: match } }
      save()
      return match.id
    },
    async deleteMatch(matchId) {
      const matches = { ...data.matches }
      const seats = { ...data.seats }
      const nests = { ...data.nests }
      delete matches[matchId]
      delete seats[matchId]
      delete nests[matchId]
      data = { matches, seats, nests }
      save()
    },
    transact<T>(matchId: string, fn: (tx: MatchTx) => Promise<T>): Promise<T> {
      // Moves run one at a time, like a transaction would serialize them.
      const run = async () => {
        const match = data.matches[matchId]
        if (!match) throw new Error('That table no longer exists.')
        let matchPatch: Partial<MatchDoc> | null = null
        const seatWrites = new Map<number, CardId[]>()
        let nestWrite: CardId[] | null = null
        const tx: MatchTx = {
          async getMatch() {
            return match
          },
          async getSeat(seat) {
            return data.seats[matchId]?.[seat] ?? []
          },
          async getNest() {
            return data.nests[matchId] ?? []
          },
          setMatch(patch) {
            matchPatch = { ...(matchPatch ?? {}), ...patch }
          },
          setSeat(seat, cards) {
            seatWrites.set(seat, [...cards])
          },
          setNest(cards) {
            nestWrite = [...cards]
          },
        }
        const result = await fn(tx)
        const seats = [...(data.seats[matchId] ?? Array.from({ length: match.handedness }, () => []))]
        for (const [seat, cards] of seatWrites) seats[seat] = cards
        data = {
          matches: { ...data.matches, [matchId]: { ...match, ...(matchPatch ?? {}), updatedAt: Date.now() } },
          seats: { ...data.seats, [matchId]: seats },
          nests: nestWrite ? { ...data.nests, [matchId]: nestWrite } : data.nests,
        }
        save()
        return result
      }
      const next = queue.then(run, run)
      queue = next.catch(() => undefined)
      return next
    },
  }
}
