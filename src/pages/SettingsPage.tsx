import { useState } from 'react'
import { Dialog } from '../components/Dialog'
import { TopBar } from '../components/Layout'
import { useStoreContext } from '../data/StoreContext'

export function SettingsPage() {
  const { familyCode, demoMode, firebaseConfigured, leave } = useStoreContext()
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <TopBar title="Settings" back="/" />
      <main className="page">
        <div className="card">
          <h3>Family</h3>
          <p>Passcode: <strong>{familyCode}</strong></p>
          <p className="muted small">
            {demoMode
              ? firebaseConfigured
                ? 'Demo mode: data is stored only in this browser.'
                : 'Firebase is not configured, so data is stored only in this browser.'
              : 'Live: synced through Firebase to every phone using this passcode.'}
          </p>
          <button className="btn block" onClick={() => setConfirm(true)}>Switch family passcode</button>
        </div>
        <div className="card">
          <h3>Rules (fixed)</h3>
          <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
            <li>120 points per hand, play to 500.</li>
            <li>Bids 65–120 in steps of 5, or Moon.</li>
            <li>Made bid: bidders +points, others +rest. Set: bidders −bid, others +rest.</li>
            <li>Moon made: bidders jump to the next 500 above. Moon missed: bidders drop to the next 500 below, others +what was left.</li>
          </ul>
        </div>
        <p className="muted small center">Rook Scorekeeper · built with Vite, React and Firebase</p>
      </main>
      <Dialog
        open={confirm}
        title="Switch passcode?"
        confirmLabel="Switch"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false)
          leave()
        }}
      >
        <p className="muted">You will be asked for a passcode again. {demoMode ? 'Demo data stays in this browser under the old passcode.' : 'Nothing is deleted.'}</p>
      </Dialog>
    </>
  )
}
