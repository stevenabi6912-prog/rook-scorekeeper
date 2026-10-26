import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { TopBar } from '../components/Layout'
import { useStore } from '../data/StoreContext'
import { usePlayers } from '../hooks/useData'
import { autoTeamName, interleave, moveItem, teamOf, validateSeating } from '../lib/seating'
import type { Handedness, TeamId } from '../lib/types'

export function NewGamePage() {
  const store = useStore()
  const navigate = useNavigate()
  const { players, byId, loading } = usePlayers()
  const [handedness, setHandedness] = useState<Handedness>(4)
  const [assignment, setAssignment] = useState<Record<string, TeamId>>({})
  const [seatOrder, setSeatOrder] = useState<string[]>([])
  const [firstDealerId, setFirstDealerId] = useState<string>('')
  const [names, setNames] = useState<Record<TeamId, string>>({ A: '', B: '' })
  const [namesEdited, setNamesEdited] = useState<Record<TeamId, boolean>>({ A: false, B: false })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const perTeam = handedness / 2
  const active = useMemo(() => (players ?? []).filter((p) => !p.archived && !p.bot), [players])

  const teams = useMemo(() => {
    const A = active.filter((p) => assignment[p.id] === 'A').map((p) => p.id)
    const B = active.filter((p) => assignment[p.id] === 'B').map((p) => p.id)
    return { A: { name: names.A, playerIds: A }, B: { name: names.B, playerIds: B } }
  }, [active, assignment, names])

  const teamKey = teams.A.playerIds.join(',') + '|' + teams.B.playerIds.join(',')

  // Whenever team membership changes, re-seat players in alternating order and
  // refresh the automatic team names (unless the user typed their own).
  useEffect(() => {
    setSeatOrder(interleave(teams))
    setNames((n) => ({
      A: namesEdited.A ? n.A : autoTeamName(teams.A.playerIds.map((id) => byId.get(id)?.name ?? '')),
      B: namesEdited.B ? n.B : autoTeamName(teams.B.playerIds.map((id) => byId.get(id)?.name ?? '')),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamKey, byId])

  useEffect(() => {
    if (!seatOrder.includes(firstDealerId)) setFirstDealerId(seatOrder[0] ?? '')
  }, [seatOrder, firstDealerId])

  const toggle = (playerId: string, team: TeamId) => {
    setAssignment((a) => {
      const next = { ...a }
      if (next[playerId] === team) delete next[playerId]
      else {
        const count = Object.values(next).filter((t) => t === team).length
        if (count >= perTeam) return a
        next[playerId] = team
      }
      return next
    })
  }

  const changeHandedness = (h: Handedness) => {
    setHandedness(h)
    setAssignment({})
  }

  const validation = validateSeating(handedness, teams, seatOrder)
  const ready = validation.ok && firstDealerId && names.A.trim() && names.B.trim()

  const create = async () => {
    if (!ready) return
    setBusy(true)
    setErr(null)
    try {
      const id = await store.createGame({
        mode: 'inPerson',
        handedness,
        teams: { A: { ...teams.A, name: names.A.trim() }, B: { ...teams.B, name: names.B.trim() } },
        seatOrder,
        firstDealerId,
      })
      navigate(`/game/${id}`, { replace: true })
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar title="New game" back="/" />
      <main className="page no-nav">
        {loading && <div className="spinner" />}
        {!loading && (
          <>
            <section className="section">
              <h3>Players per table</h3>
              <div className="seg" role="radiogroup">
                <button className={handedness === 4 ? 'active' : ''} onClick={() => changeHandedness(4)}>4-handed · 2 v 2</button>
                <button className={handedness === 6 ? 'active' : ''} onClick={() => changeHandedness(6)}>6-handed · 3 v 3</button>
              </div>
            </section>

            <section className="section">
              <h3>Teams</h3>
              <div className="row between small muted" style={{ marginBottom: 8 }}>
                <span><span className="badge team-A">A</span> {teams.A.playerIds.length}/{perTeam}</span>
                <span><span className="badge team-B">B</span> {teams.B.playerIds.length}/{perTeam}</span>
              </div>
              {active.length < handedness && (
                <div className="notice small">You need {handedness} players. Add more on the Players tab.</div>
              )}
              <div className="list">
                {active.map((p) => {
                  const t = assignment[p.id]
                  return (
                    <div key={p.id} className="card row" style={{ marginBottom: 0, padding: '8px 10px' }}>
                      <Avatar player={p} />
                      <div className="grow truncate" style={{ fontWeight: 600 }}>{p.name}</div>
                      <button className={`chip team-A${t === 'A' ? ' selected' : ''}`} style={{ minWidth: 56 }} onClick={() => toggle(p.id, 'A')} aria-pressed={t === 'A'}>A</button>
                      <button className={`chip team-B${t === 'B' ? ' selected' : ''}`} style={{ minWidth: 56 }} onClick={() => toggle(p.id, 'B')} aria-pressed={t === 'B'}>B</button>
                    </div>
                  )
                })}
              </div>
            </section>

            {seatOrder.length > 0 && (
              <section className="section">
                <h3>Seat order (clockwise)</h3>
                <p className="muted small">Seats must alternate A, B, A, B… Use the arrows to move someone.</p>
                <div className="list">
                  {seatOrder.map((id, i) => {
                    const p = byId.get(id)
                    const t = teamOf(teams, id)
                    return (
                      <div key={id} className={`seat team-${t ?? ''}`}>
                        <span className="seat-no">{i + 1}</span>
                        <Avatar player={p} size="sm" />
                        <span className="grow truncate" style={{ fontWeight: 600 }}>{p?.name}</span>
                        <span className={`badge team-${t ?? ''}`}>{t}</span>
                        <span className="arrows">
                          <button onClick={() => setSeatOrder((s) => moveItem(s, i, i - 1))} disabled={i === 0} aria-label="Move up">↑</button>
                          <button onClick={() => setSeatOrder((s) => moveItem(s, i, i + 1))} disabled={i === seatOrder.length - 1} aria-label="Move down">↓</button>
                        </span>
                      </div>
                    )
                  })}
                </div>
                <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => setSeatOrder(interleave(teams))}>Auto-arrange</button>
                {!validation.ok && seatOrder.length === handedness && (
                  <div className="error" style={{ marginTop: 8 }}>{validation.errors.join(' ')}</div>
                )}
              </section>
            )}

            {validation.ok && (
              <>
                <section className="section">
                  <h3>First dealer</h3>
                  <div className="chips grid-2">
                    {seatOrder.map((id) => {
                      const p = byId.get(id)
                      const t = teamOf(teams, id)
                      return (
                        <button key={id} className={`chip team-${t}${firstDealerId === id ? ' selected' : ''}`} onClick={() => setFirstDealerId(id)} aria-pressed={firstDealerId === id} aria-label={p?.name ?? 'Unknown player'}>
                          <Avatar player={p} size="sm" /> <span className="truncate">{p?.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section className="section">
                  <h3>Team names</h3>
                  {(['A', 'B'] as TeamId[]).map((t) => (
                    <label key={t} className="field">
                      <span>Team {t}</span>
                      <input
                        className="input"
                        value={names[t]}
                        onChange={(e) => {
                          setNames((n) => ({ ...n, [t]: e.target.value }))
                          setNamesEdited((n) => ({ ...n, [t]: true }))
                        }}
                      />
                    </label>
                  ))}
                </section>
              </>
            )}
            {err && <div className="error">{err}</div>}
          </>
        )}
      </main>
      <div className="fab-bar no-nav">
        <button className="btn primary big block" disabled={!ready || busy} onClick={create}>
          {busy ? 'Starting…' : 'Start game'}
        </button>
      </div>
    </>
  )
}
