import { describe, expect, it } from 'vitest'
import { computePlayerStats, summarizeGame } from './stats'
import type { Game, Hand, Player } from './types'

const players: Player[] = ['a1', 'a2', 'b1', 'b2'].map((id) => ({ id, name: id, archived: false, createdAt: 0 }))
const game: Game = {
  id: 'g1', handedness: 4, status: 'finished', winner: 'A', createdAt: 0, firstDealerId: 'a1',
  seatOrder: ['a1', 'b1', 'a2', 'b2'],
  teams: { A: { name: 'A', playerIds: ['a1', 'a2'] }, B: { name: 'B', playerIds: ['b1', 'b2'] } },
}
const h = (n: number, p: Partial<Hand>): Hand => ({
  id: String(n), handNumber: n, dealerId: 'a1', bidderId: 'a1', bidTeam: 'A', bid: 80, pointsTaken: 80, createdAt: n, ...p,
})
const hands: Hand[] = [
  h(1, { bidderId: 'a1', bid: 80, pointsTaken: 85, rookHolderId: 'a1' }),
  h(2, { bidderId: 'a1', bid: 100, pointsTaken: 90, rookHolderId: 'b2' }),
  h(3, { bidderId: 'b1', bidTeam: 'B', bid: 'moon', pointsTaken: 120, moonMade: true, rookHolderId: 'b1' }),
  h(4, { bidderId: 'b1', bidTeam: 'B', bid: 'moon', pointsTaken: 40, moonMade: false }),
  h(5, { bidderId: 'a2', bid: 120, pointsTaken: 120 }),
]

describe('computePlayerStats', () => {
  const stats = Object.fromEntries(computePlayerStats(players, [game], { g1: hands }).map((s) => [s.playerId, s]))
  it('counts wins per player on the winning team', () => {
    expect(stats.a1.wins).toBe(1)
    expect(stats.a2.wins).toBe(1)
    expect(stats.b1.wins).toBe(0)
    expect(stats.b1.gamesPlayed).toBe(1)
  })
  it('bid success and average exclude moons', () => {
    expect(stats.a1.bids).toBe(2)
    expect(stats.a1.bidsMade).toBe(1)
    expect(stats.a1.averageBid).toBe(90)
    expect(stats.b1.bids).toBe(0)
    expect(stats.b1.averageBid).toBeNull()
    expect(stats.a2.averageBid).toBe(120)
  })
  it('counts moons attempted and made', () => {
    expect(stats.b1.moonsAttempted).toBe(2)
    expect(stats.b1.moonsMade).toBe(1)
  })
  it('counts rook holds', () => {
    expect(stats.a1.rookHeld).toBe(1)
    expect(stats.b1.rookHeld).toBe(1)
    expect(stats.b2.rookHeld).toBe(1)
    expect(stats.a2.rookHeld).toBe(0)
  })
})

describe('summarizeGame', () => {
  it('replays to final totals', () => {
    const s = summarizeGame(game, hands)
    // 1: A85 B35 | 2: A-15 B65 | 3: B->500 | 4: B->0, A +80 => A65 | 5: A185 B0
    expect(s.totals).toEqual({ A: 185, B: 0 })
    expect(s.handCount).toBe(5)
  })
})
