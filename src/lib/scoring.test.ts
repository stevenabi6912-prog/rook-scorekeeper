import { describe, expect, it } from 'vitest'
import {
  currentTotals,
  nextMultipleAbove,
  nextMultipleBelow,
  replayHands,
  scoreHand,
  teamsAtTarget,
} from './scoring'
import type { Hand } from './types'

const at = (A: number, B: number) => ({ A, B })

describe('normal bids', () => {
  it('bid 80 / took 85 -> bidders +85, other +35', () => {
    const r = scoreHand(at(0, 0), { bidTeam: 'A', bid: 80, pointsTaken: 85 })
    expect(r.made).toBe(true)
    expect(r.delta).toEqual(at(85, 35))
    expect(r.totals).toEqual(at(85, 35))
  })

  it('bid 80 / took 75 -> bidders -80, other +45', () => {
    const r = scoreHand(at(0, 0), { bidTeam: 'A', bid: 80, pointsTaken: 75 })
    expect(r.made).toBe(false)
    expect(r.delta).toEqual(at(-80, 45))
    expect(r.totals).toEqual(at(-80, 45))
  })

  it('works when team B bids', () => {
    const r = scoreHand(at(100, 200), { bidTeam: 'B', bid: 100, pointsTaken: 105 })
    expect(r.totals).toEqual(at(115, 305))
  })

  it('P = B exactly counts as made', () => {
    const r = scoreHand(at(0, 0), { bidTeam: 'A', bid: 95, pointsTaken: 95 })
    expect(r.made).toBe(true)
    expect(r.totals).toEqual(at(95, 25))
  })

  it('P = 0 -> bidders set, other team +120', () => {
    const r = scoreHand(at(50, 50), { bidTeam: 'A', bid: 70, pointsTaken: 0 })
    expect(r.made).toBe(false)
    expect(r.totals).toEqual(at(-20, 170))
  })

  it('P = 120 -> bidders +120, other team +0', () => {
    const r = scoreHand(at(0, 0), { bidTeam: 'B', bid: 120, pointsTaken: 120 })
    expect(r.made).toBe(true)
    expect(r.totals).toEqual(at(0, 120))
  })

  it('scores can go negative and keep going', () => {
    const r1 = scoreHand(at(-80, 45), { bidTeam: 'A', bid: 90, pointsTaken: 40 })
    expect(r1.totals).toEqual(at(-170, 125))
  })
})

describe('moon multiples', () => {
  it('next multiple above', () => {
    expect(nextMultipleAbove(10)).toBe(500)
    expect(nextMultipleAbove(0)).toBe(500)
    expect(nextMultipleAbove(-50)).toBe(0)
    expect(nextMultipleAbove(250)).toBe(500)
    expect(nextMultipleAbove(500)).toBe(1000)
    expect(nextMultipleAbove(-500)).toBe(0)
    expect(nextMultipleAbove(499)).toBe(500)
  })
  it('next multiple below', () => {
    expect(nextMultipleBelow(10)).toBe(0)
    expect(nextMultipleBelow(0)).toBe(-500)
    expect(nextMultipleBelow(-50)).toBe(-500)
    expect(nextMultipleBelow(250)).toBe(0)
    expect(nextMultipleBelow(500)).toBe(0)
    expect(nextMultipleBelow(-500)).toBe(-1000)
    expect(nextMultipleBelow(501)).toBe(500)
  })
})

describe('shooting the moon', () => {
  const made = (A: number, B = 0) =>
    scoreHand(at(A, B), { bidTeam: 'A', bid: 'moon', pointsTaken: 120, moonMade: true })
  const missed = (A: number, P: number, B = 0) =>
    scoreHand(at(A, B), { bidTeam: 'A', bid: 'moon', pointsTaken: P, moonMade: false })

  it('at +10: made -> 500, missed -> 0', () => {
    expect(made(10).totals.A).toBe(500)
    expect(missed(10, 60).totals.A).toBe(0)
  })
  it('at -50: made -> 0, missed -> -500', () => {
    expect(made(-50).totals.A).toBe(0)
    expect(missed(-50, 60).totals.A).toBe(-500)
  })
  it('at 0: made -> 500, missed -> -500', () => {
    expect(made(0).totals.A).toBe(500)
    expect(missed(0, 60).totals.A).toBe(-500)
  })
  it('at 250: made -> 500, missed -> 0', () => {
    expect(made(250).totals.A).toBe(500)
    expect(missed(250, 60).totals.A).toBe(0)
  })
  it('at exact multiples of 500', () => {
    expect(made(500).totals.A).toBe(1000)
    expect(missed(500, 60).totals.A).toBe(0)
    expect(made(-500).totals.A).toBe(0)
    expect(missed(-500, 60).totals.A).toBe(-1000)
  })
  it('made moon: other team +0 and setTo is reported', () => {
    const r = made(10, 300)
    expect(r.made).toBe(true)
    expect(r.setTo).toBe(500)
    expect(r.totals).toEqual(at(500, 300))
    expect(r.delta.B).toBe(0)
  })
  it('missed moon where shooters took 95 -> other team +25', () => {
    const r = missed(10, 95, 100)
    expect(r.made).toBe(false)
    expect(r.setTo).toBe(0)
    expect(r.totals).toEqual(at(0, 125))
    expect(r.delta.B).toBe(25)
  })
  it('missed moon where shooters took 0 -> other team +120', () => {
    const r = missed(10, 0, 100)
    expect(r.totals).toEqual(at(0, 220))
    expect(r.delta.B).toBe(120)
  })
  it('made moon ignores pointsTaken and treats it as 120', () => {
    const r = scoreHand(at(10, 10), { bidTeam: 'B', bid: 'moon', pointsTaken: 0, moonMade: true })
    expect(r.totals).toEqual(at(10, 500))
  })
})

function hand(n: number, partial: Partial<Hand>): Hand {
  return {
    id: `h${n}`,
    handNumber: n,
    dealerId: 'd',
    bidderId: 'p',
    bidTeam: 'A',
    bid: 80,
    pointsTaken: 80,
    createdAt: n,
    ...partial,
  }
}

describe('replayHands', () => {
  it('replays in handNumber order regardless of array order', () => {
    const hands: Hand[] = [
      hand(2, { bidTeam: 'B', bid: 'moon', pointsTaken: 120, moonMade: true }),
      hand(1, { bidTeam: 'A', bid: 80, pointsTaken: 85 }),
      hand(3, { bidTeam: 'A', bid: 100, pointsTaken: 90 }),
    ]
    const r = replayHands(hands)
    expect(r.map((x) => x.hand.handNumber)).toEqual([1, 2, 3])
    expect(r[0].outcome.totals).toEqual(at(85, 35))
    expect(r[1].outcome.totals).toEqual(at(85, 500)) // moon sets B to 500
    expect(r[2].outcome.totals).toEqual(at(-15, 530))
    expect(currentTotals(hands)).toEqual(at(-15, 530))
  })

  it('editing an earlier hand changes everything after it', () => {
    const base: Hand[] = [
      hand(1, { bidTeam: 'A', bid: 80, pointsTaken: 85 }), // A 85, B 35
      hand(2, { bidTeam: 'A', bid: 'moon', pointsTaken: 120, moonMade: true }), // A -> 500
    ]
    expect(currentTotals(base)).toEqual(at(500, 35))
    // Hand 1 edited to a failed bid: A -80, B 45. Moon from -80 -> 0, not 500.
    const edited = [hand(1, { bidTeam: 'A', bid: 80, pointsTaken: 75 }), base[1]]
    expect(currentTotals(edited)).toEqual(at(0, 45))
  })

  it('deleting a hand recomputes the rest', () => {
    const hands: Hand[] = [
      hand(1, { bidTeam: 'A', bid: 80, pointsTaken: 85 }),
      hand(2, { bidTeam: 'A', bid: 80, pointsTaken: 85 }),
      hand(3, { bidTeam: 'A', bid: 'moon', pointsTaken: 120, moonMade: true }),
    ]
    expect(currentTotals(hands)).toEqual(at(500, 70))
    expect(currentTotals(hands.filter((h) => h.handNumber !== 2))).toEqual(at(500, 35))
  })

  it('empty game is 0-0', () => {
    expect(currentTotals([])).toEqual(at(0, 0))
    expect(replayHands([])).toEqual([])
  })
})

describe('teamsAtTarget', () => {
  it('reports teams at or over 500', () => {
    expect(teamsAtTarget(at(499, 0))).toEqual([])
    expect(teamsAtTarget(at(500, 0))).toEqual(['A'])
    expect(teamsAtTarget(at(510, 505))).toEqual(['A', 'B'])
  })
})
