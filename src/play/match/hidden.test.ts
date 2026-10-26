import { describe, expect, it } from 'vitest'
import { botDecision } from '../../game/bots'
import { applyAction, startHand, type HandState } from '../../game/engine'
import { seededRng } from '../../game/rng'
import { FAMILY_RULES } from '../../game/rules'
import { summarizeHand } from '../../game/score'
import type { TeamId } from '../../lib/types'
import { toPublic, toState } from './view'

/*
 * The online table never gives a phone more than its own cards and the
 * public state. These tests replay whole games and, at every single move,
 * check that applying the move from the mover's hidden view yields exactly
 * the public state the full-information engine produces, and that the
 * hidden view's private cards match too. Any divergence here would show up
 * online as a wrong score, a refused legal move, or a stuck table.
 */

function hiddenViewOf(full: HandState, seat: number, withNest: boolean): HandState {
  const pub = toPublic(full)
  return toState(pub, seat, full.hands[seat], withNest ? full.nest : undefined)
}

/**
 * After a throw-in the engine records the rest of the hand as tricks for the
 * claimer. With every card known those tricks carry each card's points; from
 * a hidden view the unseen points all land on the last one. Totals, winners
 * and counts must still agree, so compare those instead of the card lists.
 */
function comparable(state: HandState, _mover: number) {
  const pub = toPublic(state)
  if (state.claimedBySeat === null) return pub
  const { tricks, ...rest } = pub
  return {
    ...rest,
    trickCount: tricks.length,
    trickPoints: tricks.reduce((n, t) => n + t.points, 0),
    winners: tricks.map((t) => t.winnerSeat),
    nestTaken: tricks.filter((t) => t.tookNest).length,
  }
}

describe('hidden view vs full engine', () => {
  it('agree on every move of many random games, 4- and 6-handed', () => {
    const rng = seededRng('hidden-vs-full')
    let moves = 0
    let claims = 0
    for (let g = 0; g < 60; g++) {
      const handedness = g % 3 === 0 ? 6 : 4
      const teams: TeamId[] = handedness === 6 ? ['A', 'B', 'A', 'B', 'A', 'B'] : ['A', 'B', 'A', 'B']
      let full = startHand({ rules: FAMILY_RULES, handedness, teams, dealerSeat: g % handedness, seed: `game-${g}` })
      let guard = 0
      while (full.phase !== 'over') {
        const seat = full.turnSeat
        // Decide from the hidden view, as the real table does.
        const pickingUp = full.phase === 'nest' && full.nestPickedUp === 0
        const hidden = hiddenViewOf(full, seat, pickingUp)
        const action = botDecision(hidden, seat, rng)
        if (!action) throw new Error(`no decision in ${full.phase} for seat ${seat}`)
        const fromHidden = applyAction(hidden, action)
        const fromFull = applyAction(full, action)
        if (!fromFull.ok) throw new Error(`full engine refused ${action.type}: ${fromFull.error}`)
        if (!fromHidden.ok) throw new Error(`hidden view refused ${action.type} that the full engine accepted: ${fromHidden.error}`)
        // Public states must be identical. The one allowed difference: the
        // tricks a throw-in records contain other seats' cards only when known.
        expect(comparable(fromHidden.state, seat)).toEqual(comparable(fromFull.state, seat))
        // The mover's own cards must match.
        expect(fromHidden.state.hands[seat]).toEqual(fromFull.state.hands[seat])
        // The Kitty after a lay-down must match.
        if (action.type === 'discard') expect(fromHidden.state.nest).toEqual(fromFull.state.nest)
        if (action.type === 'claim') claims++
        full = fromFull.state
        moves++
        if (++guard > 400) throw new Error('game did not end')
      }
      const r = summarizeHand(full)
      expect(r.pointsByTeam.A + r.pointsByTeam.B).toBe(120)
    }
    expect(moves).toBeGreaterThan(1000)
    expect(claims).toBeGreaterThan(0)
  })

  it('a hidden view never lets a seat move out of turn or pick up a Kitty it cannot see', () => {
    const full = startHand({ rules: FAMILY_RULES, handedness: 4, teams: ['A', 'B', 'A', 'B'], dealerSeat: 3, seed: 'oot' })
    const other = (full.turnSeat + 1) % 4
    const view = hiddenViewOf(full, other, false)
    expect(applyAction(view, { type: 'bid', seat: other, bid: 65 }).ok).toBe(false)
    // Win the bid from the hidden view, then try to pick up without the Kitty.
    let s = full
    for (const seat of [0, 1, 2, 3]) s = (() => { const r = applyAction(s, { type: 'bid', seat, bid: seat === 0 ? 70 : 'pass' }); if (!r.ok) throw new Error(r.error); return r.state })()
    expect(s.phase).toBe('nest')
    const blind = hiddenViewOf(s, 0, false)
    expect(applyAction(blind, { type: 'pickup', seat: 0 })).toMatchObject({ ok: false, error: /not available/ })
    const sighted = hiddenViewOf(s, 0, true)
    expect(applyAction(sighted, { type: 'pickup', seat: 0 }).ok).toBe(true)
  })
})
