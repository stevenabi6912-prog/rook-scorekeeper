import { ROOK, cardPoints, effectiveSuit, strength, suitOf, type CardId } from './cards'
import {
  canClaimRest,
  isUnknown,
  legalBids,
  legalPlays,
  trickWinner,
  unseenCards,
  type Action,
  type BidAction,
  type HandState,
  type Trick,
} from './engine'
import type { Rng } from './rng'
import { SUITS, type Rules, type Suit } from './rules'

/*
 * Computer players. They see only what a person in their seat would: their
 * own cards, every card played so far, and (for the bidder) the Kitty. From
 * that they keep track of what is still out, which colors each player has
 * shown they are out of, and whether a card is a sure winner ("boss").
 *
 * Also used, with a conservative setting, when a person's clock runs out.
 */

/* ------------------------------------------------------------- knowledge */

interface Knowledge {
  trump: Suit | null
  /** Cards this seat has not seen: could be in any other hand (or the Kitty). */
  unseen: CardId[]
  /** voids[seat] = colors that seat has shown they hold none of. */
  voids: Record<number, Set<Suit>>
  /** Unseen trumps (the Rook counts). */
  trumpsOut: number
  /** Unseen trumps an opponent could still hold: 0 once every opponent has shown void in trump. */
  oppTrumps: number
  partners: number[]
  opponents: number[]
  bidding: boolean
}

function know(state: HandState, seat: number): Knowledge {
  const trump = state.trump
  const unseen = unseenCards(state, seat)
  const voids: Record<number, Set<Suit>> = {}
  for (let s = 0; s < state.handedness; s++) voids[s] = new Set()
  if (trump) {
    const tricks: Trick[] = [...state.tricks, state.trick]
    for (const t of tricks) {
      if (t.plays.length === 0) continue
      const led = effectiveSuit(t.plays[0].card, trump)
      for (const p of t.plays) if (effectiveSuit(p.card, trump) !== led) voids[p.seat].add(led)
    }
  }
  const myTeam = state.teams[seat]
  const partners: number[] = []
  const opponents: number[] = []
  for (let s = 0; s < state.handedness; s++) {
    if (s === seat) continue
    ;(state.teams[s] === myTeam ? partners : opponents).push(s)
  }
  const trumpsOut = trump ? unseen.filter((c) => effectiveSuit(c, trump) === trump).length : 0
  return {
    trump,
    unseen,
    voids,
    trumpsOut,
    oppTrumps: trump && opponents.some((o) => !voids[o].has(trump)) ? trumpsOut : 0,
    partners,
    opponents,
    bidding: state.bidderSeat !== null && state.teams[state.bidderSeat] === myTeam,
  }
}

/** No unseen card of the same (effective) color outranks it. */
function isBoss(card: CardId, k: Knowledge, rules: Rules): boolean {
  if (!k.trump) return false
  const suit = effectiveSuit(card, k.trump)
  const mine = strength(card, rules)
  return !k.unseen.some((c) => effectiveSuit(c, k.trump!) === suit && strength(c, rules) > mine)
}

function bySuit(hand: CardId[]): Record<Suit, CardId[]> {
  const out: Record<Suit, CardId[]> = { red: [], yellow: [], green: [], black: [] }
  for (const c of hand) {
    const s = suitOf(c)
    if (s) out[s].push(c)
  }
  return out
}

const pts = (c: CardId, rules: Rules) => cardPoints(c, rules)
const str = (c: CardId, rules: Rules) => strength(c, rules)

/** Fewest points, then lowest rank: what you throw away. */
function cheapest(cards: CardId[], rules: Rules): CardId {
  return [...cards].sort((a, b) => pts(a, rules) - pts(b, rules) || str(a, rules) - str(b, rules))[0]
}
/** Lowest rank regardless of points: the smallest card that still does the job. */
function lowest(cards: CardId[], rules: Rules): CardId {
  return [...cards].sort((a, b) => str(a, rules) - str(b, rules))[0]
}
function highest(cards: CardId[], rules: Rules): CardId {
  return [...cards].sort((a, b) => str(b, rules) - str(a, rules))[0]
}
/** Most points, then lowest rank: what you give your partner. */
function juiciest(cards: CardId[], rules: Rules): CardId {
  return [...cards].sort((a, b) => pts(b, rules) - pts(a, rules) || str(a, rules) - str(b, rules))[0]
}

/* --------------------------------------------------------------- bidding */

/** The color this hand would name as trump: most cards, then the strongest. */
export function botTrump(state: HandState, seat: number): Suit {
  const groups = bySuit(state.hands[seat])
  let best: Suit = 'red'
  let bestScore = -1
  for (const s of SUITS) {
    const cards = groups[s]
    const score =
      cards.length * 10 + cards.reduce((n, c) => n + strength(c, state.rules), 0) / 14 + cards.reduce((n, c) => n + pts(c, state.rules), 0) / 10
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  return best
}

/**
 * How many tricks this hand should win with its best trump, counted the way
 * a careful player would: trumps that are top of the pile (the Rook, then 14,
 * 13, 12 in an unbroken run from the top), length tricks once trumps are
 * drawn, and off-color 14s (and a 13 behind a 14).
 */
export function botTricks(state: HandState, seat: number, trumpSuit: Suit = botTrump(state, seat)): number {
  const { rules } = state
  const hand = state.hands[seat]
  const groups = bySuit(hand)
  const trumps = groups[trumpSuit]
  const hasRook = hand.includes(ROOK)
  // Top trumps: Rook, then 14, 13, 12... as long as the run from the top is unbroken.
  let top = hasRook ? 1 : 0
  let unbroken = hasRook
  for (const rank of [14, 13, 12, 11]) {
    const held = trumps.some((c) => str(c, rules) === rank)
    if (held && (unbroken || rank === 14)) {
      top++
      unbroken = true
    } else if (!held) unbroken = false
  }
  const trumpCount = trumps.length + (hasRook ? 1 : 0)
  // After three rounds of trumps the rest of a long trump suit wins on its own.
  const length = Math.max(0, trumpCount - 3 - Math.max(0, 3 - top) * 0.5)
  let off = 0
  for (const s of SUITS) {
    if (s === trumpSuit) continue
    const cards = groups[s]
    const has14 = cards.some((c) => str(c, rules) === 14)
    if (has14) off += 1
    if (has14 && cards.some((c) => str(c, rules) === 13)) off += 0.5
  }
  return Math.min(state.handSize, top + length + off)
}

/**
 * The highest bid the bot is comfortable with, as a multiple of 5: points per
 * trick the bot expects to win itself (scaled by hand size, since a 6-card
 * hand plays six tricks worth 20 points each), plus what the Kitty, a second
 * partner, and a bidding partner are worth. The constants come from self-play
 * in the arena: at these values no dealer is left stuck at 65, the average
 * bid is about 80 and bids are made four times in five. The old 12 a trick
 * left six-handed bots passing nine hands in ten.
 */
/** How much stronger than a partner's call a hand must rate itself before bidding over them. */
const PARTNER_RAISE_MARGIN = 15
const BID_PER_TRICK = 18
const BID_EXTRA_PARTNER = 20

export function botMaxBid(state: HandState, seat: number): number {
  const { rules } = state
  const tricks = botTricks(state, seat)
  const players = state.hands.length
  const perTrick = BID_PER_TRICK * (9 / Math.max(1, state.handSize))
  const extraPartners = Math.max(0, players / 2 - 2)
  let est = 10 + tricks * perTrick + extraPartners * BID_EXTRA_PARTNER
  // Picking up five Kitty cards is usually worth a trick, more if the face-up card helps.
  est += 10
  const top = state.nest[0]
  const trumpSuit = botTrump(state, seat)
  if (top && !isUnknown(top) && (suitOf(top) === trumpSuit || top === ROOK)) est += 5
  const partnerBid = state.bidding.calls.some((c) => c.seat !== seat && state.teams[c.seat] === state.teams[seat] && c.bid !== 'pass')
  if (partnerBid) est += 5
  const trumpCount = bySuit(state.hands[seat])[trumpSuit].length + (state.hands[seat].includes(ROOK) ? 1 : 0)
  let max = Math.floor(est / 5) * 5
  if (trumpCount < 6) max = Math.min(max, 90)
  if (trumpCount < 7) max = Math.min(max, 100)
  return Math.max(0, Math.min(rules.maxBid, max))
}

export function botBid(state: HandState, seat: number, rng: Rng): BidAction {
  const options = legalBids(state, seat)
  if (options.length === 0) throw new Error('bot has no legal bid')
  const numbers = options.filter((o): o is number => typeof o === 'number')
  const hand = state.hands[seat]
  const trumpSuit = botTrump(state, seat)
  const groups = bySuit(hand)
  const trumps = [...groups[trumpSuit], ...(hand.includes(ROOK) ? [ROOK] : [])]
  // A hand that can run the table shoots for the Moon.
  if (options.includes('moon') && hand.includes(ROOK) && trumps.length >= 8 && botTricks(state, seat) >= state.handSize - 0.5) {
    return 'moon'
  }
  const max = botMaxBid(state, seat)
  const lowestBid = numbers[0]
  if (lowestBid === undefined) return options.includes('pass') ? 'pass' : options[0]
  if (lowestBid > max) return options.includes('pass') ? 'pass' : lowestBid
  // Partner has the bid: leave it with them unless this hand is clearly stronger than their call.
  const high = state.bidding.highBid
  const highSeat = state.bidding.highSeat
  const partnerHigh = highSeat !== null && highSeat !== seat && state.teams[highSeat] === state.teams[seat]
  if (partnerHigh && options.includes('pass') && (high === 'moon' || max < (high as number) + PARTNER_RAISE_MARGIN)) return 'pass'
  // Usually the minimum; now and then a small jump to shake people off.
  const jump = rng() < 0.2 ? 5 : 0
  const choice = Math.min(lowestBid + jump, max)
  return numbers.includes(choice) ? choice : lowestBid
}

/* --------------------------------------------------------------- Kitty */

/**
 * Which cards to lay back into the Kitty: never trump or the Rook, keep the
 * 14s, and empty out short colors so the hand can ruff. The Kitty goes to
 * whoever takes the last trick, which is usually the bidder's long trumps,
 * so 5s and 10s are tucked away in it rather than held: in the arena that
 * was worth five points a hand four-handed (the old rule kept them).
 */
export function botDiscard(state: HandState, seat: number): CardId[] {
  const { rules } = state
  const hand = state.hands[seat]
  const keepSuit = botTrump(state, seat)
  const groups = bySuit(hand)
  const priority = (c: CardId): number => {
    if (c === ROOK) return -1000
    const suit = suitOf(c)!
    if (suit === keepSuit) return -500 + str(c, rules) // trump last; lowest trump first if forced
    const len = groups[suit].length
    let p = 50 - str(c, rules) * 2 + pts(c, rules)
    if (str(c, rules) === 14) p -= 20
    if (len <= 2) p += 15
    else if (len === 3) p += 5
    return p
  }
  let picks = [...hand].sort((a, b) => priority(b) - priority(a)).slice(0, state.nestPickedUp)
  if (!rules.discardPointsAllowed) {
    const free = [...hand].filter((c) => pts(c, rules) === 0).sort((a, b) => priority(b) - priority(a))
    if (free.length >= state.nestPickedUp) picks = free.slice(0, state.nestPickedUp)
  }
  return picks
}

/* ----------------------------------------------------------------- play */

function winnerIfPlayed(state: HandState, seat: number, card: CardId): number {
  const trick = { ...state.trick, plays: [...state.trick.plays, { seat, card }] }
  return trickWinner(trick, state.trump!, state.rules)
}

/** Seats still to play after `seat` in this trick. */
function stillToPlay(state: HandState, seat: number): number[] {
  const out: number[] = []
  for (let i = 1; i < state.handedness; i++) {
    const s = (seat + i) % state.handedness
    if (s === state.trick.leadSeat) break
    out.push(s)
  }
  return out
}

/**
 * If `card` wins the trick as it stands, could an opponent still to play
 * take it back? They can if they might hold a higher card of that color, or
 * if they are out of the led color and trumps are still out.
 */
function opponentCouldBeat(state: HandState, k: Knowledge, seat: number, card: CardId): boolean {
  const { rules } = state
  const trump = k.trump!
  const led = effectiveSuit(state.trick.plays[0]?.card ?? card, trump)
  const suit = effectiveSuit(card, trump)
  const mine = str(card, rules)
  const higherUnseen = k.unseen.some((c) => effectiveSuit(c, trump) === suit && strength(c, rules) > mine)
  for (const s of stillToPlay(state, seat)) {
    if (!k.opponents.includes(s)) continue
    const voidInLed = k.voids[s].has(led)
    if (suit === trump) {
      if (higherUnseen && !k.voids[s].has(trump)) return true
    } else {
      if (higherUnseen && !voidInLed) return true
      if (voidInLed && k.trumpsOut > 0 && !k.voids[s].has(trump)) return true
    }
  }
  return false
}

export function botPlay(state: HandState, seat: number, rng: Rng): CardId {
  const { rules } = state
  const legal = legalPlays(state, seat)
  if (legal.length === 0) throw new Error('bot has no legal play')
  if (legal.length === 1) return legal[0]
  const k = know(state, seat)
  const trump = k.trump!
  const plays = state.trick.plays
  const isTrump = (c: CardId) => effectiveSuit(c, trump) === trump
  const ourMoon = state.bid === 'moon' && k.bidding
  const theirMoon = state.bid === 'moon' && !k.bidding
  // The last trick also carries the Kitty, so it is worth fighting for.
  const lastTrick = state.hands[seat].length === 1
  const kittyWorth = lastTrick ? (state.nest.some(isUnknown) ? 15 : state.nest.reduce((n, c) => n + pts(c, rules), 0)) : 0
  const after = stillToPlay(state, seat)
  const partnerToCome = after.some((s) => k.partners.includes(s))
  const opponentToCome = after.some((s) => k.opponents.includes(s))

  /* ---- leading */
  if (plays.length === 0) {
    const myTrumps = legal.filter(isTrump)
    const plain = legal.filter((c) => !isTrump(c))
    const topTrump = myTrumps.length ? highest(myTrumps, rules) : null
    const safeBosses = plain.filter((c) => isBoss(c, k, rules) && !k.opponents.some((o) => k.voids[o].has(suitOf(c)!) && k.oppTrumps > 0))

    if (ourMoon) {
      // Every trick is ours or the Moon is gone: boss trumps first while trumps are out, then boss plain cards.
      if (topTrump && isBoss(topTrump, k, rules) && k.oppTrumps > 0) return topTrump
      if (safeBosses.length) return juiciest(safeBosses, rules)
      if (topTrump && isBoss(topTrump, k, rules)) return topTrump
      return plain.length ? highest(plain, rules) : highest(myTrumps, rules)
    }
    // The bidding side draws trumps while it holds the boss and opponents may still have some;
    // with a long trump holding it draws from the bottom even without the boss.
    if (k.bidding && topTrump && k.oppTrumps > 0 && isBoss(topTrump, k, rules) && (myTrumps.length >= 2 || k.oppTrumps <= 2)) return topTrump
    if (k.bidding && myTrumps.length >= (state.handSize >= 9 ? 4 : 3) && k.oppTrumps >= 2) return lowest(myTrumps, rules)
    // Cash a sure winner, points first.
    if (safeBosses.length) return juiciest(safeBosses, rules)
    // Lead into a partner's void so they can ruff, when trumps are still out and no opponent is also void there.
    const ruffSuit = SUITS.find(
      (su) => su !== trump && k.oppTrumps > 0 && plain.some((c) => suitOf(c) === su) && k.partners.some((p) => k.voids[p].has(su) && !k.voids[p].has(trump)) && !k.opponents.some((o) => k.voids[o].has(su)),
    )
    if (ruffSuit) return cheapest(plain.filter((c) => suitOf(c) === ruffSuit), rules)
    // A boss trump is led to draw trumps only by the bidding side; a defender keeps it for a fat trick.
    if (topTrump && isBoss(topTrump, k, rules) && ((k.oppTrumps > 0 && k.bidding) || plain.length === 0)) return topTrump
    if (plain.length) {
      const groups = bySuit(plain)
      // Prefer colors no opponent is known to be void in (a ruff would cost us the trick).
      const candidates = SUITS.filter((su) => groups[su].length > 0 && !(k.oppTrumps > 0 && k.opponents.some((o) => k.voids[o].has(su))))
      const suits = (candidates.length ? candidates : SUITS.filter((su) => groups[su].length > 0)).sort((a, b) =>
        k.bidding ? groups[a].length - groups[b].length : groups[b].length - groups[a].length,
      )
      // Bidding: lead short colors to make voids. Defending: lead long colors low to wear the bidder down.
      const pool = groups[suits[0]]
      const free = pool.filter((c) => pts(c, rules) === 0)
      return lowest(free.length ? free : pool, rules)
    }
    return lowest(myTrumps, rules)
  }

  /* ---- following */
  const currentWinner = trickWinner(state.trick, trump, rules)
  const partnerWinning = k.partners.includes(currentWinner)
  const last = after.length === 0
  const trickPoints = plays.reduce((n, p) => n + pts(p.card, rules), 0) + kittyWorth
  const winning = legal.filter((c) => winnerIfPlayed(state, seat, c) === seat)
  const safeWinners = winning.filter((c) => last || !opponentCouldBeat(state, k, seat, c))
  const plainLegal = legal.filter((c) => !isTrump(c))
  // A top trump is a sure trick later; a defender does not spend it on a cheap trick.
  const saveBoss = (c: CardId) => isTrump(c) && isBoss(c, k, rules)
  const plainOrAll = plainLegal.length ? plainLegal : legal
  const dump = () => {
    // Throw the cheapest card, preferring to empty a short color.
    const groups = bySuit(plainLegal)
    const short = SUITS.filter((su) => groups[su].length === 1 && pts(groups[su][0], rules) === 0)
    if (short.length) return groups[short[0]][0]
    return cheapest(plainOrAll, rules)
  }

  if (partnerWinning) {
    const partnerCard = plays[plays.findIndex((p) => p.seat === currentWinner)].card
    const partnerSafe = last || !opponentToCome || (isBoss(partnerCard, k, rules) && !opponentCouldBeat(state, k, seat, partnerCard))
    // Never ruff your own partner: feed from the plain cards; trumps only if that is all you hold.
    if (partnerSafe) return plainLegal.length ? juiciest(plainLegal, rules) : cheapest(legal, rules)
    // Partner may yet be beaten by an opponent still to play: take over with a sure plain
    // winner when the trick is worth it (or the Moon is on the line), else keep it cheap.
    const plainSafe = safeWinners.filter((c) => !isTrump(c))
    if (plainSafe.length && (trickPoints >= 10 || ourMoon)) return lowest(plainSafe, rules)
    if (ourMoon && safeWinners.length) return lowest(safeWinners, rules)
    return dump()
  }

  // An opponent is winning (or led). Can I take it?
  if (winning.length) {
    // Last to play: take it with the fattest winner, but keep the Rook (a trick on its own) when anything else wins.
    if (last) {
      const notRook = winning.filter((c) => c !== ROOK)
      return juiciest(notRook.length ? notRook : winning, rules)
    }
    if (theirMoon) return lowest(winning, rules) // any trick we take ends their Moon
    if (!partnerToCome) {
      // I am my side's last chance: take it with the smallest sure winner; fight for a fat trick.
      if (safeWinners.length) {
        const w = lowest(safeWinners, rules)
        if (trickPoints === 0 && !k.bidding && !ourMoon && str(w, rules) >= 13 && !isBoss(w, k, rules)) return dump()
        if (saveBoss(w) && trickPoints < 10 && !k.bidding) return dump()
        return w
      }
      if (trickPoints >= 10 || ourMoon || (k.bidding && rng() < 0.6)) return lowest(winning, rules)
      return dump()
    }
    // Partner still to play: a sure cheap winner is still worth taking (points are
    // the game); otherwise keep high cards and let the partner, playing later, decide.
    if (safeWinners.length) {
      const w = lowest(safeWinners, rules)
      if (trickPoints === 0 && !k.bidding && !ourMoon && str(w, rules) >= 13 && !isBoss(w, k, rules)) return dump()
      if (saveBoss(w) && trickPoints < 10 && !k.bidding) return dump()
      return w
    }
    if (ourMoon) return lowest(winning, rules)
    if (trickPoints >= 10) return lowest(winning, rules)
    return dump()
  }

  return dump()
}

/* ------------------------------------------------------------- decision */

/**
 * Whatever a bot would do right now for `seat`, in any phase. Also used when a
 * person's clock runs out, with `overshootAccept: false` so the table never
 * shoots the Moon on someone's behalf.
 */
export function botDecision(state: HandState, seat: number, rng: Rng, opts: { overshootAccept?: boolean } = {}): Action | null {
  if (state.turnSeat !== seat) return null
  switch (state.phase) {
    case 'bidding':
      return { type: 'bid', seat, bid: botBid(state, seat, rng) }
    case 'overshoot':
      return { type: 'overshoot', seat, accept: opts.overshootAccept ?? rng() < 0.15 }
    case 'nest':
      return state.nestPickedUp === 0 ? { type: 'pickup', seat } : { type: 'discard', seat, cards: botDiscard(state, seat) }
    case 'trump':
      return { type: 'trump', seat, trump: botTrump(state, seat) }
    case 'playing':
      // A hand that cannot lose another trick is thrown in rather than played out.
      if (canClaimRest(state, seat)) return { type: 'claim', seat }
      return { type: 'play', seat, card: botPlay(state, seat, rng) }
    case 'over':
      return null
  }
}
