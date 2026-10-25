import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Dialog } from '../components/Dialog'
import { HandTable } from '../components/HandTable'
import { TopBar } from '../components/Layout'
import { DealerCard, ScoreBoard } from '../components/ScoreBoard'
import { useStore } from '../data/StoreContext'
import { useGame, useHands, usePlayers } from '../hooks/useData'
import { leadingTeam, replayHands, teamsAtTarget } from '../lib/scoring'
import { nextDealerId } from '../lib/seating'
import { RULES, type TeamId } from '../lib/types'

export function GamePage() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const store = useStore()
  const { game, loading: gameLoading, error: gameError } = useGame(gameId)
  const { hands, loading: handsLoading } = useHands(gameId)
  const { byId } = usePlayers()

  const scored = useMemo(() => replayHands(hands ?? []), [hands])
  const totals = scored.length ? scored[scored.length - 1].outcome.totals : { A: 0, B: 0 }
  const atTarget = teamsAtTarget(totals)

  const [finishOpen, setFinishOpen] = useState(false)
  const [winner, setWinner] = useState<TeamId>('A')
  const [menuOpen, setMenuOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [names, setNames] = useState<Record<TeamId, string>>({ A: '', B: '' })
  const [overrideOpen, setOverrideOpen] = useState(false)

  if (gameError) return <><TopBar title="Game" back="/" /><main className="page no-nav"><div className="error">{gameError}</div></main></>
  if (gameLoading || handsLoading || !hands) return <><TopBar title="Game" back="/" /><main className="page no-nav"><div className="spinner" /></main></>
  if (!game) return <><TopBar title="Game" back="/" /><main className="page no-nav"><div className="empty">This game no longer exists.</div></main></>

  const dealerId = nextDealerId(game, scored.map((s) => s.hand))
  const dealer = byId.get(dealerId)
  const isActive = game.status === 'active'
  const leader = leadingTeam(totals)

  // Higher score wins, even if both teams passed 500. Only an exact tie needs a choice.
  const tied = leader === null
  const openFinish = () => {
    setWinner(leader ?? 'A')
    setFinishOpen(true)
  }
  const finish = async () => {
    setFinishOpen(false)
    await store.updateGame(game.id, { status: 'finished', winner, finishedAt: Date.now() })
  }
  const reopen = () => store.updateGame(game.id, { status: 'active', winner: null })

  return (
    <>
      <TopBar
        title={`${game.teams.A.name} vs ${game.teams.B.name}`}
        back="/"
        right={<button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="More">⋯</button>}
      />
      <main className="page no-nav">
        {!isActive && (
          <div className="banner">
            <strong>Game over.</strong>{' '}
            {game.winner ? <>Winner: <strong>{game.teams[game.winner].name}</strong> 🏆</> : 'No winner recorded.'}
            <div className="small" style={{ marginTop: 4 }}>
              Finished {game.finishedAt ? new Date(game.finishedAt).toLocaleString() : ''}
            </div>
          </div>
        )}
        {isActive && atTarget.length > 0 && (
          <div className="banner">
            <strong>
              {atTarget.length === 2
                ? `Both teams passed ${RULES.TARGET_SCORE}. ${leader ? `${game.teams[leader].name} leads.` : 'It is a tie!'}`
                : `${game.teams[atTarget[0]].name} reached ${RULES.TARGET_SCORE}!`}
            </strong>
            <div className="small">Check the hands are right, then finish the game. The higher score wins.</div>
            <button className="btn primary block" onClick={openFinish}>Finish game</button>
          </div>
        )}

        <ScoreBoard game={game} totals={totals} byId={byId} />

        {isActive && (
          <div onClick={() => setOverrideOpen(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOverrideOpen(true)}>
            <DealerCard dealer={dealer} label={`Dealer for hand ${scored.length + 1} · tap to change`} />
          </div>
        )}

        <section className="section">
          <h3>Hands</h3>
          <HandTable game={game} scored={scored} byId={byId} onSelect={(hid) => navigate(`/game/${game.id}/hand/${hid}`)} />
          {scored.length > 0 && <p className="muted small" style={{ marginTop: 8 }}>Tap a hand to edit or delete it.</p>}
        </section>
      </main>

      {isActive && (
        <div className="fab-bar no-nav">
          <button className="btn primary big block" onClick={() => navigate(`/game/${game.id}/hand/new`)}>＋ Add hand</button>
        </div>
      )}

      <Dialog open={finishOpen} title="Finish game" confirmLabel="Finish" onCancel={() => setFinishOpen(false)} onConfirm={finish}>
        {tied ? (
          <>
            <p className="muted small">The scores are tied at {totals.A}. Pick the winner:</p>
            <div className="chips grid-2">
              {(['A', 'B'] as TeamId[]).map((t) => (
                <button key={t} className={`chip team-${t}${winner === t ? ' selected' : ''}`} onClick={() => setWinner(t)}>
                  {game.teams[t].name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p>
            Winner: <span className={`badge team-${winner}`}>{winner}</span> <strong>{game.teams[winner].name}</strong>{' '}
            <span className="muted">({totals.A} – {totals.B})</span>
          </p>
        )}
        {atTarget.length === 0 && <p className="muted small">Nobody has reached {RULES.TARGET_SCORE} yet. Finish anyway?</p>}
      </Dialog>

      <Dialog
        open={overrideOpen}
        title="Who is dealing?"
        confirmLabel="Done"
        onCancel={() => setOverrideOpen(false)}
        onConfirm={() => setOverrideOpen(false)}
      >
        <p className="muted small">The dealer rotates automatically. To override it for the next hand, pick the dealer when you add that hand. Current seat order:</p>
        <ol style={{ paddingLeft: 20 }}>
          {game.seatOrder.map((id) => (
            <li key={id} style={{ fontWeight: id === dealerId ? 700 : 400 }}>{byId.get(id)?.name}{id === dealerId ? ' ← deals next' : ''}</li>
          ))}
        </ol>
      </Dialog>

      {menuOpen && (
        <div className="dialog-backdrop" onClick={() => setMenuOpen(false)} role="presentation">
          <div className="dialog stack" onClick={(e) => e.stopPropagation()}>
            <button className="btn block" onClick={() => { setMenuOpen(false); setNames({ A: game.teams.A.name, B: game.teams.B.name }); setRenameOpen(true) }}>Rename teams</button>
            {isActive ? (
              <button className="btn block" onClick={() => { setMenuOpen(false); openFinish() }}>Finish game now</button>
            ) : (
              <button className="btn block" onClick={() => { setMenuOpen(false); reopen() }}>Reopen game</button>
            )}
            <button className="btn danger block" onClick={() => { setMenuOpen(false); setDeleteOpen(true) }}>Delete game</button>
            <button className="btn ghost block" onClick={() => setMenuOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      <Dialog
        open={renameOpen}
        title="Rename teams"
        confirmLabel="Save"
        confirmDisabled={!names.A.trim() || !names.B.trim()}
        onCancel={() => setRenameOpen(false)}
        onConfirm={async () => {
          setRenameOpen(false)
          await store.updateGame(game.id, {
            teams: { A: { ...game.teams.A, name: names.A.trim() }, B: { ...game.teams.B, name: names.B.trim() } },
          })
        }}
      >
        {(['A', 'B'] as TeamId[]).map((t) => (
          <label key={t} className="field">
            <span>Team {t}</span>
            <input className="input" value={names[t]} onChange={(e) => setNames((n) => ({ ...n, [t]: e.target.value }))} />
          </label>
        ))}
      </Dialog>

      <Dialog
        open={deleteOpen}
        title="Delete this game?"
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteOpen(false)}
        onConfirm={async () => {
          setDeleteOpen(false)
          await store.deleteGame(game.id)
          navigate('/', { replace: true })
        }}
      >
        <p className="muted">All {scored.length} hands will be deleted for everyone. This cannot be undone.</p>
      </Dialog>
    </>
  )
}
