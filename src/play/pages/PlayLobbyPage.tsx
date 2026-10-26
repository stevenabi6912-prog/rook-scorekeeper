import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/Avatar'
import { TopBar } from '../../components/Layout'
import { useMatchStore, useStoreContext } from '../../data/StoreContext'
import { ROOK } from '../../game/cards'
import { describeStoreError, useAllHands, useGames, usePlayers } from '../../hooks/useData'
import { sortHands } from '../../lib/scoring'
import { nextDealerId, teamOf } from '../../lib/seating'
import type { Game } from '../../lib/types'
import { Card } from '../components/Card'
import type { MatchDoc } from '../match/types'
import '../play.css'

export function PlayLobbyPage() {
  const matchStore = useMatchStore()
  const { demoMode } = useStoreContext()
  const navigate = useNavigate()
  const { games } = useGames()
  const { byId } = usePlayers()
  const handsByGame = useAllHands(games)
  const [matches, setMatches] = useState<MatchDoc[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)

  useEffect(() => matchStore.subscribeMatches(setMatches, (e) => setError(describeStoreError(e))), [matchStore])

  const open = useMemo(() => (matches ?? []).filter((m) => m.status === 'seating' || m.status === 'playing'), [matches])
  const activeGames = useMemo(() => (games ?? []).filter((g) => g.status === 'active'), [games])
  const gameById = useMemo(() => new Map((games ?? []).map((g) => [g.id, g])), [games])

  const newTable = async (game: Game) => {
    const hands = sortHands(handsByGame?.[game.id] ?? [])
    const dealerId = nextDealerId(game, hands)
    try {
      const id = await createTable(game, hands.length, dealerId)
      navigate(`/play/${id}`)
    } catch (e) {
      setError(describeStoreError(e as Error))
    }
  }

  const createTable = (game: Game, handsSoFar: number, dealerId: string) =>
    matchStore.createMatch({
      gameId: game.id,
      handedness: game.handedness,
      hostUid: matchStore.uid,
      status: 'seating',
      seats: game.seatOrder.map((playerId) => ({ playerId, team: teamOf(game.teams, playerId) ?? 'A', uid: null, bot: false })),
      handNumber: 0,
      firstHandNumber: handsSoFar + 1,
      dealerSeat: Math.max(0, game.seatOrder.indexOf(dealerId)),
      dealSeed: null,
      pub: null,
      turnStartedAt: Date.now(),
      lastMove: null,
      scoredHandNumber: 0,
      winner: null,
    })

  return (
    <>
      <TopBar title="Play" />
      <main className="page">
        <div className="lobby-hero" aria-hidden>
          <Card id="R14" width={64} style={{ transform: 'rotate(-14deg) translateY(6px)' }} />
          <Card id={ROOK} width={64} style={{ zIndex: 2 }} />
          <Card id="G14" width={64} style={{ transform: 'rotate(14deg) translateY(6px)' }} />
        </div>
        {demoMode && <div className="notice small">Demo mode: tables stay on this phone. One phone can take every seat, which is handy for trying the flow.</div>}
        {error && <div className="error">{error}</div>}

        <section className="section">
          <h3>Online tables</h3>
          {matches === null && <div className="spinner" />}
          {matches !== null && open.length === 0 && <div className="empty">No table is open. Start one from a game below and everyone taps their seat on their own phone.</div>}
          <div className="list">
            {open.map((m) => {
              const game = gameById.get(m.gameId)
              const taken = m.seats.filter((s) => s.uid || s.bot).length
              const mine = m.seats.some((s) => s.uid === matchStore.uid)
              return (
                <Link key={m.id} className="card tappable lobby-card" to={`/play/${m.id}`}>
                  <div className="grow">
                    <div className="lobby-card-title">
                      {game ? `${game.teams.A.name} vs ${game.teams.B.name}` : 'Table'}
                      {mine && <span className="badge good" style={{ marginLeft: 8 }}>You're seated</span>}
                    </div>
                    <div className="small muted">
                      {m.status === 'playing' ? `Playing · hand ${m.handNumber}` : `Seating · ${taken} of ${m.seats.length} seats taken`}
                    </div>
                    <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
                      {m.seats.map((s, i) => (
                        <span key={i} className={`badge ${s.uid || s.bot ? `team-${s.team}` : 'neutral'}`}>
                          {byId.get(s.playerId)?.name ?? '?'}{s.bot ? ' 🤖' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="lobby-arrow">›</span>
                </Link>
              )
            })}
          </div>
          {!choosing && <button type="button" className="btn primary block" style={{ marginTop: 10 }} onClick={() => setChoosing(true)}>＋ New table</button>}
          {choosing && (
            <div className="card stack">
              <div><strong>Which game is this table for?</strong></div>
              <div className="small muted">The hands played here are scored into that game.</div>
              {activeGames.length === 0 && (
                <div className="empty">
                  No game in progress. <Link to="/new">Create a game</Link> with the players and seats first, then come back here.
                </div>
              )}
              <div className="list">
                {activeGames.map((g) => (
                  <button key={g.id} type="button" className="card tappable lobby-card" onClick={() => newTable(g)}>
                    <div className="grow" style={{ textAlign: 'left' }}>
                      <div className="lobby-card-title">{g.teams.A.name} vs {g.teams.B.name}</div>
                      <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
                        {g.seatOrder.map((id) => <Avatar key={id} player={byId.get(id)} size="sm" />)}
                      </div>
                    </div>
                    <span className="lobby-arrow">›</span>
                  </button>
                ))}
              </div>
              <button type="button" className="btn ghost block" onClick={() => setChoosing(false)}>Never mind</button>
            </div>
          )}
        </section>

        <section className="section">
          <h3>Practice</h3>
          <Link className="card tappable lobby-card" to="/play/demo">
            <div className="grow">
              <div className="lobby-card-title">4 players: you and 3 bots</div>
              <div className="small muted">Partners across the table, 9 cards each. A full game on this phone.</div>
            </div>
            <span className="lobby-arrow">›</span>
          </Link>
          <Link className="card tappable lobby-card" to="/play/demo?players=6">
            <div className="grow">
              <div className="lobby-card-title">6 players: you and 5 bots</div>
              <div className="small muted">Three a side, 6 cards each.</div>
            </div>
            <span className="lobby-arrow">›</span>
          </Link>
          <p className="small muted">The bots always play by the rules but keep no memory of what has been played, so they do make mistakes.</p>
        </section>
      </main>
    </>
  )
}
