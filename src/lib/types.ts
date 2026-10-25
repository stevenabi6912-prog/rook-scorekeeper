export type TeamId = 'A' | 'B'

export type Handedness = 4 | 6

export interface Player {
  id: string
  name: string
  emoji?: string
  color?: string
  archived: boolean
  createdAt: number
}

export interface Team {
  name: string
  playerIds: string[]
}

export type GameStatus = 'active' | 'finished'

export interface Game {
  id: string
  handedness: Handedness
  teams: Record<TeamId, Team>
  /** Player ids in clockwise seat order; must alternate teams. */
  seatOrder: string[]
  firstDealerId: string
  status: GameStatus
  winner?: TeamId | null
  /** Trump for the hand being played right now, set from the live screen so
   *  every phone shows it. Cleared when that hand is saved. */
  currentTrump?: Trump | null
  createdAt: number
  finishedAt?: number
}

export type Bid = number | 'moon'

/** Rook suits are colors. */
export type Trump = 'red' | 'yellow' | 'green' | 'black'

export const TRUMPS: { id: Trump; label: string; color: string }[] = [
  { id: 'red', label: 'Red', color: '#d32f2f' },
  { id: 'yellow', label: 'Yellow', color: '#f0b429' },
  { id: 'green', label: 'Green', color: '#2e7d32' },
  { id: 'black', label: 'Black', color: '#3a3f47' },
]

export function trumpInfo(t: Trump | null | undefined) {
  return TRUMPS.find((x) => x.id === t)
}

export interface Hand {
  id: string
  handNumber: number
  dealerId: string
  bidderId: string
  bidTeam: TeamId
  bid: Bid
  /** Points the bidding team took (0-120). For a made moon this is always 120. */
  pointsTaken: number
  /** Only present when bid === 'moon'. */
  moonMade?: boolean
  rookHolderId?: string | null
  /** Trump suit named by the bidder. */
  trump?: Trump | null
  createdAt: number
}

/** The fields a user enters for a hand; ids and timestamps are added on save. */
export type HandInput = Omit<Hand, 'id' | 'createdAt' | 'handNumber'>

export const RULES = {
  TOTAL_POINTS: 120,
  TARGET_SCORE: 500,
  MIN_BID: 65,
  MAX_BID: 120,
  BID_STEP: 5,
  POINT_STEP: 5,
} as const

export const otherTeam = (t: TeamId): TeamId => (t === 'A' ? 'B' : 'A')
