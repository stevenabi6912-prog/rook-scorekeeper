import { sortHands } from '../lib/scoring'
import type { Game, Hand, HandInput, Player } from '../lib/types'
import { clean, type DataStore, type NewGame, type NewPlayer } from './store'

interface LocalData {
  players: Player[]
  games: Game[]
  hands: Record<string, Hand[]>
}

/**
 * Demo store kept in this browser's localStorage. Used when Firebase has not
 * been configured yet so the app can be tried out. Nothing syncs between
 * devices in this mode.
 */
export function createLocalStore(familyCode: string): DataStore {
  const KEY = `rook.local.${familyCode}`
  const listeners = new Set<() => void>()
  let data: LocalData = load()

  function load(): LocalData {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) return JSON.parse(raw) as LocalData
    } catch {
      /* ignore */
    }
    return { players: [], games: [], hands: {} }
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
  const tick = async () => {}

  return {
    kind: 'local',
    subscribePlayers(cb) {
      return listen(() => cb([...data.players].sort((a, b) => a.createdAt - b.createdAt)))
    },
    async addPlayer(p: NewPlayer) {
      const player: Player = clean({ ...p, id: id(), archived: false, createdAt: Date.now() })
      data = { ...data, players: [...data.players, player] }
      save()
      return player.id
    },
    async updatePlayer(pid, patch) {
      data = { ...data, players: data.players.map((p) => (p.id === pid ? clean({ ...p, ...patch }) : p)) }
      save()
    },
    subscribeGames(cb) {
      return listen(() => cb([...data.games].sort((a, b) => b.createdAt - a.createdAt)))
    },
    subscribeGame(gid, cb) {
      return listen(() => cb(data.games.find((g) => g.id === gid) ?? null))
    },
    async createGame(g: NewGame) {
      const game: Game = clean({ ...g, id: id(), status: 'active', createdAt: Date.now() })
      data = { ...data, games: [...data.games, game], hands: { ...data.hands, [game.id]: [] } }
      save()
      return game.id
    },
    async updateGame(gid, patch) {
      data = { ...data, games: data.games.map((g) => (g.id === gid ? clean({ ...g, ...patch }) : g)) }
      save()
    },
    async deleteGame(gid) {
      const hands = { ...data.hands }
      delete hands[gid]
      data = { ...data, games: data.games.filter((g) => g.id !== gid), hands }
      save()
    },
    subscribeHands(gid, cb) {
      return listen(() => cb(sortHands(data.hands[gid] ?? [])))
    },
    async getHands(gid) {
      await tick()
      return sortHands(data.hands[gid] ?? [])
    },
    async addHand(gid, hand: HandInput) {
      const existing = data.hands[gid] ?? []
      const handNumber = existing.reduce((m, h) => Math.max(m, h.handNumber), 0) + 1
      const h: Hand = clean({ ...hand, id: id(), handNumber, createdAt: Date.now() })
      data = { ...data, hands: { ...data.hands, [gid]: [...existing, h] } }
      save()
      return h.id
    },
    async updateHand(gid, hid, patch) {
      const list = (data.hands[gid] ?? []).map((h) => {
        if (h.id !== hid) return h
        const next: Hand = clean({ ...h, ...patch })
        if (next.bid !== 'moon') delete next.moonMade
        return next
      })
      data = { ...data, hands: { ...data.hands, [gid]: list } }
      save()
    },
    async deleteHand(gid, hid) {
      const list = sortHands(data.hands[gid] ?? []).filter((h) => h.id !== hid).map((h, i) => ({ ...h, handNumber: i + 1 }))
      data = { ...data, hands: { ...data.hands, [gid]: list } }
      save()
    },
  }
}
