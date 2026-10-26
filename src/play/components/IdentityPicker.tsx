import { useState, type FormEvent } from 'react'
import { Avatar, PLAYER_COLORS, PLAYER_EMOJIS } from '../../components/Avatar'
import { useStore } from '../../data/StoreContext'
import type { Player } from '../../lib/types'

/**
 * "Who are you?" Each phone picks its family member once. Anyone not on the
 * list adds themselves here; that creates their player like the Players tab does.
 */
export function IdentityPicker({ players, onPick, onCancel }: { players: Player[]; onPick: (playerId: string) => void; onCancel?: () => void }) {
  const store = useStore()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState<string>(PLAYER_EMOJIS[0])
  const [color, setColor] = useState<string>(PLAYER_COLORS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const people = players.filter((p) => !p.archived && !p.bot)

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    setBusy(true)
    try {
      const id = await store.addPlayer({ name: n, emoji, color })
      onPick(id)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="card stack">
      <div>
        <strong>Who are you?</strong>
        <div className="small muted">This phone will remember. Everyone sees you in the lobby under this name.</div>
      </div>
      {error && <div className="error">{error}</div>}
      {!adding && (
        <>
          <div className="list">
            {people.map((p) => (
              <button key={p.id} type="button" className="seat" onClick={() => onPick(p.id)} style={{ textAlign: 'left', border: 'none', borderLeft: '5px solid var(--border)' }}>
                <Avatar player={p} />
                <div className="grow" style={{ fontWeight: 600 }}>{p.name}</div>
                <span className="btn small primary">That's me</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn block" onClick={() => setAdding(true)}>＋ I'm not on the list</button>
          {onCancel && <button type="button" className="btn ghost block" onClick={onCancel}>Cancel</button>}
        </>
      )}
      {adding && (
        <form className="stack" onSubmit={add}>
          <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus aria-label="Your name" />
          <div className="chips">
            {PLAYER_EMOJIS.map((e) => (
              <button key={e} type="button" className={`chip${emoji === e ? ' selected' : ''}`} onClick={() => setEmoji(e)} aria-label={`Emoji ${e}`}>{e}</button>
            ))}
          </div>
          <div className="chips">
            {PLAYER_COLORS.map((c) => (
              <button key={c} type="button" className={`chip${color === c ? ' selected' : ''}`} style={{ background: c, color: '#fff', borderColor: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`}>●</button>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn grow" onClick={() => setAdding(false)}>Back</button>
            <button type="submit" className="btn primary grow" disabled={busy || !name.trim()}>Add me</button>
          </div>
        </form>
      )}
    </div>
  )
}
