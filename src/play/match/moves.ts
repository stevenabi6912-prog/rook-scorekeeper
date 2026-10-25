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
export async function claimSeat(store: MatchStore, matchId: string, seat: number): Promise<void> {
  await store.transact(matchId, async (tx) => {
    const match = await tx.getMatch()
    const s = match.seats[seat]
    if (!s) throw new Error('No such seat.')
    if (s.uid && s.uid !== store.uid) throw new Error('Someone already has that seat.')
    tx.setMatch({ seats: updateSeat(match.seats, seat, { uid: store.uid, bot: false }) })
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

/** Host: put a bot in a seat (or every empty seat). */
export async function seatBots(store: MatchStore, matchId: string, seat?: number): Promise<void> {
  await store.transact(matchId, async (tx) => {
    const match = await tx.getMatch()
    if (match.hostUid !== store.uid) throw new Error('Only the host seats bots.')
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
