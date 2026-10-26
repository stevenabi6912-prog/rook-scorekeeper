import { useEffect, useMemo, useState } from 'react'
import { useMatchStore } from '../data/StoreContext'
import { PRESENCE_EVERY_MS, PRESENCE_STALE_MS, type Presence } from './match/types'

/** Heartbeat: tells the family this phone is here (and at which table) every 10 seconds. */
export function useHeartbeat(playerId: string | null, tableId: string | null) {
  const store = useMatchStore()
  useEffect(() => {
    if (!playerId) return
    let stopped = false
    const beat = () => {
      if (!stopped && document.visibilityState !== 'hidden') store.setPresence(playerId, tableId).catch(() => undefined)
    }
    beat()
    const timer = setInterval(beat, PRESENCE_EVERY_MS)
    document.addEventListener('visibilitychange', beat)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [store, playerId, tableId])
}

/** Everyone whose phone has checked in recently, by player id. */
export function useWhoIsHere(): { here: Map<string, Presence>; all: Presence[] } {
  const store = useMatchStore()
  const [all, setAll] = useState<Presence[]>([])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => store.subscribePresence(setAll, () => undefined), [store])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), PRESENCE_EVERY_MS)
    return () => clearInterval(t)
  }, [])
  const here = useMemo(() => {
    const m = new Map<string, Presence>()
    for (const p of all) {
      if (now - p.lastSeen > PRESENCE_STALE_MS) continue
      const prev = m.get(p.playerId)
      if (!prev || prev.lastSeen < p.lastSeen) m.set(p.playerId, p)
    }
    return m
  }, [all, now])
  return { here, all }
}
