import type { CardId } from '../../game/cards'
import type { HandState } from '../../game/engine'
import type { Handedness, TeamId } from '../../lib/types'

/*
 * An online table ("match") lives under families/{code}/matches/{matchId}.
 * The match document is public to the family. Each seat's cards live in a
 * private sub-document, and the Kitty in another, so a phone can only read
 * its own hand (see firestore.rules and docs/online-play-plan.md §3).
 */

export type MatchStatus = 'seating' | 'playing' | 'finished' | 'abandoned'

export interface MatchSeat {
  /** Scorekeeper player id; names, emoji and colors come from the players collection. */
  playerId: string
  team: TeamId
  /** Firebase anonymous uid of the phone holding this seat (null until claimed). */
  uid: string | null
  /** Moved by the host's phone. */
  bot: boolean
}

/** A hand with every private card removed: counts instead of cards. */
export interface PublicHand extends Omit<HandState, 'hands' | 'nest' | 'rules'> {
  cardCounts: number[]
  nestCount: number
  /** The face-up Kitty card during bidding. */
  kittyTop: CardId | null
}

export interface MatchDoc {
  id: string
  /** The scorekeeper game this table plays; finished hands are written to it. */
  gameId: string
  handedness: Handedness
  hostUid: string
  status: MatchStatus
  /** Index = seat, clockwise, same order as the game's seatOrder. */
  seats: MatchSeat[]
  /** 0 before the first deal. */
  handNumber: number
  /** Scorekeeper hand number of this table's first hand (the game may already have hands). */
  firstHandNumber: number
  dealerSeat: number
  dealSeed: string | null
  pub: PublicHand | null
  /** When the current decision started; the clocks run from this. */
  turnStartedAt: number
  lastMove: { seat: number; type: string } | null
  /** Highest hand number already written to the scorekeeper. */
  scoredHandNumber: number
  winner: TeamId | null
  createdAt: number
  updatedAt: number
}

export type NewMatch = Omit<MatchDoc, 'id' | 'createdAt' | 'updatedAt'>

export const SEAT_CARDS_DOC = 'cards'

/** Table chat: what people say, quick reactions, voice notes, and the hand's events. */
export type ChatKind = 'text' | 'reaction' | 'voice' | 'event'

export interface ChatMessage {
  id: string
  /** Sender's uid (the host's for bot and event lines). */
  uid: string
  /** Seat the line belongs to, or null for a table-wide event. */
  seat: number | null
  kind: ChatKind
  text: string
  /** Voice note: base64 audio and its MIME type. */
  audio?: string
  mimeType?: string
  durationMs?: number
  createdAt: number
}

export type NewChatMessage = Omit<ChatMessage, 'id' | 'createdAt'>

export const QUICK_REACTIONS = ['👍', '😂', '😮', '😤', '🙏', '🐦']
