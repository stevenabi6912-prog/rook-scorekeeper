/*
 * Table sounds, synthesized with the Web Audio API so nothing is downloaded
 * and everything works offline. Mobile browsers only start audio after a
 * user gesture, so call unlockAudio() from the first tap on the table.
 */

const KEY = 'rook.sound.muted'

let ctx: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null
/** True once the page has had a user gesture (needed for audio and vibration). */
let unlocked = false
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
})()

export function isMuted(): boolean {
  return muted
}

export function setMuted(m: boolean) {
  muted = m
  try {
    if (m) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

let primed = false

/**
 * Call from a user gesture (tap). Creates the audio context, resumes it, and
 * on iOS plays one silent buffer inside the gesture, which is what Safari
 * needs before it will let any later sound through. Safe to call often.
 */
export function unlockAudio() {
  if (typeof window === 'undefined') return
  unlocked = true
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx = new Ctor()
    // Coming back from another app or a locked screen suspends the context.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && ctx?.state === 'suspended') void ctx.resume()
    })
  }
  if (ctx.state !== 'running') void ctx.resume()
  if (!primed) {
    try {
      const src = ctx.createBufferSource()
      src.buffer = ctx.createBuffer(1, 1, 22050)
      src.connect(ctx.destination)
      src.start(0)
      primed = true
    } catch {
      /* ignore */
    }
  }
}

/** True once a tap has unlocked audio and the context is running. */
export function audioReady(): boolean {
  return !!ctx && ctx.state === 'running'
}

function audio(): AudioContext | null {
  if (muted || !ctx) return null
  // Sounds scheduled while the engine is still waking play once it is running.
  if (ctx.state !== 'running') void ctx.resume()
  return ctx
}

/** Resume the engine and report whether the phone says it is running. */
export async function audioResume(): Promise<'running' | 'blocked' | 'none'> {
  if (!ctx) return 'none'
  try {
    await ctx.resume()
  } catch {
    /* ignore */
  }
  return ctx.state === 'running' ? 'running' : 'blocked'
}

function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

interface ToneOpts {
  freq: number
  freqEnd?: number
  type?: OscillatorType
  at?: number
  dur: number
  gain?: number
  attack?: number
}

function tone(c: AudioContext, o: ToneOpts) {
  const t0 = c.currentTime + (o.at ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.freq, t0)
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.dur)
  const peak = o.gain ?? 0.2
  const attack = o.attack ?? 0.01
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + o.dur + 0.05)
}

interface NoiseOpts {
  at?: number
  dur: number
  gain?: number
  from: number
  to: number
  q?: number
  attack?: number
}

function whoosh(c: AudioContext, o: NoiseOpts) {
  const t0 = c.currentTime + (o.at ?? 0)
  const src = c.createBufferSource()
  src.buffer = noise(c)
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = o.q ?? 1.2
  filter.frequency.setValueAtTime(o.from, t0)
  filter.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur)
  const g = c.createGain()
  const peak = o.gain ?? 0.25
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.02))
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  src.connect(filter).connect(g).connect(c.destination)
  src.start(t0)
  src.stop(t0 + o.dur + 0.05)
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

export const sounds = {
  /** A card leaving the hand and skidding onto the felt. */
  cardSlide() {
    const c = audio()
    if (!c) return
    whoosh(c, { dur: 0.16, from: 1800, to: 600, gain: 0.18, q: 0.8 })
    whoosh(c, { at: 0.13, dur: 0.04, from: 3000, to: 1500, gain: 0.22, q: 2, attack: 0.004 })
  },
  /** Cards dealt into a hand. */
  deal() {
    const c = audio()
    if (!c) return
    whoosh(c, { dur: 0.08, from: 2500, to: 900, gain: 0.12, q: 1.5, attack: 0.005 })
  },
  /** Gathering a won trick. */
  trickSweep() {
    const c = audio()
    if (!c) return
    whoosh(c, { dur: 0.42, from: 500, to: 2200, gain: 0.22, q: 0.9, attack: 0.08 })
    whoosh(c, { at: 0.36, dur: 0.05, from: 2000, to: 800, gain: 0.2, q: 2, attack: 0.004 })
  },
  /** Calling a bid: a short, bright two-note call. */
  bid() {
    const c = audio()
    if (!c) return
    tone(c, { freq: NOTE(79), type: 'triangle', dur: 0.09, gain: 0.16, attack: 0.005 })
    tone(c, { freq: NOTE(84), type: 'triangle', at: 0.08, dur: 0.16, gain: 0.16, attack: 0.005 })
  },
  /** A knock on the table: pass. */
  pass() {
    const c = audio()
    if (!c) return
    tone(c, { freq: 180, freqEnd: 70, type: 'sine', dur: 0.12, gain: 0.5, attack: 0.004 })
    whoosh(c, { dur: 0.04, from: 1200, to: 400, gain: 0.15, q: 1, attack: 0.003 })
  },
  /** Trump is named: a short brassy flourish. */
  trump() {
    const c = audio()
    if (!c) return
    const notes = [60, 64, 67]
    notes.forEach((n, i) => tone(c, { freq: NOTE(n + 12), type: 'sawtooth', at: i * 0.09, dur: 0.22, gain: 0.08 }))
    tone(c, { freq: NOTE(72), type: 'triangle', at: 0.27, dur: 0.4, gain: 0.12 })
  },
  /** Someone shot the Moon. */
  moonBid() {
    const c = audio()
    if (!c) return
    const notes = [60, 64, 67, 72, 76]
    notes.forEach((n, i) => tone(c, { freq: NOTE(n + 12), type: 'square', at: i * 0.1, dur: 0.25, gain: 0.05 }))
    tone(c, { freq: NOTE(79), type: 'triangle', at: 0.5, dur: 0.6, gain: 0.12 })
  },
  /** Moon made: the big one. */
  moonMade() {
    const c = audio()
    if (!c) return
    const chord = [60, 64, 67, 72]
    for (let i = 0; i < 3; i++) chord.forEach((n) => tone(c, { freq: NOTE(n + 12), type: 'triangle', at: i * 0.18, dur: 0.3, gain: 0.07 }))
    chord.forEach((n) => tone(c, { freq: NOTE(n + 12), type: 'sawtooth', at: 0.6, dur: 1.2, gain: 0.05 }))
    tone(c, { freq: NOTE(84), type: 'triangle', at: 0.6, dur: 1.2, gain: 0.12 })
  },
  /** Bid made. */
  made() {
    const c = audio()
    if (!c) return
    tone(c, { freq: NOTE(76), type: 'triangle', dur: 0.18, gain: 0.15 })
    tone(c, { freq: NOTE(83), type: 'triangle', at: 0.14, dur: 0.45, gain: 0.15 })
  },
  /** Bid set: a slide down. */
  set() {
    const c = audio()
    if (!c) return
    ;[67, 65, 63, 60].forEach((n, i) => tone(c, { freq: NOTE(n), freqEnd: NOTE(n) * 0.94, type: 'sawtooth', at: i * 0.22, dur: 0.24, gain: 0.07 }))
  },
  /** Your move. */
  yourTurn() {
    const c = audio()
    if (c) {
      tone(c, { freq: NOTE(88), type: 'sine', dur: 0.16, gain: 0.18 })
      tone(c, { freq: NOTE(92), type: 'sine', at: 0.13, dur: 0.35, gain: 0.18 })
    }
    const active = unlocked || (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive
    if (!active) return
    try {
      navigator.vibrate?.(35)
    } catch {
      /* ignore */
    }
  },
  /** Chat message pop. */
  message() {
    const c = audio()
    if (!c) return
    tone(c, { freq: 900, freqEnd: 1400, type: 'sine', dur: 0.09, gain: 0.15, attack: 0.005 })
  },
}

export type SoundName = keyof typeof sounds
