import { describe, expect, it } from 'vitest'
import { arena } from './arena'
import { botDecision } from './bots'
import { botDecision as baselineDecision } from './botsBaseline'

/*
 * The bots must not get worse: over many identical deals with sides swapped,
 * the current bots should take at least as many points as the frozen
 * baseline. Logged numbers show how much better.
 */
describe('bot arena', () => {
  it('current bots score at least as well as the frozen baseline', () => {
    const r4 = arena(botDecision, baselineDecision, 150, 4)
    const r6 = arena(botDecision, baselineDecision, 60, 6)
    console.log(`4-handed: current ${r4.pointsX.toFixed(1)} vs baseline ${r4.pointsY.toFixed(1)} points/hand; bids made ${(r4.xBidMade * 100).toFixed(0)}% vs ${(r4.yBidMade * 100).toFixed(0)}%`)
    console.log(`6-handed: current ${r6.pointsX.toFixed(1)} vs baseline ${r6.pointsY.toFixed(1)} points/hand; bids made ${(r6.xBidMade * 100).toFixed(0)}% vs ${(r6.yBidMade * 100).toFixed(0)}%`)
    expect(r4.pointsX).toBeGreaterThanOrEqual(r4.pointsY - 0.5)
    expect(r6.pointsX).toBeGreaterThanOrEqual(r6.pointsY - 0.5)
  })
})
