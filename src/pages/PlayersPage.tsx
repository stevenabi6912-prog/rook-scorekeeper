import { useState, type FormEvent } from 'react'
import { Avatar, PLAYER_COLORS, PLAYER_EMOJIS, playerColor } from '../components/Avatar'
import { TopBar } from '../components/Layout'
import { useStore } from '../data/StoreContext'
import { usePlayers } from '../hooks/useData'
import type { Player } from '../lib/types'

export function PlayersPage() {
  const store = useStore()
  const { players, loading, error } = usePlayers()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const active = (players ?? []).filter((p) => !p.archived)
  const archived = (players ?? []).filter((p) => p.archived)

  return (
    <>
      <TopBar title="Players" />
      <main className="page">
        {error && <div className="error">{error}</div>}
        {loading && <div className="spinner" />}
        {!loading && (
          <>
            {editing === 'new' ? (
              <PlayerForm
                onCancel={() => setEditing(null)}
                onSave={async (v) => {
                  await store.addPlayer(v)
                  setEditing(null)
                }}
              />
            ) : (
              <button className="btn primary big block" onClick={() => setEditing('new')} style={{ marginBottom: 16 }}>＋ Add player</button>
            )}

            {active.length === 0 && editing !== 'new' && <div className="empty">Add your family members here first. They stay around for every game.</div>}
            <div className="list">
              {active.map((p) =>
                editing === p.id ? (
                  <PlayerForm
                    key={p.id}
                    initial={p}
                    onCancel={() => setEditing(null)}
                    onSave={async (v) => {
                      await store.updatePlayer(p.id, v)
                      setEditing(null)
                    }}
                    onArchive={async () => {
                      await store.updatePlayer(p.id, { archived: true })
                      setEditing(null)
                    }}
                  />
                ) : (
                  <div key={p.id} className="card row" style={{ marginBottom: 0 }}>
                    <Avatar player={p} />
                    <div className="grow truncate" style={{ fontWeight: 600 }}>{p.name}</div>
                    <button className="btn small" onClick={() => setEditing(p.id)}>Edit</button>
                  </div>
                ),
              )}
            </div>

            {archived.length > 0 && (
              <section className="section" style={{ marginTop: 24 }}>
                <button className="btn ghost small" onClick={() => setShowArchived((s) => !s)}>
                  {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
                </button>
                {showArchived && (
                  <div className="list" style={{ marginTop: 10 }}>
                    {archived.map((p) => (
                      <div key={p.id} className="card row" style={{ marginBottom: 0, opacity: 0.7 }}>
                        <Avatar player={p} />
                        <div className="grow truncate">{p.name}</div>
                        <button className="btn small" onClick={() => store.updatePlayer(p.id, { archived: false })}>Restore</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </>
  )
}

interface FormValues { name: string; emoji?: string; color?: string }

function PlayerForm({
  initial, onSave, onCancel, onArchive,
}: { initial?: Player; onSave: (v: FormValues) => Promise<void>; onCancel: () => void; onArchive?: () => Promise<void> }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '')
  const [color, setColor] = useState(initial?.color ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setErr('Name is required.')
      return
    }
    setBusy(true)
    try {
      await onSave({ name: trimmed, emoji: emoji || undefined, color: color || undefined })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const preview = { name: name || '?', emoji, color }
  return (
    <form className="card stack" onSubmit={submit}>
      <div className="row">
        <Avatar player={preview} size="lg" />
        <input className="input grow" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Player name" />
      </div>
      <div>
        <div className="muted small" style={{ marginBottom: 6 }}>Emoji (optional)</div>
        <div className="chips">
          <button type="button" className={`chip${emoji === '' ? ' selected' : ''}`} onClick={() => setEmoji('')}>Aa</button>
          {PLAYER_EMOJIS.map((e) => (
            <button type="button" key={e} className={`chip${emoji === e ? ' selected' : ''}`} onClick={() => setEmoji(e)} aria-label={`Emoji ${e}`}>{e}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="muted small" style={{ marginBottom: 6 }}>Color (optional)</div>
        <div className="swatches">
          {PLAYER_COLORS.map((c) => (
            <button type="button" key={c} className={`swatch${color === c ? ' selected' : ''}`} style={{ background: c }} onClick={() => setColor(color === c ? '' : c)} aria-label={`Color ${c}`} />
          ))}
          {!color && <span className="muted small" style={{ alignSelf: 'center' }}>auto: <span style={{ color: playerColor(preview) }}>●</span></span>}
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="row">
        <button type="button" className="btn grow" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="btn primary grow" disabled={busy}>{initial ? 'Save' : 'Add'}</button>
      </div>
      {onArchive && (
        <button type="button" className="btn ghost small block" onClick={onArchive} disabled={busy}>
          Archive player (hides from new games, keeps history)
        </button>
      )}
    </form>
  )
}
