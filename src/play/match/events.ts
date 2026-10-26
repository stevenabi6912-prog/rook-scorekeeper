import type { Action, HandState } from '../../game/engine'
import type { HandResult } from '../../game/score'
import type { TeamId } from '../../lib/types'

/*
 * One-line descriptions of what just happened, for the chat's event log.
 * Card plays are left out (the table shows those); bids, trump, the Kitty,
 * throw-ins and hand results are in.
 */

export function describeAction(state: HandState, action: Action, names: string[]): string | null {
  const who = names[action.seat] ?? 'Someone'
  switch (action.type) {
    case 'bid':
      if (action.bid === 'pass') return `${who} passed`
      if (action.bid === 'moon') return `${who} shot the Moon 🌙`
      return `${who} bid ${action.bid}`
    case 'overshoot':
      return action.accept ? `${who} overshot the Moon 🌙` : null
    case 'pickup':
      return null
    case 'discard':
      return `${who} laid down the Kitty`
    case 'trump':
      return `${who} named ${action.trump} trump`
    case 'claim':
      return `${who} threw the cards in`
    case 'play':
      return state.trick.plays.length === 0 && state.tricks.length === 0 ? `${who} led the first trick` : null
  }
}

export function describeResult(result: HandResult, handNumber: number, teamNames: Record<TeamId, string>): string {
  const team = teamNames[result.bidTeam]
  const bid = result.bid === 'moon' ? 'the Moon' : String(result.bid)
  if (result.bid === 'moon') return `Hand ${handNumber}: ${team} ${result.moonMade ? 'made' : 'missed'} ${bid}`
  return `Hand ${handNumber}: ${team} ${result.made ? 'made' : 'were set on'} ${bid} with ${result.pointsByTeam[result.bidTeam]} points`
}
