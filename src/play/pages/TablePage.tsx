import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { botDecision } from '../../game/bots'
import { Avatar, playerColor } from '../../components/Avatar'
import { TopBar } from '../../components/Layout'
import { useMatchStore, useStore } from '../../data/StoreContext'
import type { CardId } from '../../game/cards'
import type { Action } from '../../game/engine'
import { randomSeed, seededRng } from '../../game/rng'
import { summarizeHand, toHandInput } from '../../game/score'
import { describeStoreError, useGame, useHands, usePlayers } from '../../hooks/useData'
import { currentTotals, scoreHand, teamsAtTarget } from '../../lib/scoring'
import type { Player, TeamId } from '../../lib/types'
import type { SeatInfo } from '../components/Table'
import { TableView, type Finished } from '../components/TableView'
import { scorekeeperHandNumber, useHostDuties } from '../match/host'
import { claimSeat, commitMove, dealNextHand, mySeats, releaseSeat, seatBots, seatsFilled, setMatchStatus } from '../match/moves'
import type { MatchDoc } from '../match/types'
import { toState } from '../match/view'
import { joinNames, TURN_LIMIT_MS } from './DemoTablePage'
import '../play.css'

/*
 * An online table: seat claiming, then the shared TableView fed from the
 * match document and this phone's private cards. The host's phone also runs
 * the bots, the timeouts, and the scorekeeper writes (useHostDuties).
 */

export function TablePage() {
  const { matchId = '' } = useParams()
  const matchStore = useMatchStore()
  const dataStore = useStore()
  const navigate = useNavigate()
  const [match, setMatch] = useState<MatchDoc | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const { byId } = usePlayers()
  const { game } = useGame(match?.gameId)
  const { hands } = useHands(match?.gameId)
  const rng = useMemo(() => seededRng(randomSeed()), [])

  useEffect(() => {
    setMatch(undefined)
    return matchStore.subscribeMatch(matchId, setMatch, (e) => setError(describeStoreError(e)))
  }, [matchStore, matchId])

  const seatsHeld = useMemo(() => (match ? mySeats(match, matchStore.uid) : []), [match, matchStore.uid])
  const [activeSeat, setActiveSeat] = useState<number | null>(null)
  const me = activeSeat !== null && seatsHeld.includes(activeSeat) ? activeSeat : (seatsHeld[0] ?? null)

  const { isHost } = useHostDuties({ matchStore, dataStore, match: match ?? null, game, hands, rng, turnLimitMs: TURN_LIMIT_MS })

  const seats: SeatInfo[] = useMemo(
    () =>
      (match?.seats ?? []).map((s) => {
        const p = byId.get(s.playerId)
        return { name: p?.name ?? 'Player', emoji: p?.emoji, color: playerColor(p ?? { name: s.playerId }), team: s.team }
      }),
    [match, byId],
  )
  const teamNames = useMemo<Record<TeamId, string>>(() => {
    if (game) return { A: game.teams.A.name, B: game.teams.B.name }
    const names = (t: TeamId) => seats.filter((s) => s.team === t).map((s) => s.name)
    return { A: joinNames(names('A')), B: joinNames(names('B')) }
  }, [game, seats])

  if (error) return <Gate title="Table"><div className="error">{error}</div></Gate>
  if (match === undefined || !game) return <Gate title="Table"><div className="spinner" /></Gate>
  if (match === null) {
    return (
      <Gate title="Table">
        <div className="empty">This table is gone.</div>
        <Link className="btn block" to="/play">Back to Play</Link>
      </Gate>
    )
  }

  if (match.status === 'seating' || match.status === 'abandoned' || me === null) {
    return (
      <Seating
        match={match}
        seats={seats}
        byId={byId}
        isHost={isHost}
        uid={matchStore.uid}
        onClaim={(seat) => claimSeat(matchStore, match.id, seat).catch((e) => setError(String(e.message ?? e)))}
        onRelease={(seat) => releaseSeat(matchStore, match.id, seat).catch((e) => setError(String(e.message ?? e)))}
        onBots={(seat) => seatBots(matchStore, match.id, seat).catch((e) => setError(String(e.message ?? e)))}
        onStart={() => dealNextHand(matchStore, match.id).catch((e) => setError(String(e.message ?? e)))}
        onCancel={() => setMatchStatus(matchStore, match.id, 'abandoned').then(() => navigate('/play'))}
        onDelete={() => matchStore.deleteMatch(match.id).then(() => navigate('/play'))}
      />
    )
  }

  if (match.status === 'finished') {
    return (
      <Gate title="Game over">
        <div className="card center">
          <div className="summary-headline">🏆 {match.winner ? teamNames[match.winner] : 'Nobody'} won</div>
          <p className="muted">The hands are in the scorekeeper.</p>
          <Link className="btn primary block" to={`/game/${match.gameId}`}>See the game</Link>
          <Link className="btn ghost block" to="/play">Back to Play</Link>
        </div>
      </Gate>
    )
  }

  return (
    <LiveTable
      match={match}
      me={me}
      seatsHeld={seatsHeld}
      onSwitchSeat={setActiveSeat}
      seats={seats}
      teamNames={teamNames}
      seatOrder={game.seatOrder}
      handsSoFar={hands ?? []}
      isHost={isHost}
      hostName={seats[match.seats.findIndex((s) => s.uid === match.hostUid)]?.name ?? 'the host'}
      rng={rng}
    />
  )
}

function Gate({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <TopBar title={title} back="/play" />
      <main className="page no-nav">{children}</main>
    </>
  )
}

/* ------------------------------------------------------------------ seating */

function Seating({
  match, seats, byId, isHost, uid, onClaim, onRelease, onBots, onStart, onCancel, onDelete,
}: {
  match: MatchDoc
  seats: SeatInfo[]
  byId: Map<string, Player>
  isHost: boolean
  uid: string
  onClaim: (seat: number) => void
  onRelease: (seat: number) => void
  onBots: (seat?: number) => void
  onStart: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  const mine = mySeats(match, uid)
  const ready = seatsFilled(match)
  const inPlay = match.status === 'playing'
  return (
    <Gate title={inPlay ? 'Table in play' : 'Take your seats'}>
      {match.status === 'abandoned' && <div className="notice">The host closed this table.</div>}
      {inPlay && mine.length === 0 && <div className="notice">This table is already playing. Take a free seat to join, or ask the host to free yours.</div>}
      <section className="section">
        <div className="list">
          {match.seats.map((s, i) => {
            const info = seats[i]
            const player = byId.get(s.playerId)
            const isMine = s.uid === uid
            const taken = s.uid !== null || s.bot
            return (
              <div key={i} className={`seat team-${s.team}`}>
                <span className="seat-no">{i + 1}</span>
                <Avatar player={player} />
                <div className="grow">
                  <div><strong>{info?.name}</strong> <span className={`badge team-${s.team}`}>{s.team}</span></div>
                  <div className="small muted">
                    {isMine ? 'You, on this phone' : s.bot ? '🤖 Bot (moved by the host)' : s.uid ? '📱 On a phone' : 'Open seat'}
                  </div>
                </div>
                {!taken && <button type="button" className="btn small primary" onClick={() => onClaim(i)}>That's me</button>}
                {isMine && !inPlay && <button type="button" className="btn small" onClick={() => onRelease(i)}>Leave</button>}
                {isHost && !isMine && taken && !inPlay && <button type="button" className="btn small" onClick={() => onRelease(i)}>Free</button>}
                {isHost && !taken && <button type="button" className="btn small" onClick={() => onBots(i)}>Bot</button>}
              </div>
            )
          })}
        </div>
      </section>
      {isHost && !inPlay && match.status !== 'abandoned' && (
        <section className="section stack">
          <p className="small muted">Everyone opens Play on their own phone and taps their seat. Seats nobody takes can go to bots.</p>
          {!ready && <button type="button" className="btn block" onClick={() => onBots()}>Fill the empty seats with bots</button>}
          <button type="button" className="btn primary big block" disabled={!ready} onClick={onStart}>
            {ready ? 'Deal the first hand' : 'Waiting for every seat to be taken'}
          </button>
          <button type="button" className="btn ghost block" onClick={onCancel}>Cancel this table</button>
        </section>
      )}
      {!isHost && !inPlay && match.status !== 'abandoned' && (
        <p className="small muted center">{mine.length ? 'Seated. Waiting for the host to deal.' : 'Tap your seat.'}</p>
      )}
      {isHost && match.status === 'abandoned' && <button type="button" className="btn danger block" onClick={onDelete}>Delete this table</button>}
    </Gate>
  )
}

/* --------------------------------------------------------------- live table */

function LiveTable({
  match, me, seatsHeld, onSwitchSeat, seats, teamNames, seatOrder, handsSoFar, isHost, hostName, rng,
}: {
  match: MatchDoc
  me: number
  seatsHeld: number[]
  onSwitchSeat: (seat: number) => void
  seats: SeatInfo[]
  teamNames: Record<TeamId, string>
  seatOrder: string[]
  handsSoFar: { handNumber: number; createdAt: number; bidTeam: TeamId; bid: number | 'moon'; pointsTaken: number; moonMade?: boolean }[]
  isHost: boolean
  hostName: string
  rng: ReturnType<typeof seededRng>
}) {
  const matchStore = useMatchStore()
  const [params] = useSearchParams()
  /** `?auto`: this phone decides for its own seat with the bot logic (watching, testing). */
  const autopilot = params.has('auto')
  const [cards, setCards] = useState<CardId[] | null>(null)
  useEffect(() => {
    setCards(null)
    return matchStore.subscribeSeat(match.id, me, setCards)
  }, [matchStore, match.id, me])

  const pub = match.pub!

  // When a hand ends on a throw-in, everyone's remaining cards are shown face up.
  const [revealHands, setRevealHands] = useState<Record<number, CardId[]>>({})
  const claimKey = pub.phase === 'over' && pub.claimedBySeat !== null ? `${match.handNumber}:${pub.claimedBySeat}` : ''
  useEffect(() => {
    if (!claimKey) {
      setRevealHands({})
      return
    }
    let cancelled = false
    Promise.all(
      match.seats.map(async (_s, seat) => {
        if (seat === pub.claimedBySeat) return [seat, []] as const
        if (seat === me) return [seat, cards ?? []] as const
        // Older rules may refuse this read; then that seat simply stays hidden.
        return [seat, await matchStore.getSeat(match.id, seat).catch(() => [] as CardId[])] as const
      }),
    ).then((entries) => {
      if (!cancelled) setRevealHands(Object.fromEntries(entries.filter(([, c]) => c.length > 0)))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimKey, matchStore, match.id, me])

  useEffect(() => {
    if (!autopilot || pub.turnSeat !== me || pub.phase === 'over' || cards === null) return
    const timer = setTimeout(() => {
      commitMove(matchStore, match.id, me, (state) => botDecision(state, me, rng)).catch(() => undefined)
    }, 600)
    return () => clearTimeout(timer)
  }, [autopilot, pub, me, cards, matchStore, match.id, rng])
  const state = useMemo(() => toState(pub, me, cards ?? []), [pub, me, cards])
  const skHand = scorekeeperHandNumber(match)
  const totals = useMemo(() => currentTotals(handsSoFar.filter((h) => h.handNumber < skHand) as never), [handsSoFar, skHand])

  const finished = useMemo<Finished | null>(() => {
    if (pub.phase !== 'over') return null
    const result = summarizeHand(state)
    const outcome = scoreHand(totals, toHandInput(state, seatOrder))
    return { result, outcome, before: totals }
  }, [pub.phase, state, totals, seatOrder])

  const gameOver: TeamId | null = useMemo(() => {
    if (!finished) return null
    const at = teamsAtTarget(finished.outcome.totals)
    if (at.length === 0) return null
    if (at.length === 1) return at[0]
    return finished.outcome.totals.A >= finished.outcome.totals.B ? 'A' : 'B'
  }, [finished])

  const act = useCallback(
    async (action: Action) => {
      await commitMove(matchStore, match.id, me, () => action)
    },
    [matchStore, match.id, me],
  )

  const turnSeat = match.seats[pub.turnSeat]
  const notice =
    pub.phase !== 'over' && turnSeat.bot && !isHost ? `${hostName}'s phone moves the bots` : seatsHeld.length > 1 ? `You hold ${seatsHeld.length} seats on this phone` : null

  return (
    <>
      <TableView
        state={state}
        me={me}
        seats={seats}
        teamNames={teamNames}
        totals={totals}
        handNumber={match.handNumber}
        act={act}
        rng={rng}
        turnLimitMs={TURN_LIMIT_MS}
        turnStartedAt={match.turnStartedAt}
        autopilot={autopilot}
        finished={finished}
        gameOver={gameOver}
        onNext={isHost && !gameOver ? () => dealNextHand(matchStore, match.id).catch(() => undefined) : undefined}
        waitingFor={gameOver ? 'Finishing the game…' : `Waiting for ${hostName} to deal…`}
        backTo="/play"
        notice={notice}
        revealHands={revealHands}
      />
      {seatsHeld.length > 1 && (
        <div className="seat-switcher" role="tablist" aria-label="Your seats">
          {seatsHeld.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={s === me} className={`chip${s === me ? ' selected' : ''}`} onClick={() => onSwitchSeat(s)}>
              {seats[s].name}
              {pub.turnSeat === s && pub.phase !== 'over' ? ' •' : ''}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
