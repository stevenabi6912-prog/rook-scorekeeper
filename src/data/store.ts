import type { Game, Hand, HandInput, Player } from '../lib/types'

export type Unsubscribe = () => void

export type NewPlayer = Omit<Player, 'id' | 'createdAt' | 'archived'>
export type NewGame = Omit<Game, 'id' | 'createdAt' | 'status'>

/**
 * Everything the UI needs from the database. Implemented by Firestore for the
 * real app and by an in-browser store for demo mode (no Firebase config yet).
 */
export interface DataStore {
  readonly kind: 'firestore' | 'local'

  subscribePlayers(cb: (players: Player[]) => void, onError?: (e: Error) => void): Unsubscribe
  addPlayer(p: NewPlayer): Promise<string>
  updatePlayer(id: string, patch: Partial<Omit<Player, 'id'>>): Promise<void>

  subscribeGames(cb: (games: Game[]) => void, onError?: (e: Error) => void): Unsubscribe
  subscribeGame(id: string, cb: (game: Game | null) => void, onError?: (e: Error) => void): Unsubscribe
  createGame(g: NewGame): Promise<string>
  updateGame(id: string, patch: Partial<Omit<Game, 'id'>>): Promise<void>
  deleteGame(id: string): Promise<void>

  subscribeHands(gameId: string, cb: (hands: Hand[]) => void, onError?: (e: Error) => void): Unsubscribe
  /** Fetch hands once (used for history and stats). */
  getHands(gameId: string): Promise<Hand[]>
  addHand(gameId: string, hand: HandInput): Promise<string>
  updateHand(gameId: string, handId: string, patch: Partial<HandInput>): Promise<void>
  /** Deletes the hand and renumbers the hands after it. */
  deleteHand(gameId: string, handId: string): Promise<void>
}

/** Strips undefined values, which Firestore rejects. */
export function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}
