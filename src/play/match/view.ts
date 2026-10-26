import { UNKNOWN, exposedNestCard, type HandState } from '../../game/engine'
import { FAMILY_RULES } from '../../game/rules'
import type { CardId } from '../../game/cards'
import type { PublicHand } from './types'

/** The part of a hand everyone may see. */
export function toPublic(state: HandState): PublicHand {
  // Strip the private fields explicitly, so nothing leaks by accident.
  const { hands, nest, rules: _rules, ...rest } = state
  void _rules
  return {
    ...rest,
    cardCounts: hands.map((h) => h.length),
    nestCount: nest.length,
    kittyTop: exposedNestCard(state),
  }
}

/**
 * One seat's view: the public hand plus that seat's cards. Everyone else's
 * cards (and the Kitty, unless given) are UNKNOWN placeholders of the right
 * count, which is all the engine needs to validate this seat's moves.
 */
export function toState(pub: PublicHand, me: number, myCards: CardId[], nest?: CardId[]): HandState {
  const { cardCounts, nestCount, kittyTop, ...rest } = pub
  // After a claim the other seats' private documents still hold their last
  // cards; the public counts are the truth once a hand is over.
  const mine = pub.phase === 'over' && cardCounts[me] === 0 ? [] : [...myCards]
  const hands = cardCounts.map((n, i) => (i === me ? mine : Array.from({ length: n }, () => UNKNOWN)))
  const nestCards = nest ?? Array.from({ length: nestCount }, (_, i) => (i === 0 && kittyTop ? kittyTop : UNKNOWN))
  return { ...rest, claimedCards: rest.claimedCards ?? [], rules: FAMILY_RULES, hands, nest: nestCards }
}
