import { applyAction, startHand, type Action, type HandState } from '../../game/engine'
import { randomSeed } from '../../game/rng'
import { FAMILY_RULES } from '../../game/rules'
import type { MatchStore } from './store'
import type { MatchDoc, MatchSeat } from './types'
import { toPublic, toState } from './view'

/**
 * Commit one seat's move as a transaction: read the public hand and that
 * seat's cards (and the Kitty when the bidder is picking it up), decide,
 * validate with the engine, and write the new public hand plus the seat's
 * cards together. `decide` may return null to do nothing.
 */
export async function commitMove(
  store: MatchStore,
  matchId: string,
  seat: number,
  decide: (state: HandState) => Action | null,
): Promise<Action | null> {
  return store.transact(matchId, async (tx) => {
    const match = await tx.getMatch()
    if (match.status !== 'playing' || !match.pub) throw new Error('The hand is not in play.')
    const pub = match.pub
    const cards = await tx.getSeat(seat)
    const pickingUp = pub.phase === 'nest' && pub.bidderSeat === seat && pub.nestPickedUp === 0
    const nest = pickingUp ? await tx.getNest() : undefined
    const state = toState(pub, seat, cards, nest)
    const action = decide(state)
    if (!action) return null
    const r = applyAction(state, action)
    if (!r.ok) throw new Error(r.error)
    tx.setMatch({ pub: toPublic(r.state), turnStartedAt: Date.now(), lastMove: { seat, type: action.type } })
    tx.setSeat(seat, r.state.hands[seat])
    if (action.type === 'pickup') tx.setNest([])
    if (action.type === 'discard') tx.setNest(r.state.nest)
    return action
  })
}

/**
 * Deal the next hand (host only): shuffle from a fresh seed, write every
 * seat's cards and the Kitty, and open the bidding. The seed is published so
 * the deal can be checked against the cards once the hand is over.
 */
export async function dealNextHand(store: MatchStore, matchId: string): Promise<void> {
  await store.transact(matchId, async (tx) => {
    const match = await tx.getMatch()
    if (match.status === 'finished' || match.status === 'abandoned') throw new Error('This table is closed.')
    if (match.pub && match.pub.phase !== 'over') throw new Error('A hand is still being played.')
    const dealerSeat = match.handNumber === 0 ? match.dealerSeat : (match.dealerSeat + 1) % match.handedness
    const seed = randomSeed()
    const state = startHand({
      rules: FAMILY_RULES,
      handedness: match.handedness,
      teams: match.seats.map((s) => s.team),
      dealerSeat,
      seed,
    })
    state.hands.forEach((cards, seat) => tx.setSeat(seat, cards))
    tx.setNest(state.nest)
    tx.setMatch({
      status: 'playing',
      handNumber: match.handNumber + 1,
      dealerSeat,
      dealSeed: seed,
      pub: toPublic(state),
      turnStartedAt: Date.now(),
      lastMove: null,
    })
  })
}

/** Claim an empty seat for this phone. */
/**
 * Take a seat. When a person takes over a bot's seat and they are not already
 * seated at this table under their own name, the seat becomes theirs by name
 * too, so the table and the scorekeeper stop crediting the bot. Returns the
 * bot's player id when that happened, so the game's teams can be updated.
 */
export async function claimSeat(store: MatchStore, matchId: string, seat: number, asPlayerId?: string): Promise<string | null> {
  return store.transact(matchId, async (tx) => {
    const match = await tx.getMatch()
    const s = match.seats[seat]
    if (!s) throw new Error('No such seat.')
    if (s.uid && s.uid !== store.uid) throw new Error('Someone already has that seat.')
    const alreadyHere = !!asPlayerId && match.seats.some((x, i) => i !== seat && x.playerId === asPlayerId)
    const rename = !!asPlayerId && s.bot && s.playerId !== asPlayerId && !alreadyHere
    tx.setMatch({ seats: updateSeat(match.seats, seat, { uid: store.uid, bot: false, ...(rename ? { playerId: asPlayerId } : {}) }) })
    return rename ? s.playerId : null
  })
}

/** Give a seat back (its holder, or the host). */
export async function releaseSeat(store: MatchStore, matchId: string, seat: number): Promise<void> {
  await store.transact(matchId, async (tx) => {
    const match = await tx.getMatch()
    const s = match.seats[seat]
    if (!s) throw new Error('No such seat.')
    if (s.uid !== store.uid && match.hostUid !== store.uid) throw new Error('Only the host can free that seat.')
    tx.setMatch({ seats: updateSeat(match.seats, seat, { uid: null, bot: false }) })
  })
}

/**
 * Host: put a bot in a seat, or in every empty seat. During a game this also
 * takes a seat away from a person who has gone missing; they can take it
 * back from the seating screen when they return.
 */
export async function seatBots(store: MatchStore, matchId: string, seat?: number): Promise<void> {
  await store.transact(matchId, async (tx) => {
    const match = await tx.getMatch()
    if (match.hostUid !== store.uid) throw new Error('Only the host seats bots.')
    if (seat !== undefined && match.seats[seat]?.uid === store.uid) throw new Error('The host cannot hand their own seat to a bot.')
    const seats = match.seats.map((s, i) => ((seat === undefined ? s.uid === null && !s.bot : i === seat) ? { ...s, uid: null, bot: true } : s))
    tx.setMatch({ seats })
  })
}

export async function setMatchStatus(store: MatchStore, matchId: string, status: MatchDoc['status']): Promise<void> {
  await store.transact(matchId, async (tx) => {
    const match = await tx.getMatch()
    if (match.hostUid !== store.uid) throw new Error('Only the host can do that.')
    tx.setMatch({ status })
  })
}

/** A table with no action for this long is closed by whichever phone notices. */
export const IDLE_TABLE_MS = 5 * 60_000

/** Close an idle table (any phone may; the rules check the idle time too). */
export async function abandonIdle(store: MatchStore, matchId: string): Promise<void> {
  await store.transact(matchId, async (tx) => {
    const match = await tx.getMatch()
    if (match.status !== 'seating' && match.status !== 'playing') return
    if (Date.now() < match.updatedAt + IDLE_TABLE_MS) throw new Error('That table is still active.')
    tx.setMatch({ status: 'abandoned' })
  })
}

/**
 * One table per phone: give up any seat this phone holds at other open
 * tables. Mid-game the seat goes to a bot so that table keeps moving.
 */
export async function leaveOtherTables(store: MatchStore, matches: MatchDoc[], keepMatchId: string): Promise<void> {
  for (const m of matches) {
    if (m.id === keepMatchId || (m.status !== 'seating' && m.status !== 'playing')) continue
    if (!m.seats.some((s) => s.uid === store.uid)) continue
    await store.transact(m.id, async (tx) => {
      const match = await tx.getMatch()
      const seats = match.seats.map((s) => (s.uid === store.uid ? { ...s, uid: null, bot: match.status === 'playing' } : s))
      tx.setMatch({ seats })
    })
  }
}

function updateSeat(seats: MatchSeat[], seat: number, patch: Partial<MatchSeat>): MatchSeat[] {
  return seats.map((s, i) => (i === seat ? { ...s, ...patch } : s))
}

export function seatsFilled(match: MatchDoc): boolean {
  return match.seats.every((s) => s.uid !== null || s.bot)
}

/** Seats this phone holds (several in demo mode, where one phone can take the whole table). */
export function mySeats(match: MatchDoc, uid: string): number[] {
  return match.seats.flatMap((s, i) => (s.uid === uid ? [i] : []))
}

/**
 * Take over as host when the current host's phone has gone quiet. Any seated
 * phone may do this; the transaction makes sure only one does. The caller
 * decides "gone quiet" from presence (no heartbeat for a while).
 */
export async function claimHost(store: MatchStore, matchId: string, fromUid: string): Promise<boolean> {
  return store.transact(matchId, async (tx) => {
    const match = await tx.getMatch()
    if (match.hostUid !== fromUid) return false // someone else already took over
    if (!match.seats.some((s) => s.uid === store.uid)) throw new Error('Only a seated player can host.')
    tx.setMatch({ hostUid: store.uid })
    return true
  })
}
