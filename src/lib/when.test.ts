import { describe, expect, it } from 'vitest'
import { relativeWhen, toLocalInputValue } from './when'

describe('plan times', () => {
  const now = Date.UTC(2026, 9, 26, 20, 0, 0)
  it('says how far away a plan is', () => {
    expect(relativeWhen(now + 25 * 60000, now)).toBe('in 25 min')
    expect(relativeWhen(now + 130 * 60000, now)).toBe('in 2 h 10 min')
    expect(relativeWhen(now + 3 * 24 * 3600000, now)).toBe('in 3 days')
    expect(relativeWhen(now - 20 * 60000, now)).toBe('20 min ago')
    expect(relativeWhen(now + 10000, now)).toBe('now')
  })
  it('round-trips through a datetime-local input in local time', () => {
    const v = toLocalInputValue(now)
    expect(new Date(v).getTime()).toBe(now)
  })
})
