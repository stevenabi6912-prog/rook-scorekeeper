import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import type { CardId } from '../../game/cards'
import { clean } from '../../data/store'
import type { MatchStore, MatchTx } from './store'
import type { ChatMessage, MatchDoc, NewMatch } from './types'

const asDoc = <T>(snap: QueryDocumentSnapshot<DocumentData>): T => ({ id: snap.id, ...snap.data() }) as T

/**
 * Online tables in Firestore:
 *   families/{code}/matches/{id}                public match document
 *   families/{code}/matches/{id}/seats/{seat}   { cards } — readable only by that seat's phone
 *   families/{code}/matches/{id}/nest/current   { cards } — readable by the bidder while exchanging
 * The rules in firestore.rules enforce who may read and write what.
 */
export function createFirestoreMatchStore(db: Firestore, uid: string, familyCode: string): MatchStore {
  const family = doc(db, 'families', familyCode)
  const matches = collection(family, 'matches')
  const matchDoc = (id: string) => doc(matches, id)
  const seatDoc = (id: string, seat: number) => doc(matches, id, 'seats', String(seat))
  const nestDoc = (id: string) => doc(matches, id, 'nest', 'current')
  const messagesCol = (id: string) => collection(matches, id, 'messages')

  return {
    kind: 'firestore',
    uid,

    subscribeMatches(cb, onError) {
      return onSnapshot(
        query(matches, orderBy('createdAt', 'desc'), limit(25)),
        (snap) => cb(snap.docs.map((d) => asDoc<MatchDoc>(d))),
        onError,
      )
    },
    subscribeMatch(id, cb, onError) {
      return onSnapshot(matchDoc(id), (snap) => cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as MatchDoc) : null), onError)
    },
    subscribeSeat(matchId, seat, cb, onError) {
      return onSnapshot(
        seatDoc(matchId, seat),
        (snap) => cb(snap.exists() ? ((snap.data().cards as CardId[]) ?? []) : null),
        onError,
      )
    },
    async getSeat(matchId, seat) {
      const snap = await getDoc(seatDoc(matchId, seat))
      return snap.exists() ? ((snap.data().cards as CardId[]) ?? []) : []
    },
    subscribeMessages(matchId, cb, onError) {
      // Newest 100 by the index order, handed back oldest first.
      return onSnapshot(
        query(messagesCol(matchId), orderBy('createdAt', 'desc'), limit(100)),
        (snap) => cb(snap.docs.map((d) => asDoc<ChatMessage>(d)).reverse()),
        onError,
      )
    },
    async sendMessage(matchId, m) {
      await addDoc(messagesCol(matchId), clean({ ...m, createdAt: Date.now() }))
    },
    async createMatch(m: NewMatch) {
      const ref = await addDoc(matches, clean({ ...m, createdAt: Date.now(), updatedAt: Date.now() }))
      return ref.id
    },
    async deleteMatch(id) {
      const batch = writeBatch(db)
      for (let seat = 0; seat < 6; seat++) batch.delete(seatDoc(id, seat))
      batch.delete(nestDoc(id))
      batch.delete(matchDoc(id))
      await batch.commit()
      // Chat lines are left behind; they are unreachable without the match and cost nothing.
    },
    transact<T>(matchId: string, fn: (tx: MatchTx) => Promise<T>): Promise<T> {
      return runTransaction(db, async (t) => {
        // Buffered writes (a holder object, because TypeScript cannot see assignments made inside the callbacks).
        const buf: { match: Partial<MatchDoc> | null; nest: CardId[] | null } = { match: null, nest: null }
        const seatWrites = new Map<number, CardId[]>()
        const tx: MatchTx = {
          async getMatch() {
            const snap = await t.get(matchDoc(matchId))
            if (!snap.exists()) throw new Error('That table no longer exists.')
            return { id: snap.id, ...snap.data() } as MatchDoc
          },
          async getSeat(seat) {
            const snap = await t.get(seatDoc(matchId, seat))
            return snap.exists() ? ((snap.data().cards as CardId[]) ?? []) : []
          },
          async getNest() {
            const snap = await t.get(nestDoc(matchId))
            return snap.exists() ? ((snap.data().cards as CardId[]) ?? []) : []
          },
          setMatch(patch) {
            buf.match = { ...(buf.match ?? {}), ...patch }
          },
          setSeat(seat, cards) {
            seatWrites.set(seat, [...cards])
          },
          setNest(cards) {
            buf.nest = [...cards]
          },
        }
        const result = await fn(tx)
        // Firestore wants every read before any write; the buffer above guarantees it.
        for (const [seat, cards] of seatWrites) t.set(seatDoc(matchId, seat), { cards })
        if (buf.nest) t.set(nestDoc(matchId), { cards: buf.nest })
        if (buf.match) t.update(matchDoc(matchId), clean({ ...buf.match, updatedAt: Date.now() }) as DocumentData)
        return result
      })
    },
  }
}
