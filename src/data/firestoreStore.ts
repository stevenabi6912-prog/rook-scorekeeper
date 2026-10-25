import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { sortHands } from '../lib/scoring'
import type { Game, Hand, HandInput, Player } from '../lib/types'
import { clean, type DataStore, type NewGame, type NewPlayer } from './store'

const asDoc = <T>(snap: QueryDocumentSnapshot<DocumentData>): T => ({ id: snap.id, ...snap.data() }) as T

/**
 * All data lives under families/{code}/… so one family passcode namespaces
 * players, games and hands.
 */
export function createFirestoreStore(db: Firestore, familyCode: string): DataStore {
  const family = doc(db, 'families', familyCode)
  const players = collection(family, 'players')
  const games = collection(family, 'games')
  const hands = (gameId: string) => collection(games, gameId, 'hands')

  async function nextHandNumber(gameId: string): Promise<number> {
    const snap = await getDocs(hands(gameId))
    let max = 0
    snap.forEach((d) => {
      const n = (d.data() as Hand).handNumber ?? 0
      if (n > max) max = n
    })
    return max + 1
  }

  return {
    kind: 'firestore',

    subscribePlayers(cb, onError) {
      return onSnapshot(
        query(players, orderBy('createdAt', 'asc')),
        (snap) => cb(snap.docs.map((d) => asDoc<Player>(d))),
        onError,
      )
    },
    async addPlayer(p: NewPlayer) {
      const ref = await addDoc(players, clean({ ...p, archived: false, createdAt: Date.now() }))
      return ref.id
    },
    updatePlayer(id, patch) {
      return updateDoc(doc(players, id), clean(patch))
    },

    subscribeGames(cb, onError) {
      return onSnapshot(
        query(games, orderBy('createdAt', 'desc')),
        (snap) => cb(snap.docs.map((d) => asDoc<Game>(d))),
        onError,
      )
    },
    subscribeGame(id, cb, onError) {
      return onSnapshot(
        doc(games, id),
        (snap) => cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as Game) : null),
        onError,
      )
    },
    async createGame(g: NewGame) {
      const ref = await addDoc(games, clean({ ...g, status: 'active', createdAt: Date.now() }))
      return ref.id
    },
    updateGame(id, patch) {
      const data: Record<string, unknown> = clean({ ...patch })
      // Reopening a game clears the winner; Firestore needs an explicit delete.
      if ('winner' in patch && patch.winner == null) data.winner = deleteField()
      return updateDoc(doc(games, id), data)
    },
    async deleteGame(id) {
      const snap = await getDocs(hands(id))
      const batch = writeBatch(db)
      snap.forEach((d) => batch.delete(d.ref))
      batch.delete(doc(games, id))
      await batch.commit()
    },

    subscribeHands(gameId, cb, onError) {
      return onSnapshot(
        hands(gameId),
        (snap) => cb(sortHands(snap.docs.map((d) => asDoc<Hand>(d)))),
        onError,
      )
    },
    async getHands(gameId) {
      const snap = await getDocs(hands(gameId))
      return sortHands(snap.docs.map((d) => asDoc<Hand>(d)))
    },
    async addHand(gameId, hand: HandInput) {
      const handNumber = await nextHandNumber(gameId)
      const ref = await addDoc(hands(gameId), clean({ ...hand, handNumber, createdAt: Date.now() }))
      // The hand is over, so the "trump right now" indicator resets.
      await updateDoc(doc(games, gameId), { currentTrump: null })
      return ref.id
    },
    updateHand(gameId, handId, patch) {
      // `moonMade` must be removed when a moon is edited into a normal bid.
      const data: Record<string, unknown> = clean({ ...patch })
      if (patch.bid !== undefined && patch.bid !== 'moon') data.moonMade = null
      return updateDoc(doc(hands(gameId), handId), data)
    },
    async deleteHand(gameId, handId) {
      const snap = await getDocs(hands(gameId))
      const all = sortHands(snap.docs.map((d) => asDoc<Hand>(d)))
      const batch = writeBatch(db)
      batch.delete(doc(hands(gameId), handId))
      let n = 1
      for (const h of all) {
        if (h.id === handId) continue
        if (h.handNumber !== n) batch.update(doc(hands(gameId), h.id), { handNumber: n })
        n++
      }
      await batch.commit()
    },
  }
}
