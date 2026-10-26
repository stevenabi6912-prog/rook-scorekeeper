import { describe, expect, it } from 'vitest'
import { buildInviteUrl, inviteCodeIn, withoutInvite } from './invite'

const APP = 'https://example.github.io/rook-scorekeeper/'

describe('invite links', () => {
  it('puts the passcode before the hash and lands in the lobby', () => {
    expect(buildInviteUrl(APP, 'smith-family')).toBe(`${APP}?join=smith-family#/play`)
  })

  it('round-trips through its own link', () => {
    expect(inviteCodeIn(buildInviteUrl(APP, 'smith-family'))).toBe('smith-family')
  })

  it('normalizes what people type into the link by hand', () => {
    expect(inviteCodeIn(`${APP}?join=Smith%20Family`)).toBe('smith-family')
  })

  it('ignores addresses without an invite or with a bad one', () => {
    expect(inviteCodeIn(APP)).toBeNull()
    expect(inviteCodeIn(`${APP}#/play`)).toBeNull()
    expect(inviteCodeIn(`${APP}?join=ab`)).toBeNull()
    expect(inviteCodeIn('not a url')).toBeNull()
  })

  it('strips only the invite and keeps the route', () => {
    expect(withoutInvite(`${APP}?join=smith-family#/play`)).toBe(`${APP}#/play`)
    expect(withoutInvite(`${APP}?other=1&join=smith-family#/play`)).toBe(`${APP}?other=1#/play`)
    expect(withoutInvite(`${APP}#/stats`)).toBe(`${APP}#/stats`)
  })
})
