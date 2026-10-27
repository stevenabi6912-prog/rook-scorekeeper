import { useEffect, useRef, useState, type FormEvent } from 'react'
import { QUICK_REACTIONS, type ChatMessage, type NewChatMessage } from '../match/types'
import { SeatAvatar, type SeatInfo } from './Table'

/*
 * Table chat: a bottom sheet with the conversation, quick reactions, a text
 * box and a hold-to-talk voice button. Event lines (bids, trump, results)
 * sit in the same stream in a quieter style, so it doubles as the hand log.
 */

export interface ChatApi {
  messages: ChatMessage[]
  send: (m: Omit<NewChatMessage, 'uid' | 'seat'>) => Promise<void> | void
  mySeat: number
  myUid: string
}

/** Runs a send and turns any failure, thrown or rejected, into a promise rejection. */
async function trySend(chat: ChatApi, m: Omit<NewChatMessage, 'uid' | 'seat'>): Promise<void> {
  await chat.send(m)
}

const MAX_VOICE_MS = 12000

export function ChatPanel({ chat, seats, open, onClose }: { chat: ChatApi; seats: SeatInfo[]; open: boolean; onClose: () => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [open, chat.messages.length])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    trySend(chat, { kind: 'text', text: t.slice(0, 500) }).catch((err: unknown) => setError(errorText(err)))
  }

  const { recording, seconds, supported, start, stop, cancel } = useVoiceRecorder((audio, mimeType, durationMs) =>
    trySend(chat, { kind: 'voice', text: '🎤 voice note', audio, mimeType, durationMs }).catch((err: unknown) => setError(errorText(err))),
  )

  if (!open) return null
  return (
    <div className="chat-backdrop" onClick={onClose}>
      <div className="chat-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Table chat">
        <div className="chat-head">
          <strong>Table chat</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close chat">✕</button>
        </div>
        <div className="chat-list" ref={listRef}>
          {chat.messages.length === 0 && <div className="chat-empty">Nothing yet. Say hi.</div>}
          {chat.messages.map((m) => (
            <ChatLine key={m.id} m={m} seats={seats} mine={m.uid === chat.myUid && m.seat === chat.mySeat && m.kind !== 'event'} />
          ))}
        </div>
        {error && <div className="chat-error">{error}</div>}
        <div className="chat-reactions">
          {QUICK_REACTIONS.map((r) => (
            <button key={r} type="button" className="chat-reaction" onClick={() => trySend(chat, { kind: 'reaction', text: r }).catch((err: unknown) => setError(errorText(err)))}>
              {r}
            </button>
          ))}
        </div>
        <form className="chat-compose" onSubmit={submit}>
          <input
            className="chat-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={recording ? `Recording… ${seconds}s` : 'Message'}
            maxLength={500}
            disabled={recording}
            aria-label="Message"
          />
          {text.trim() ? (
            <button type="submit" className="btn primary small">Send</button>
          ) : supported ? (
            <button
              type="button"
              className={`btn small mic${recording ? ' recording' : ''}`}
              onPointerDown={(e) => {
                e.preventDefault()
                start()
              }}
              onPointerUp={stop}
              onPointerLeave={() => recording && cancel()}
              onPointerCancel={cancel}
              aria-label={recording ? 'Release to send' : 'Hold to record a voice note'}
            >
              {recording ? '● Release to send' : '🎤 Hold'}
            </button>
          ) : null}
        </form>
      </div>
    </div>
  )
}

function ChatLine({ m, seats, mine }: { m: ChatMessage; seats: SeatInfo[]; mine: boolean }) {
  if (m.kind === 'event') return <div className="chat-event">{m.text}</div>
  const info = m.seat !== null ? seats[m.seat] : undefined
  return (
    <div className={`chat-line${mine ? ' mine' : ''}`}>
      {info && <SeatAvatar info={info} />}
      <div className="chat-body">
        <div className={`chat-name team-${info?.team ?? 'A'}`}>{info?.name ?? 'Table'}</div>
        {m.kind === 'voice' && m.audio ? <VoiceNote m={m} /> : <div className={`chat-text${m.kind === 'reaction' ? ' reaction' : ''}`}>{m.text}</div>}
      </div>
    </div>
  )
}

function VoiceNote({ m }: { m: ChatMessage }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(`data:${m.mimeType ?? 'audio/webm'};base64,${m.audio}`)
      audioRef.current.onended = () => setPlaying(false)
    }
    if (playing) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setPlaying(false)
    } else {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }
  const secs = Math.max(1, Math.round((m.durationMs ?? 0) / 1000))
  return (
    <button type="button" className={`voice-note${playing ? ' playing' : ''}`} onClick={toggle} aria-label={playing ? 'Stop' : 'Play voice note'}>
      {playing ? '■' : '▶'} <span className="voice-bars" aria-hidden>▁▃▅▂▆▃▁▅▂</span> {secs}s
    </button>
  )
}

/** Press-and-hold recorder; hands back base64 audio when released. */
function useVoiceRecorder(onDone: (audio: string, mimeType: string, durationMs: number) => void) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedRef = useRef(0)
  const cancelledRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  const finish = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setRecording(false)
    setSeconds(0)
  }

  const start = async () => {
    if (recording || !supported) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'].find((t) => MediaRecorder.isTypeSupported(t))
      const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 })
      chunksRef.current = []
      cancelledRef.current = false
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        finish()
        if (cancelledRef.current) return
        const durationMs = Date.now() - startedRef.current
        if (durationMs < 400) return
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mimeType || 'audio/webm' })
        if (blob.size > 220_000) return onDone('', '', durationMs) // too big: handled by the caller as an error
        const buf = new Uint8Array(await blob.arrayBuffer())
        let bin = ''
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
        onDone(btoa(bin), blob.type, durationMs)
      }
      recRef.current = rec
      startedRef.current = Date.now()
      rec.start()
      setRecording(true)
      setSeconds(0)
      timerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedRef.current) / 1000)
        setSeconds(s)
        if (Date.now() - startedRef.current >= MAX_VOICE_MS) stop()
      }, 250)
    } catch {
      finish()
    }
  }
  const stop = () => {
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }
  const cancel = () => {
    cancelledRef.current = true
    stop()
  }
  return { recording, seconds, supported, start, stop, cancel }
}

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message
  return 'Could not send that.'
}
