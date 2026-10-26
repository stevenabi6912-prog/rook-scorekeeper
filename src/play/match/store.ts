import type { CardId } from '../../game/cards'
import type { Unsubscribe } from '../../data/store'
import type { ChatMessage, MatchDoc, NewChatMessage, NewMatch, Presence } from './types'

/**
 * Reads and writes inside one atomic move. Reads happen first; writes are
 * applied together when the callback resolves (Firestore requires this
 * order, and the local store honors it too).
 */
export interface MatchTx {
  getMatch(): Promise<MatchDoc>
  getSeat(seat: number): Promise<CardId[]>
  getNest(): Promise<CardId[]>
  setMatch(patch: Partial<Omit<MatchDoc, 'id'>>): void
  setSeat(seat: number, cards: CardId[]): void
  setNest(cards: CardId[]): void
}

/**
 * Everything the online table needs from the database. Implemented by
 * Firestore for the real app and by an in-browser store for demo mode.
 */
export interface MatchStore {
  readonly kind: 'firestore' | 'local'
  /** This phone's identity: the Firebase anonymous uid, or a device id in demo mode. */
  readonly uid: string

  subscribeMatches(cb: (matches: MatchDoc[]) => void, onError?: (e: Error) => void): Unsubscribe
  subscribeMatch(id: string, cb: (match: MatchDoc | null) => void, onError?: (e: Error) => void): Unsubscribe
  /** This seat's cards; null until dealt. Only readable by the seat's phone (or the host for bots). */
  subscribeSeat(matchId: string, seat: number, cb: (cards: CardId[] | null) => void, onError?: (e: Error) => void): Unsubscribe
  /** One-shot read of a seat's cards (everyone may read every seat once a hand is over). */
  getSeat(matchId: string, seat: number): Promise<CardId[]>

  /** The latest table chat, oldest first. */
  subscribeMessages(matchId: string, cb: (messages: ChatMessage[]) => void, onError?: (e: Error) => void): Unsubscribe
  sendMessage(matchId: string, m: NewChatMessage): Promise<void>

  /** Everyone's presence documents (the caller decides who still counts as here). */
  subscribePresence(cb: (list: Presence[]) => void, onError?: (e: Error) => void): Unsubscribe
  /** This phone's heartbeat. */
  setPresence(playerId: string, tableId: string | null): Promise<void>

  createMatch(m: NewMatch): Promise<string>
  deleteMatch(id: string): Promise<void>
  /** Run reads and writes as one atomic move; retried on contention. */
  transact<T>(matchId: string, fn: (tx: MatchTx) => Promise<T>): Promise<T>
}
