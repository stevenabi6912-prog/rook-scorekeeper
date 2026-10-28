import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Dialog } from '../components/Dialog'
import { HandTable } from '../components/HandTable'
import { TopBar } from '../components/Layout'
import { DealerCard, ScoreBoard } from '../components/ScoreBoard'
import { TrumpDot, TrumpPicker } from '../components/TrumpPicker'
import { useMatchStore, useStore } from '../data/StoreContext'
import type { MatchDoc } from '../play/match/types'
import { useGame, useHands, usePlayers } from '../hooks/useData'
import { leadingTeam, replayHands, teamsAtTarget } from '../lib/scoring'
import { nextDealerId, swapPlayer } from '../lib/seating'
import { Avatar } from '../components/Avatar'
import { RULES, trumpInfo, type Bid, type TeamId } from '../lib/types'
import { BID_OPTIONS } from '../lib/scoring'

export function GamePage() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const store = useStore()
  const { game, loading: gameLoading, error: gameError } = useGame(gameId)
  const { hands, loading: handsLoading } = useHands(gameId)
  const { byId, players } = usePlayers()
  const liveTable = useLiveTable(gameId)

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
  // Swapping a player out mid-game: who is leaving, who is sitting down.
  const [swapOpen, setSwapOpen] = useState(false)
  const [swapOut, setSwapOut] = useState<string | null>(null)
  const [swapIn, setSwapIn] = useState<string | null>(null)

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
  const seated = new Set(game.seatOrder)
  const bench = (players ?? []).filter((p) => !p.archived && !p.bot && !seated.has(p.id))
  const doSwap = async () => {
    if (!swapOut || !swapIn) return
    setSwapOpen(false)
    await store.updateGame(game.id, swapPlayer(game, swapOut, swapIn, (id) => byId.get(id)?.name ?? '?'))
    setSwapOut(null)
    setSwapIn(null)
  }
  // Same teams and seats; the deal carries on from where this game left off.
  const playAgain = async () => {
    const id = await store.createGame({
      handedness: game.handedness,
      teams: game.teams,
      seatOrder: game.seatOrder,
      firstDealerId: dealerId,
      mode: game.mode ?? 'inPerson',
    })
    navigate(`/game/${id}`)
  }

  return (
    <>
      <TopBar
        title={`${game.teams.A.name} vs ${game.teams.B.name}`}
        back="/"
        right={<button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="More">⋯</button>}
      />
      <main className="page no-nav">
        {isActive && liveTable && (
          <div className="banner">
            <strong>This game is being played online.</strong>
            <Link className="btn primary block" to={`/play/${liveTable.id}`}>Go to the table</Link>
          </div>
        )}
        {!isActive && (
          <div className="banner">
            <strong>Game over.</strong>{' '}
            {game.winner ? <>Winner: <strong>{game.teams[game.winner].name}</strong> 🏆</> : 'No winner recorded.'}
            <div className="small" style={{ marginTop: 4 }}>
              {game.finishedAt ? `Finished ${finishedOn(game.finishedAt)}` : ''}
            </div>
            {game.mode !== 'online' && (
              <button className="btn primary block" style={{ marginTop: 10 }} onClick={playAgain}>
                🔁 Play again · same teams, {dealer?.name ?? 'next player'} deals
              </button>
            )}
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
          <>
            <div onClick={() => setOverrideOpen(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOverrideOpen(true)}>
              <DealerCard dealer={dealer} label={`Dealer · hand ${scored.length + 1}`} hint="Change" />
            </div>
            <div className="trump-card" style={{ display: 'block' }}>
              <div className="row">
                <TrumpDot trump={game.currentTrump} size="lg" />
                <div>
                  <div className="label">Hand {scored.length + 1} in progress</div>
                  <div className="name">
                    {game.currentBid ? `${byId.get(game.currentBid.bidderId)?.name ?? '?'} has it for ${game.currentBid.bid === 'moon' ? 'the Moon' : game.currentBid.bid}` : 'No bid yet'}
                    {' · '}
                    {trumpInfo(game.currentTrump)?.label ? `${trumpInfo(game.currentTrump)?.label} trump` : 'trump not set'}
                  </div>
                </div>
              </div>
              <div className="muted small" style={{ margin: '8px 0 4px' }}>Who has the bid</div>
              <div className="chips">
                {game.seatOrder.map((id) => (
                  <button key={id} type="button" className={`chip${game.currentBid?.bidderId === id ? ' selected' : ''}`} onClick={() => store.updateGame(game.id, { currentBid: { bidderId: id, bid: game.currentBid?.bid ?? RULES.MIN_BID } })}>
                    {byId.get(id)?.name ?? '?'}
                  </button>
                ))}
              </div>
              <div className="muted small" style={{ margin: '8px 0 4px' }}>For how much</div>
              <div className="chips grid-6">
                {([...BID_OPTIONS, 'moon'] as Bid[]).map((b) => (
                  <button
                    key={String(b)}
                    type="button"
                    className={`chip compact${game.currentBid?.bid === b ? ' selected' : ''}`}
                    style={b === 'moon' ? { gridColumn: 'span 2' } : undefined}
                    disabled={!game.currentBid}
                    onClick={() => game.currentBid && store.updateGame(game.id, { currentBid: { bidderId: game.currentBid.bidderId, bid: b } })}
                  >
                    {b === 'moon' ? '🌙 Moon' : b}
                  </button>
                ))}
              </div>
              <div className="muted small" style={{ margin: '8px 0 4px' }}>Trump</div>
              <TrumpPicker value={game.currentTrump} onChange={(t) => store.updateGame(game.id, { currentTrump: t })} />
            </div>
          </>
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
            {isActive && game.mode !== 'online' && (
              <button className="btn block" onClick={() => { setMenuOpen(false); setSwapOpen(true) }}>Swap a player</button>
            )}
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
        open={swapOpen}
        title="Swap a player"
        confirmLabel="Swap"
        confirmDisabled={!swapOut || !swapIn}
        onCancel={() => setSwapOpen(false)}
        onConfirm={doSwap}
      >
        <p className="muted small">Who is getting up? Their seat, team and place in the deal go to whoever sits down. Hands already scored stay as they were.</p>
        <div className="chips" style={{ marginBottom: 10 }}>
          {game.seatOrder.map((id) => (
            <button key={id} type="button" className={`chip team-${game.teams.A.playerIds.includes(id) ? 'A' : 'B'}${swapOut === id ? ' selected' : ''}`} onClick={() => setSwapOut(id)}>
              {byId.get(id)?.name ?? '?'}
            </button>
          ))}
        </div>
        <p className="muted small">Who is sitting down?</p>
        {bench.length === 0 && <p className="small">Everyone on the Players tab is already in this game. Add the new person on the Players tab first.</p>}
        <div className="list">
          {bench.map((p) => (
            <button key={p.id} type="button" className="seat" onClick={() => setSwapIn(p.id)} style={{ textAlign: 'left', border: 'none', borderLeft: `5px solid ${swapIn === p.id ? 'var(--primary)' : 'var(--border)'}` }}>
              <Avatar player={p} />
              <div className="grow" style={{ fontWeight: swapIn === p.id ? 700 : 500 }}>{p.name}</div>
              {swapIn === p.id && <span className="badge good">sitting down</span>}
            </button>
          ))}
        </div>
      </Dialog>

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

/** The open online table for this game, if there is one. */
function useLiveTable(gameId: string | undefined): MatchDoc | null {
  const matchStore = useMatchStore()
  const [table, setTable] = useState<MatchDoc | null>(null)
  useEffect(() => {
    if (!gameId) return
    return matchStore.subscribeMatches(
      (list) => setTable(list.find((m) => m.gameId === gameId && (m.status === 'seating' || m.status === 'playing')) ?? null),
      () => setTable(null),
    )
  }, [matchStore, gameId])
  return table
}

/** "Oct 27, 8:22 PM" in the phone's own locale. */
function finishedOn(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
