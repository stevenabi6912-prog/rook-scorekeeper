import { normalizeFamilyCode, validateFamilyCode } from '../data/family'

/*
 * Invite links. An invite is the app's own address with the family passcode
 * in a `join` query parameter, before the hash: tapping it opens the app,
 * joins that family and lands in the Play lobby, where the newcomer picks or
 * adds their name. The parameter is consumed once and dropped from the
 * address bar so a later refresh or "switch passcode" does not re-join.
 */

const PARAM = 'join'

/** Where the app lives on this host, with its trailing slash. */
export function appUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}

export function buildInviteUrl(app: string, code: string): string {
  return `${app}?${PARAM}=${encodeURIComponent(code)}#/play`
}

/** The valid, normalized passcode an address carries, or null. */
export function inviteCodeIn(href: string): string | null {
  let raw: string | null
  try {
    raw = new URL(href).searchParams.get(PARAM)
  } catch {
    return null
  }
  if (!raw) return null
  const code = normalizeFamilyCode(raw)
  return validateFamilyCode(code) ? null : code
}

/** The same address without the invite parameter; the hash route is kept. */
export function withoutInvite(href: string): string {
  const url = new URL(href)
  url.searchParams.delete(PARAM)
  return url.toString()
}

/** Reads the invite from the address bar and clears it there. */
export function consumeInvite(): string | null {
  const code = inviteCodeIn(window.location.href)
  if (code !== null) {
    try {
      window.history.replaceState(window.history.state, '', withoutInvite(window.location.href))
    } catch {
      /* ignore */
    }
  }
  return code
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

/** Opens the phone's share sheet, or copies the link where there is none. */
export async function shareInvite(code: string): Promise<ShareOutcome> {
  const url = buildInviteUrl(appUrl(), code)
  const data: ShareData = { title: 'Rook', text: 'Come play Rook with us. Tap the link, then pick your name.', url }
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare(data))) {
    try {
      await nav.share(data)
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
