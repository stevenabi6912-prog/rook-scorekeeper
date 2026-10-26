import type { DataStore } from '../../data/store'
import { autoTeamName, interleave } from '../../lib/seating'
import type { Handedness, Player, TeamId } from '../../lib/types'
import type { MatchStore } from './store'

/*
 * Starting an online table straight from the lobby: the game and the table
 * are created together, with bots in any seats nobody is taking.
 */

export const BOT_NAMES = ['Hank', 'Rosie', 'June', 'Walt', 'Pearl']
const BOT_EMOJIS = ['🤠', '🦊', '🦉', '🐻', '🐧']
const BOT_COLORS = ['#d9480f', '#2f9e44', '#9c36b5', '#0ca678', '#e03131']

/** A seat in the start-a-table setup: a family member or a bot. */
export type Participant = { kind: 'player'; playerId: string } | { kind: 'bot'; index: number }

/** Bot players live in the players collection (hidden), so games can refer to them like anyone else. */
export async function ensureBotPlayers(dataStore: DataStore, players: Player[], count: number): Promise<string[]> {
  const existing = players.filter((p) => p.bot && !p.archived).sort((a, b) => a.createdAt - b.createdAt)
  const ids = existing.map((p) => p.id)
  for (let i = ids.length; i < count; i++) {
    const name = `${BOT_NAMES[i % BOT_NAMES.length]} 🤖`
    ids.push(await dataStore.addPlayer({ name, emoji: BOT_EMOJIS[i % BOT_EMOJIS.length], color: BOT_COLORS[i % BOT_COLORS.length], bot: true }))
  }
  return ids.slice(0, count)
}

export interface StartTableInput {
  handedness: Handedness
  /** Team A then team B, each with handedness/2 entries. */
  teams: Record<TeamId, Participant[]>
  /** The phone starting the table (the host) and who it is. */
  hostPlayerId: string
}

export async function startTable(
  dataStore: DataStore,
  matchStore: MatchStore,
  players: Player[],
  input: StartTableInput,
): Promise<{ gameId: string; matchId: string }> {
  const botCount = [...input.teams.A, ...input.teams.B].filter((p) => p.kind === 'bot').length
  const botIds = await ensureBotPlayers(dataStore, players, botCount)
  let bot = 0
  const resolve = (p: Participant) => (p.kind === 'player' ? p.playerId : botIds[bot++])
  const teamIds: Record<TeamId, string[]> = { A: input.teams.A.map(resolve), B: input.teams.B.map(resolve) }
  const byId = new Map(players.map((p) => [p.id, p]))
  const nameOf = (id: string) => byId.get(id)?.name.replace(' 🤖', '') ?? BOT_NAMES[0]
  const teams = {
    A: { name: autoTeamName(teamIds.A.map(nameOf)), playerIds: teamIds.A },
    B: { name: autoTeamName(teamIds.B.map(nameOf)), playerIds: teamIds.B },
  }
  const seatOrder = interleave(teams)
  // The host deals first so the player to their left opens the bidding.
  const firstDealerId = seatOrder.includes(input.hostPlayerId) ? input.hostPlayerId : seatOrder[0]
  const gameId = await dataStore.createGame({ handedness: input.handedness, teams, seatOrder, firstDealerId, mode: 'online' })
  const botSet = new Set(botIds)
  const matchId = await matchStore.createMatch({
    gameId,
    handedness: input.handedness,
    hostUid: matchStore.uid,
    status: 'seating',
    seats: seatOrder.map((playerId) => ({
      playerId,
      team: teams.A.playerIds.includes(playerId) ? 'A' : 'B',
      uid: playerId === input.hostPlayerId ? matchStore.uid : null,
      bot: botSet.has(playerId),
    })),
    handNumber: 0,
    firstHandNumber: 1,
    dealerSeat: Math.max(0, seatOrder.indexOf(firstDealerId)),
    dealSeed: null,
    pub: null,
    turnStartedAt: Date.now(),
    lastMove: null,
    scoredHandNumber: 0,
    winner: null,
  })
  return { gameId, matchId }
}
