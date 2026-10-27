import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { InviteButton } from '../../components/InviteButton'
import { TopBar } from '../../components/Layout'
import { useMatchStore, useStore, useStoreContext } from '../../data/StoreContext'
import { ROOK } from '../../game/cards'
import { describeStoreError, useGames, usePlans, usePlayers } from '../../hooks/useData'
import type { Handedness, Player, TeamId } from '../../lib/types'
import { formatWhen, localTimeZone, relativeWhen, toLocalInputValue } from '../../lib/when'
import { Card } from '../components/Card'
import { IdentityPicker } from '../components/IdentityPicker'
import { loadIdentity, saveIdentity } from '../identity'
import { startTable, type Participant } from '../match/lobby'
import type { MatchDoc } from '../match/types'
import { useHeartbeat, useWhoIsHere } from '../presence'
import '../play.css'

/*
 * The online lobby. A phone knows who it is, everyone here checks in every
 * ten seconds, and a table is started straight from the people present,
 * with bots in the seats nobody takes. Whoever starts a table hosts it; any
 * family member can.
 */

export function PlayLobbyPage() {
  const matchStore = useMatchStore()
  const dataStore = useStore()
  const { demoMode, familyCode } = useStoreContext()
  const navigate = useNavigate()
  const { games } = useGames()
  const { players, byId } = usePlayers()
  const [matches, setMatches] = useState<MatchDoc[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [identity, setIdentity] = useState<string | null>(() => loadIdentity(familyCode ?? ''))
  const [choosing, setChoosing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [planning, setPlanning] = useState(false)
  const { plans, error: plansError } = usePlans()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => matchStore.subscribeMatches(setMatches, (e) => setError(`Could not load the tables. ${describeStoreError(e)}`)), [matchStore])
  const me = identity ? byId.get(identity) : undefined
  const validIdentity = me && !me.archived && !me.bot ? identity : null
  useHeartbeat(validIdentity, null)
  const { here } = useWhoIsHere()

  const open = useMemo(() => (matches ?? []).filter((m) => m.status === 'seating' || m.status === 'playing'), [matches])
  const gameById = useMemo(() => new Map((games ?? []).map((g) => [g.id, g])), [games])
  const people = useMemo(() => (players ?? []).filter((p) => !p.archived && !p.bot), [players])
  // Plans stay listed until three hours after their time; this phone's own old ones are tidied away.
  const upcoming = useMemo(() => (plans ?? []).filter((p) => p.at > now - 3 * 3600_000), [plans, now])
  useEffect(() => {
    for (const p of plans ?? []) {
      if (p.uid === matchStore.uid && p.at < now - 24 * 3600_000) dataStore.deletePlan(p.id).catch(() => undefined)
    }
  }, [plans, now, matchStore.uid, dataStore])

  const pick = (playerId: string) => {
    saveIdentity(familyCode ?? '', playerId)
    setIdentity(playerId)
    setChoosing(false)
  }

  if (players && (!validIdentity || choosing)) {
    return (
      <>
        <TopBar title="Play" />
        <main className="page">
          <div className="lobby-hero" aria-hidden>
            <Card id="R14" width={64} style={{ transform: 'rotate(-14deg) translateY(6px)' }} />
            <Card id={ROOK} width={64} style={{ zIndex: 2 }} />
            <Card id="G14" width={64} style={{ transform: 'rotate(14deg) translateY(6px)' }} />
          </div>
          <IdentityPicker players={players} onPick={pick} onCancel={validIdentity ? () => setChoosing(false) : undefined} />
        </main>
      </>
    )
  }

  return (
    <>
      <TopBar
        title="Play"
        right={
          me ? (
            <button type="button" className="icon-btn" onClick={() => setChoosing(true)} aria-label={`You are ${me.name}. Change`}>
              <Avatar player={me} size="sm" />
            </button>
          ) : undefined
        }
      />
      <main className="page">
        {demoMode && <div className="notice small">Demo mode: tables and presence stay on this phone.</div>}
        {error && <div className="error">{error}</div>}

        <section className="section">
          <h3>Who's here</h3>
          <div className="row wrap" style={{ gap: 6 }}>
            {people.map((p) => {
              const presence = here.get(p.id)
              const online = !!presence || p.id === validIdentity
              const table = presence?.tableId ? open.find((m) => m.id === presence.tableId) : undefined
              return (
                <span key={p.id} className={`who${online ? ' online' : ''}`} title={online ? 'Here now' : 'Not here'}>
                  <Avatar player={p} size="sm" />
                  {p.name}
                  {table && <span className="who-at">at a table</span>}
                </span>
              )
            })}
            {people.length === 0 && <span className="muted small">Nobody yet.</span>}
          </div>
          {!demoMode && familyCode && (
            <div style={{ marginTop: 10 }}>
              <InviteButton code={familyCode} />
              <p className="small muted center" style={{ marginTop: 6 }}>They tap the link, pick their name, and they're in.</p>
            </div>
          )}
        </section>

        <section className="section">
          <h3>Plans</h3>
          {plansError && <div className="small muted">Plans are not available yet. {plansError}</div>}
          {!plansError && upcoming.length === 0 && <div className="small muted">Nobody has said when they'll be here.</div>}
          <div className="list">
            {upcoming.map((p) => {
              const who = byId.get(p.playerId)
              const mine = p.uid === matchStore.uid
              return (
                <div key={p.id} className="card row plan" style={{ gap: 10 }}>
                  <Avatar player={who} />
                  <div className="grow">
                    <div><strong>{who?.name ?? 'Someone'}</strong> · {formatWhen(p.at, now)}</div>
                    {p.note && <div className="small">{p.note}</div>}
                    <div className="small muted">{relativeWhen(p.at, now)}</div>
                  </div>
                  {mine && (
                    <button type="button" className="icon-btn" aria-label="Remove this plan" onClick={() => dataStore.deletePlan(p.id).catch((e) => setError(describeStoreError(e)))}>✕</button>
                  )}
                </div>
              )
            })}
          </div>
          {validIdentity && !plansError && !planning && (
            <button type="button" className="btn block" style={{ marginTop: 8 }} onClick={() => setPlanning(true)}>🕒 I'll be here at…</button>
          )}
          {validIdentity && planning && (
            <PlanForm
              onCancel={() => setPlanning(false)}
              onSave={async (at, note) => {
                try {
                  await dataStore.addPlan({ playerId: validIdentity, uid: matchStore.uid, note, at })
                  setPlanning(false)
                } catch (e) {
                  setError(`Could not save the plan. ${describeStoreError(e as Error)}`)
                }
              }}
            />
          )}
          <p className="small muted" style={{ marginTop: 6 }}>Times show in each phone's own time zone{localTimeZone() ? ` (yours: ${localTimeZone().replace('_', ' ')})` : ''}.</p>
        </section>

        <section className="section">
          <h3>Tables</h3>
          {matches === null && <div className="spinner" />}
          {matches !== null && open.length === 0 && <div className="empty">No table is open right now.</div>}
          <div className="list">
            {open.map((m) => {
              const game = gameById.get(m.gameId)
              const mySeat = m.seats.findIndex((s) => s.playerId === validIdentity)
              const taken = m.seats.filter((s) => s.uid || s.bot).length
              return (
                <Link key={m.id} className="card tappable lobby-card" to={`/play/${m.id}`}>
                  <div className="grow">
                    <div className="lobby-card-title">
                      {game ? `${game.teams.A.name} vs ${game.teams.B.name}` : 'Table'}
                    </div>
                    <div className="small muted">
                      {m.status === 'playing' ? `Playing · hand ${m.handNumber}` : `Getting seated · ${taken} of ${m.seats.length}`}
                    </div>
                    <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
                      {m.seats.map((s, i) => (
                        <span key={i} className={`badge ${s.uid || s.bot ? `team-${s.team}` : 'neutral'}`}>
                          {byId.get(s.playerId)?.name.replace(' 🤖', '') ?? '?'}{s.bot ? ' 🤖' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className={`btn small${mySeat >= 0 ? ' primary' : ''}`}>{mySeat >= 0 ? 'Join' : 'Watch'}</span>
                </Link>
              )
            })}
          </div>
          {!starting && validIdentity && (
            <button type="button" className="btn primary big block" style={{ marginTop: 10 }} onClick={() => setStarting(true)}>＋ Start a table</button>
          )}
          {starting && validIdentity && (
            <StartTable
              me={validIdentity}
              people={people}
              here={new Set(here.keys())}
              onCancel={() => setStarting(false)}
              onStart={async (input) => {
                try {
                  const { matchId } = await startTable(dataStore, matchStore, players ?? [], input)
                  navigate(`/play/${matchId}`)
                } catch (e) {
                  setError(`Could not open the table. ${describeStoreError(e as Error)}`)
                  setStarting(false)
                }
              }}
            />
          )}
        </section>

        <section className="section">
          <div className="row" style={{ gap: 8 }}>
            <Link className="btn big grow" to="/play/demo?players=6">🤖 Practice against bots</Link>
            <Link className="btn big" to="/play/demo?players=4" aria-label="Practice, 4 players">4 up</Link>
          </div>
          <p className="small muted center" style={{ marginTop: 6 }}>Just you and the computer, on this phone. Nothing is saved.</p>
        </section>
      </main>
    </>
  )
}

/* ------------------------------------------------------------ plans */

function PlanForm({ onCancel, onSave }: { onCancel: () => void; onSave: (at: number, note: string) => Promise<void> }) {
  // Default to the next full hour, in this phone's local time.
  const [when, setWhen] = useState(() => {
    const d = new Date()
    d.setMinutes(0, 0, 0)
    d.setHours(d.getHours() + 1)
    return toLocalInputValue(d.getTime())
  })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const at = new Date(when).getTime()
  const valid = Number.isFinite(at)
  return (
    <form
      className="card stack"
      style={{ marginTop: 8 }}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valid) return
        setBusy(true)
        await onSave(at, note.trim().slice(0, 200))
        setBusy(false)
      }}
    >
      <label className="small muted">
        I'll be here at
        <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required style={{ marginTop: 4 }} />
      </label>
      <input className="input" placeholder="Note (optional), e.g. “after church”" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} aria-label="Note" />
      {valid && <div className="small muted">{formatWhen(at)} · {relativeWhen(at)}</div>}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn grow" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="btn primary grow" disabled={busy || !valid}>Post</button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------ start a table */

function StartTable({
  me, people, here, onCancel, onStart,
}: {
  me: string
  people: Player[]
  here: Set<string>
  onCancel: () => void
  onStart: (input: { handedness: Handedness; teams: Record<TeamId, Participant[]>; hostPlayerId: string }) => void
}) {
  const [handedness, setHandedness] = useState<Handedness>(6)
  // Chosen people in the order they were tapped: me first, then whoever is here.
  const [chosen, setChosen] = useState<string[]>(() => [me, ...people.filter((p) => p.id !== me && here.has(p.id)).map((p) => p.id)].slice(0, 6))
  const [busy, setBusy] = useState(false)
  const [swap, setSwap] = useState<Set<string>>(new Set())

  const limit = handedness
  const picked = chosen.slice(0, limit)
  const bots = Math.max(0, limit - picked.length)
  const toggle = (id: string) => {
    if (id === me) return
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < limit ? [...c, id] : c))
  }

  // Seats alternate A, B, A, B in tap order; bots fill the end. A tap on a chip swaps its team.
  const participants: Participant[] = [
    ...picked.map((playerId) => ({ kind: 'player', playerId }) as Participant),
    ...Array.from({ length: bots }, (_, i) => ({ kind: 'bot', index: i }) as Participant),
  ]
  const keyOf = (p: Participant) => (p.kind === 'player' ? p.playerId : `bot${p.index}`)
  const teams: Record<TeamId, Participant[]> = { A: [], B: [] }
  participants.forEach((p, i) => {
    let team: TeamId = i % 2 === 0 ? 'A' : 'B'
    if (swap.has(keyOf(p))) team = team === 'A' ? 'B' : 'A'
    teams[team].push(p)
  })
  const balanced = teams.A.length === limit / 2 && teams.B.length === limit / 2
  const label = (p: Participant) => (p.kind === 'player' ? people.find((x) => x.id === p.playerId)?.name ?? '?' : `Bot ${p.index + 1} 🤖`)
  const flip = (key: string) =>
    setSwap((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  return (
    <div className="card stack" style={{ marginTop: 10 }}>
      <div><strong>Start a table</strong></div>
      <div className="chips grid-2">
        {([6, 4] as Handedness[]).map((h) => (
          <button key={h} type="button" className={`chip${handedness === h ? ' selected' : ''}`} onClick={() => setHandedness(h)}>{h} players</button>
        ))}
      </div>
      <div className="small muted">Who's playing? Tap to add or remove. Empty seats go to bots.</div>
      <div className="row wrap" style={{ gap: 6 }}>
        {people.map((p) => {
          const on = picked.includes(p.id)
          return (
            <button key={p.id} type="button" className={`chip${on ? ' selected' : ''}`} onClick={() => toggle(p.id)} disabled={!on && picked.length >= limit} aria-pressed={on}>
              <Avatar player={p} size="sm" /> {p.name}{here.has(p.id) ? ' •' : ''}
            </button>
          )
        })}
      </div>
      <div className="small muted">Teams (tap a name to switch sides):</div>
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        {(['A', 'B'] as TeamId[]).map((t) => (
          <div key={t} className="grow stack" style={{ gap: 6 }}>
            <span className={`badge team-${t}`}>Team {t}</span>
            {teams[t].map((p) => (
              <button key={keyOf(p)} type="button" className={`chip team-${t} selected`} onClick={() => flip(keyOf(p))}>
                {label(p)}
              </button>
            ))}
          </div>
        ))}
      </div>
      {!balanced && <div className="error">Each team needs {limit / 2} players.</div>}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn grow" onClick={onCancel} disabled={busy}>Cancel</button>
        <button
          type="button"
          className="btn primary grow"
          disabled={!balanced || busy}
          onClick={() => {
            setBusy(true)
            onStart({ handedness, teams, hostPlayerId: me })
          }}
        >
          {bots > 0 ? `Open table (+${bots} bot${bots === 1 ? '' : 's'})` : 'Open table'}
        </button>
      </div>
    </div>
  )
}
