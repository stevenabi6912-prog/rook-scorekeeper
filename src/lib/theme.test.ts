import { describe, expect, it } from 'vitest'
import { isDark } from './theme'

describe('theme', () => {
  it('is dark only when chosen, or when matching a dark phone', () => {
    expect(isDark('light', true)).toBe(false)
    expect(isDark('dark', false)).toBe(true)
    expect(isDark('auto', true)).toBe(true)
    expect(isDark('auto', false)).toBe(false)
  })
})
