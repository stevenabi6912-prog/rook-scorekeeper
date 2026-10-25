import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isFirebaseConfigured } from '../firebase/config'
import { loadDemoMode, loadFamilyCode, saveDemoMode, saveFamilyCode } from './family'
import { createLocalStore } from './localStore'
import type { DataStore } from './store'

export type ConnectionState = 'idle' | 'connecting' | 'ready' | 'error'

interface StoreContextValue {
  familyCode: string | null
  demoMode: boolean
  firebaseConfigured: boolean
  state: ConnectionState
  error: string | null
  store: DataStore | null
  /** Join a family (passcode already normalized). */
  join: (code: string, opts?: { demo?: boolean }) => void
  leave: () => void
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured()
  const [familyCode, setFamilyCode] = useState<string | null>(() => loadFamilyCode())
  const [demoMode, setDemoMode] = useState<boolean>(() => loadDemoMode() || !configured)
  const [state, setState] = useState<ConnectionState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [store, setStore] = useState<DataStore | null>(null)

  useEffect(() => {
    let cancelled = false
    setStore(null)
    setError(null)
    if (!familyCode) {
      setState('idle')
      return
    }
    if (demoMode || !configured) {
      setStore(createLocalStore(familyCode))
      setState('ready')
      return
    }
    setState('connecting')
    // Firebase is loaded on demand so the demo build stays small and a phone
    // only downloads the SDK once the family has a real backend.
    Promise.all([import('../firebase/app'), import('./firestoreStore')])
      .then(async ([fb, fs]) => {
        await fb.ensureAnonymousUser()
        if (cancelled) return
        setStore(fs.createFirestoreStore(fb.getFirebase().db, familyCode))
        setState('ready')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(describeFirebaseError(e))
        setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [familyCode, demoMode, configured])

  const join = useCallback((code: string, opts?: { demo?: boolean }) => {
    const demo = opts?.demo ?? false
    saveFamilyCode(code)
    saveDemoMode(demo)
    setDemoMode(demo || !configured)
    setFamilyCode(code)
  }, [configured])

  const leave = useCallback(() => {
    saveFamilyCode(null)
    saveDemoMode(false)
    setFamilyCode(null)
    setDemoMode(!configured)
  }, [configured])

  const value = useMemo<StoreContextValue>(
    () => ({ familyCode, demoMode: demoMode || !configured, firebaseConfigured: configured, state, error, store, join, leave }),
    [familyCode, demoMode, configured, state, error, store, join, leave],
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStoreContext(): StoreContextValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStoreContext must be used inside StoreProvider')
  return ctx
}

/** The connected store. Only call from screens rendered behind the passcode gate. */
export function useStore(): DataStore {
  const { store } = useStoreContext()
  if (!store) throw new Error('Store not ready')
  return store
}

function describeFirebaseError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  if (code.includes('operation-not-allowed')) {
    return 'Anonymous sign-in is not enabled. In the Firebase console open Authentication → Sign-in method and enable "Anonymous".'
  }
  if (code.includes('api-key-not-valid') || code.includes('invalid-api-key')) {
    return 'The Firebase API key in src/firebase/config.ts is not valid. Re-copy the config from the Firebase console.'
  }
  if (code.includes('network-request-failed')) return 'Could not reach Firebase. Check your connection.'
  return (e as Error)?.message ?? 'Could not connect to Firebase.'
}
