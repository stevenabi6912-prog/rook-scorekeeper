import { useEffect } from 'react'

/*
 * Keeps the phone's screen on while it is at a table, so a player whose
 * phone locks does not miss their turns. Two layers:
 *  - the Screen Wake Lock API (Safari 16.4+, Chrome, Android), asked for on
 *    load, on the first tap (Safari is happier inside a gesture) and whenever
 *    the page comes back after being hidden;
 *  - a tiny silent looping video, started on the first tap, which is what
 *    keeps an iPhone awake when the API is missing or refuses (NoSleep-style).
 */

type Sentinel = { release: () => Promise<void> }
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } }

const VIDEO_URL = `${import.meta.env.BASE_URL}awake.mp4`

export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return
    const wakeLock = (navigator as WakeLockNavigator).wakeLock
    let sentinel: Sentinel | null = null
    let video: HTMLVideoElement | null = null
    let stopped = false

    const acquire = () => {
      if (stopped || !wakeLock || document.visibilityState !== 'visible') return
      wakeLock
        .request('screen')
        .then((s) => {
          if (stopped) return s.release()
          sentinel = s
        })
        .catch(() => undefined) // low power mode or a refusal: the video below still helps
    }
    const startVideo = () => {
      if (stopped) return
      if (!video) {
        video = document.createElement('video')
        video.muted = true
        video.loop = true
        video.playsInline = true
        video.setAttribute('playsinline', '')
        video.setAttribute('aria-hidden', 'true')
        video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0'
        video.src = VIDEO_URL
        document.body.appendChild(video)
      }
      video.play().catch(() => undefined)
    }
    const onGesture = () => {
      acquire()
      startVideo()
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      acquire()
      if (video) video.play().catch(() => undefined)
    }

    acquire()
    document.addEventListener('pointerdown', onGesture, { passive: true })
    document.addEventListener('touchend', onGesture, { passive: true })
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      document.removeEventListener('pointerdown', onGesture)
      document.removeEventListener('touchend', onGesture)
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release().catch(() => undefined)
      sentinel = null
      if (video) {
        video.pause()
        video.remove()
        video = null
      }
    }
  }, [active])
}
