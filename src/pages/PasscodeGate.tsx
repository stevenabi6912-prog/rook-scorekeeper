import { useState, type FormEvent, type ReactNode } from 'react'
import { normalizeFamilyCode, validateFamilyCode } from '../data/family'
import { useStoreContext } from '../data/StoreContext'

/**
 * Wraps the whole app. Shows the passcode form until a family is joined and
 * Firebase (or the local demo store) is ready.
 */
export function PasscodeGate({ children }: { children: ReactNode }) {
  const { familyCode, state, error, store, firebaseConfigured, demoMode, join, leave } = useStoreContext()
  const [input, setInput] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  if (familyCode && store && state === 'ready') return <>{children}</>

  if (familyCode && state === 'connecting') {
    return (
      <div className="gate">
        <div className="logo"><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="72" height="72" style={{ borderRadius: 16 }} /></div>
        <h1>Rook</h1>
        <div className="spinner" />
        <p className="sub">Connecting…</p>
        <button className="btn ghost block" onClick={leave}>Use a different passcode</button>
      </div>
    )
  }

  if (familyCode && state === 'error') {
    return (
      <div className="gate">
        <div className="logo"><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="72" height="72" style={{ borderRadius: 16 }} /></div>
        <h1>Rook</h1>
        <div className="error">{error}</div>
        <button className="btn primary block" onClick={() => join(familyCode)}>Try again</button>
        <button className="btn ghost block" onClick={leave}>Use a different passcode</button>
      </div>
    )
  }

  const submit = (e: FormEvent, demo = false) => {
    e.preventDefault()
    const code = normalizeFamilyCode(input)
    const err = validateFamilyCode(code)
    if (err) {
      setFormError(err)
      return
    }
    setFormError(null)
    join(code, { demo })
  }

  return (
    <div className="gate">
      <div className="logo"><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="72" height="72" style={{ borderRadius: 16 }} /></div>
      <h1>Rook Scorekeeper</h1>
      <p className="sub">Enter your family passcode. Everyone who uses the same passcode sees the same games.</p>
      {!firebaseConfigured && (
        <div className="notice small">
          <strong>Firebase is not configured yet.</strong> Paste your Firebase web config into{' '}
          <code>src/firebase/config.ts</code> to turn on live syncing between phones. Until then the app runs in{' '}
          <strong>demo mode</strong> and keeps data only in this browser.
        </div>
      )}
      <form onSubmit={submit} className="stack">
        <input
          className="input"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          inputMode="text"
          placeholder="family passcode"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Family passcode"
        />
        {formError && <div className="error">{formError}</div>}
        <button className="btn primary big block" type="submit">
          {firebaseConfigured ? 'Join' : 'Start demo'}
        </button>
        {firebaseConfigured && !demoMode && (
          <button className="btn ghost block small" type="button" onClick={(e) => submit(e, true)}>
            Try demo mode on this device only
          </button>
        )}
      </form>
      <p className="muted small center" style={{ marginTop: 24 }}>
        Not case sensitive. Spaces become dashes. Pick something only your family knows.
      </p>
    </div>
  )
}
