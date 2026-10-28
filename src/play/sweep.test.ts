import { describe, expect, it } from 'vitest'
import { IDLE_TABLE_MS } from './match/moves'
import type { MatchDoc } from './match/types'
import type { Game } from '../lib/types'
import { KEEP_ALIVE_AFTER_MS, isIdle, needsTouch, orphanedOnlineGame } from './sweep'

const table = (status: MatchDoc['status'], age: number): MatchDoc => ({ status, updatedAt: 1_000_000 - age } as MatchDoc)
const NOW = 1_000_000

describe('idle tables', () => {
  it('count as idle only after five minutes without a write', () => {
    expect(isIdle(table('seating', IDLE_TABLE_MS - 1), NOW)).toBe(false)
    expect(isIdle(table('seating', IDLE_TABLE_MS + 1), NOW)).toBe(true)
    expect(isIdle(table('playing', IDLE_TABLE_MS + 1), NOW)).toBe(true)
    expect(isIdle(table('finished', IDLE_TABLE_MS + 1), NOW)).toBe(false)
    expect(isIdle(table('abandoned', IDLE_TABLE_MS + 1), NOW)).toBe(false)
  })

  it('are touched by the phones at them well before that', () => {
    expect(KEEP_ALIVE_AFTER_MS).toBeLessThan(IDLE_TABLE_MS)
    expect(needsTouch(table('seating', KEEP_ALIVE_AFTER_MS - 1), NOW)).toBe(false)
    expect(needsTouch(table('seating', KEEP_ALIVE_AFTER_MS), NOW)).toBe(true)
    expect(needsTouch(table('playing', IDLE_TABLE_MS + 1), NOW)).toBe(true) // a phone that was asleep revives it
    expect(needsTouch(table('finished', IDLE_TABLE_MS + 1), NOW)).toBe(false)
  })
})

describe('online games without a table', () => {
  const game = (age: number, extra: Partial<Game> = {}): Game => ({ id: 'g', mode: 'online', status: 'active', createdAt: NOW - age, ...extra } as Game)

  it('are left alone until the game is old enough for its table to have arrived', () => {
    expect(orphanedOnlineGame(game(1_000), undefined, NOW)).toBe(false)
    expect(orphanedOnlineGame(game(IDLE_TABLE_MS + 1), undefined, NOW)).toBe(true)
  })

  it('are finished once the table is closed or idle, never when it is live', () => {
    const old = game(IDLE_TABLE_MS + 1)
    expect(orphanedOnlineGame(old, table('seating', 10), NOW)).toBe(false)
    expect(orphanedOnlineGame(old, table('playing', IDLE_TABLE_MS + 1), NOW)).toBe(true)
    expect(orphanedOnlineGame(old, table('abandoned', 10), NOW)).toBe(true)
    expect(orphanedOnlineGame(old, table('finished', 10), NOW)).toBe(true)
  })

  it('never touch in-person or finished games', () => {
    expect(orphanedOnlineGame(game(IDLE_TABLE_MS + 1, { mode: 'inPerson' }), undefined, NOW)).toBe(false)
    expect(orphanedOnlineGame(game(IDLE_TABLE_MS + 1, { status: 'finished' }), undefined, NOW)).toBe(false)
  })
})
