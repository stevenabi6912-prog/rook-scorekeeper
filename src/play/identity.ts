/** Which family member this phone is, remembered per family passcode. */
const KEY = (familyCode: string) => `rook.identity.${familyCode}`

export function loadIdentity(familyCode: string): string | null {
  try {
    return localStorage.getItem(KEY(familyCode))
  } catch {
    return null
  }
}

export function saveIdentity(familyCode: string, playerId: string | null) {
  try {
    if (playerId) localStorage.setItem(KEY(familyCode), playerId)
    else localStorage.removeItem(KEY(familyCode))
  } catch {
    /* ignore */
  }
}
