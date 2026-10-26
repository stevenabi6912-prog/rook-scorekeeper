import { useEffect } from 'react'

/*
 * Keeps the phone's screen on while it is at a table, so a player whose
 * phone locks does not miss their turns. Uses the Screen Wake Lock API
 * (Safari 16.4+, Chrome, Android). The lock is released by the browser when
 * the page is hidden, so it is asked for again whenever the page comes back.
 */

type Sentinel = { release: () => Promise<void> }
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } }

export function useWakeLock(active = true) {
  useEffect(() => {
    const wakeLock = (navigator as WakeLockNavigator).wakeLock
    if (!active || !wakeLock) return
    let sentinel: Sentinel | null = null
    let stopped = false
    const acquire = () => {
      if (stopped || document.visibilityState !== 'visible') return
      wakeLock
        .request('screen')
        .then((s) => {
          if (stopped) return s.release()
          sentinel = s
        })
        .catch(() => undefined) // low battery mode or a denied request: nothing to do
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', acquire)
      sentinel?.release().catch(() => undefined)
      sentinel = null
    }
  }, [active])
}
