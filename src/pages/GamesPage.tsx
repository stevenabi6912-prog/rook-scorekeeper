import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TopBar } from '../components/Layout'
import { useMatchStore, useStoreContext } from '../data/StoreContext'
import type { MatchDoc } from '../play/match/types'
import { useIdleSweep } from '../play/sweep'
import { useAllHands, useGames, usePlayers } from '../hooks/useData'
import { summarizeGame } from '../lib/stats'
import type { Game, Hand, Player } from '../lib/types'

export function GamesPage() {
  const { games, loading, error } = useGames()
  const { byId } = usePlayers()
  const handsByGame = useAllHands(games)
  const { demoMode } = useStoreContext()
  const navigate = useNavigate()
  // Online games whose table went quiet are finished or removed from here too.
  const matchStore = useMatchStore()
  const [matches, setMatches] = useState<MatchDoc[] | null>(null)
  useEffect(() => matchStore.subscribeMatches(setMatches, () => undefined), [matchStore])
  useIdleSweep(matches)

  const active = (games ?? []).filter((g) => g.status === 'active')
  const past = (games ?? []).filter((g) => g.status === 'finished')

  return (
    <>
      <TopBar
        title="Rook"
        right={<Link className="icon-btn" to="/settings" aria-label="Settings">⚙️</Link>}
      />
      <main className="page">
        {demoMode && <div className="notice small">Demo mode: data stays on this device. Configure Firebase to sync between phones.</div>}
        {error && <div className="error">{error}</div>}
        {loading && <div className="spinner" />}

        {!loading && (
          <>
            <section className="section">
              <h3>In progress</h3>
              {active.length === 0 && <div className="empty">No game in progress.</div>}
              <div className="list">
                {active.map((g) => (
                  <GameCard key={g.id} game={g} hands={handsByGame?.[g.id]} byId={byId} onClick={() => navigate(`/game/${g.id}`)} />
                ))}
              </div>
            </section>
            <section className="section">
              <h3>Past games</h3>
              {past.length === 0 && <div className="empty">Finished games will show up here.</div>}
              <div className="list">
                {past.map((g) => (
                  <GameCard key={g.id} game={g} hands={handsByGame?.[g.id]} byId={byId} onClick={() => navigate(`/game/${g.id}`)} />
                ))}
              </div>
            </section>
          </>
        )}
      </main>
      <div className="fab-bar">
        <Link className="btn primary big block" to="/new">＋ New game</Link>
      </div>
    </>
  )
}

function GameCard({ game, hands, byId, onClick }: { game: Game; hands: Hand[] | undefined; byId: Map<string, Player>; onClick: () => void }) {
  const summary = hands ? summarizeGame(game, hands) : null
  const names = (ids: string[]) => ids.map((id) => byId.get(id)?.name ?? '?').join(', ')
  const date = new Date(game.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return (
    <div className="card tappable game-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div className="game-card-head">
        <span className="muted small">{date} · {game.handedness}-handed{summary ? ` · ${summary.handCount} hand${summary.handCount === 1 ? '' : 's'}` : ''}</span>
        <span className="game-card-badges">
          {game.mode === 'online' && <span className="badge neutral">Online</span>}
          {game.status === 'active' ? <span className="badge good">Live</span> : <span className="badge neutral">Final</span>}
        </span>
      </div>
      {(['A', 'B'] as const).map((t) => {
        const won = game.status === 'finished' && game.winner === t
        return (
          <div key={t} className={`game-card-team${won ? ' won' : ''}`}>
            <div className="grow">
              <div className="truncate">
                <span className={`badge team-${t}`}>{t}</span> <strong>{game.teams[t].name}</strong>
                {won && <span className="trophy" role="img" aria-label="Winner">🏆</span>}
              </div>
              <div className="muted small truncate">{names(game.teams[t].playerIds)}</div>
            </div>
            <div className="game-card-total">{summary ? summary.totals[t] : '…'}</div>
          </div>
        )
      })}
    </div>
  )
}
