import type { Game, Hand, Handedness, TeamId } from './types'

export interface SeatValidation {
  ok: boolean
  errors: string[]
}

/** Which team a player sits on, or null if they are not in the game. */
export function teamOf(teams: Game['teams'], playerId: string): TeamId | null {
  if (teams.A.playerIds.includes(playerId)) return 'A'
  if (teams.B.playerIds.includes(playerId)) return 'B'
  return null
}

export function validateSeating(
  handedness: Handedness,
  teams: Game['teams'],
  seatOrder: string[],
): SeatValidation {
  const errors: string[] = []
  const perTeam = handedness / 2
  if (teams.A.playerIds.length !== perTeam) errors.push(`Team A needs ${perTeam} players.`)
  if (teams.B.playerIds.length !== perTeam) errors.push(`Team B needs ${perTeam} players.`)
  if (seatOrder.length !== handedness) errors.push(`Seat ${handedness} players.`)
  if (new Set(seatOrder).size !== seatOrder.length) errors.push('A player is seated twice.')
  const all = new Set([...teams.A.playerIds, ...teams.B.playerIds])
  if (all.size !== handedness) errors.push('Each player can only be on one team.')
  for (const id of seatOrder) {
    if (!all.has(id)) errors.push('Seated player is not on a team.')
  }
  if (errors.length === 0) {
    for (let i = 0; i < seatOrder.length; i++) {
      const here = teamOf(teams, seatOrder[i])
      const next = teamOf(teams, seatOrder[(i + 1) % seatOrder.length])
      if (here === next) {
        errors.push('Seats must alternate teams (A, B, A, B…).')
        break
      }
    }
  }
  return { ok: errors.length === 0, errors }
}

/** Default seating: interleave the two teams. */
export function interleave(teams: Game['teams']): string[] {
  const out: string[] = []
  const n = Math.max(teams.A.playerIds.length, teams.B.playerIds.length)
  for (let i = 0; i < n; i++) {
    if (teams.A.playerIds[i]) out.push(teams.A.playerIds[i])
    if (teams.B.playerIds[i]) out.push(teams.B.playerIds[i])
  }
  return out
}

/** Seat after `playerId` in clockwise order. */
export function nextSeat(seatOrder: string[], playerId: string): string {
  const i = seatOrder.indexOf(playerId)
  if (i === -1) return seatOrder[0]
  return seatOrder[(i + 1) % seatOrder.length]
}

/**
 * Who should deal the next hand. Rotation follows the seat order starting from
 * the game's first dealer, and respects any manual override stored on the
 * most recent hand (the next dealer is always the seat after the last dealer).
 */
export function nextDealerId(game: Pick<Game, 'seatOrder' | 'firstDealerId' | 'subs'>, orderedHands: Hand[]): string {
  if (orderedHands.length === 0) return currentSeatOf(game, game.firstDealerId)
  const last = orderedHands[orderedHands.length - 1]
  return nextSeat(game.seatOrder, currentSeatOf(game, last.dealerId))
}

/** The id now sitting in the seat that `playerId` had, following any swaps. */
export function currentSeatOf(game: Pick<Game, 'subs'>, playerId: string): string {
  let id = playerId
  for (let i = 0; i < 20 && game.subs?.[id]; i++) id = game.subs[id]
  return id
}

/** Put `newId` in `oldId`'s seat: seat order, team membership, an automatic team name, and the swap record. */
export function swapPlayer(game: Pick<Game, 'seatOrder' | 'teams' | 'subs'>, oldId: string, newId: string, nameOf: (id: string) => string): Pick<Game, 'seatOrder' | 'teams' | 'subs'> {
  const swap = (ids: string[]) => ids.map((id) => (id === oldId ? newId : id))
  const team = (t: Game['teams']['A']) => {
    const wasAuto = t.name === autoTeamName(t.playerIds.map(nameOf))
    const playerIds = swap(t.playerIds)
    return { ...t, playerIds, name: wasAuto ? autoTeamName(playerIds.map(nameOf)) : t.name }
  }
  return {
    seatOrder: swap(game.seatOrder),
    teams: { A: team(game.teams.A), B: team(game.teams.B) },
    subs: { ...(game.subs ?? {}), [oldId]: newId },
  }
}

/** Automatic team name from player names, e.g. "Steven & Abi". */
export function autoTeamName(names: string[]): string {
  const firsts = names.map((n) => n.trim().split(/\s+/)[0]).filter(Boolean)
  if (firsts.length <= 1) return firsts[0] ?? 'Team'
  return `${firsts.slice(0, -1).join(', ')} & ${firsts[firsts.length - 1]}`
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length || from === to) return arr
  const copy = [...arr]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}
