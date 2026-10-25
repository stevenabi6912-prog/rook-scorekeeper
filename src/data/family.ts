const KEY = 'rook.familyCode'
const DEMO_KEY = 'rook.demoMode'

/** Normalizes a typed passcode into a safe Firestore document id. */
export function normalizeFamilyCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/[/#?]/g, '')
}

export function validateFamilyCode(code: string): string | null {
  if (code.length < 4) return 'Passcode must be at least 4 characters.'
  if (code.length > 64) return 'Passcode is too long.'
  if (code === '.' || code === '..') return 'That passcode is not allowed.'
  return null
}

export function loadFamilyCode(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function saveFamilyCode(code: string | null) {
  try {
    if (code) localStorage.setItem(KEY, code)
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode */
  }
}

export function loadDemoMode(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}

export function saveDemoMode(on: boolean) {
  try {
    if (on) localStorage.setItem(DEMO_KEY, '1')
    else localStorage.removeItem(DEMO_KEY)
  } catch {
    /* ignore */
  }
}
