import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { botBid, botDiscard, botPlay, botTrump } from '../../game/bots'
import type { CardId } from '../../game/cards'
import { applyAction, legalBids, legalPlays, startHand, type Action, type BidAction, type HandState } from '../../game/engine'
import { randomSeed, seededRng } from '../../game/rng'
import { FAMILY_RULES } from '../../game/rules'
import { summarizeHand, tallies, toHandInput, type HandResult } from '../../game/score'
import { scoreHand, teamsAtTarget, type HandOutcome, type Scores } from '../../lib/scoring'
import type { Handedness, TeamId } from '../../lib/types'
import { BidPanel, HandSummary, KittyPanel, OvershootPanel, TrumpChip, TrumpPanel } from '../components/Panels'
import { HandFan } from '../components/Hand'
import { SeatBadge, Table, type SeatInfo, type Sweep } from '../components/Table'
import { isMuted, setMuted, sounds, unlockAudio } from '../sound'
import '../play.css'

/*
 * Practice table: you at seat 0 against three computer players, all on this
 * phone. No network, nothing saved. The same components will drive the online
 * table; only the source of moves differs.
 */

const ME = 0
const ALL_SEATS: SeatInfo[] = [
  { name: 'You', emoji: '🙂', color: '#1f6feb', team: 'A' },
  { name: 'Hank', emoji: '🤠', color: '#d9480f', team: 'B' },
  { name: 'Rosie', emoji: '🦊', color: '#2f9e44', team: 'A' },
  { name: 'June', emoji: '🦉', color: '#9c36b5', team: 'B' },
  { name: 'Walt', emoji: '🐻', color: '#0ca678', team: 'A' },
  { name: 'Pearl', emoji: '🐧', color: '#e03131', team: 'B' },
]
interface TableConfig {
  handedness: Handedness
  seats: SeatInfo[]
  teamNames: Record<TeamId, string>
  playerIds: string[]
  teams: TeamId[]
  /** The computer plays your seat too (for watching or testing). */
  autopilot: boolean
}

function tableConfig(handedness: Handedness, autopilot: boolean): TableConfig {
  const seats = ALL_SEATS.slice(0, handedness)
  const names = (team: TeamId) => seats.filter((s) => s.team === team).map((s) => s.name)
  const join = (list: string[]) => list.slice(0, -1).join(', ') + ' & ' + list.slice(-1)
  return {
    handedness,
    seats,
    teamNames: { A: join(names('A')), B: join(names('B')) },
    playerIds: seats.map((s) => `demo-${s.name.toLowerCase()}`),
    teams: seats.map((s) => s.team),
    autopilot,
  }
}

const BOT_DELAY = 750
/** A person gets this long per decision; then the table picks for them. */
const TURN_LIMIT_MS = 30_000
const REST_MS = 900
const SWEEP_MS = 450

interface Finished {
  result: HandResult
  outcome: HandOutcome
  before: Scores
}

/** `#/play/demo?players=6` seats five bots instead of three; `?auto` lets the bots play your seat. */
export function DemoTablePage() {
  const [params] = useSearchParams()
  const handedness: Handedness = params.get('players') === '6' ? 6 : 4
  const autopilot = params.has('auto')
  const cfg = useMemo(() => tableConfig(handedness, autopilot), [handedness, autopilot])
  // Remount on a different table size so every piece of state starts over.
  return <DemoTable key={`${handedness}-${autopilot}`} cfg={cfg} />
}

function DemoTable({ cfg }: { cfg: TableConfig }) {
  const { handedness: HANDEDNESS, seats: SEATS, teamNames: TEAM_NAMES, playerIds: PLAYER_IDS, teams: TEAMS, autopilot: AUTOPILOT } = cfg
  const LAST = HANDEDNESS - 1
  const rng = useMemo(() => seededRng(randomSeed()), [])
  const [dealerSeat, setDealerSeat] = useState(LAST)
  const [handNumber, setHandNumber] = useState(1)
  const [totals, setTotals] = useState<Scores>({ A: 0, B: 0 })
  const [state, setState] = useState<HandState>(() => newHand(LAST))
  const [selected, setSelected] = useState<CardId[]>([])
  const [sweep, setSweep] = useState<Sweep | null>(null)
  const [finished, setFinished] = useState<Finished | null>(null)
  const [muted, setMutedState] = useState(isMuted())
  const [toast, setToast] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const seenTricks = useRef(0)
  const stateRef = useRef(state)
  stateRef.current = state

  function newHand(dealer: number): HandState {
    return startHand({ rules: FAMILY_RULES, handedness: HANDEDNESS, teams: TEAMS, dealerSeat: dealer, seed: randomSeed() })
  }

  const busy = sweep !== null || finished !== null

  /** Apply a move from anyone, with sounds. */
  const act = useCallback((action: Action) => {
    setState((prev) => {
      const r = applyAction(prev, action)
      if (!r.ok) {
        setToast(r.error)
        return prev
      }
      if (action.type === 'bid') {
        if (action.bid === 'pass') sounds.pass()
        else if (action.bid === 'moon') sounds.moonBid()
        else sounds.bid()
      } else if (action.type === 'overshoot') {
        if (action.accept) sounds.moonBid()
        else sounds.pass()
      } else if (action.type === 'trump') sounds.trump()
      else if (action.type === 'discard') sounds.trickSweep()
      else if (action.type === 'play') sounds.cardSlide()
      return r.state
    })
  }, [])

  // Trick completed: rest, then sweep to the winner.
  useEffect(() => {
    if (state.tricks.length > seenTricks.current) {
      seenTricks.current = state.tricks.length
      const trick = state.tricks[state.tricks.length - 1]
      setSweep({ trick, stage: 'rest' })
      const t1 = setTimeout(() => {
        setSweep({ trick, stage: 'move' })
        sounds.trickSweep()
      }, REST_MS)
      const t2 = setTimeout(() => setSweep(null), REST_MS + SWEEP_MS)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
  }, [state.tricks.length, state.tricks])

  // Hand over: score it once the last sweep has finished.
  useEffect(() => {
    if (state.phase !== 'over' || sweep !== null || finished !== null) return
    const result = summarizeHand(state)
    const input = toHandInput(state, PLAYER_IDS)
    const outcome = scoreHand(totals, input)
    setFinished({ result, outcome, before: totals })
    setTotals(outcome.totals)
    if (result.bid === 'moon' && result.moonMade) sounds.moonMade()
    else if (result.made) sounds.made()
    else sounds.set()
  }, [state, sweep, finished, totals, PLAYER_IDS])

  // Bots take their turn after a short pause.
  useEffect(() => {
    if (busy || state.phase === 'over') return
    const seat = state.turnSeat
    if (seat === ME && !AUTOPILOT) return
    const timer = setTimeout(() => {
      if (state.phase === 'bidding') act({ type: 'bid', seat, bid: botBid(state, seat, rng) })
      else if (state.phase === 'overshoot') act({ type: 'overshoot', seat, accept: rng() < 0.15 })
      else if (state.phase === 'nest') act({ type: 'discard', seat, cards: botDiscard(state, seat) })
      else if (state.phase === 'trump') act({ type: 'trump', seat, trump: botTrump(state, seat) })
      else if (state.phase === 'playing') act({ type: 'play', seat, card: botPlay(state, seat, rng) })
    }, BOT_DELAY + rng() * 500)
    return () => clearTimeout(timer)
  }, [state, busy, act, rng, AUTOPILOT])

  // Chime when it becomes my move.
  const lastTurnRef = useRef<string>('')
  useEffect(() => {
    const key = `${state.phase}:${state.turnSeat}:${state.trick.plays.length}`
    if (!busy && state.turnSeat === ME && state.phase !== 'over' && lastTurnRef.current !== key) {
      lastTurnRef.current = key
      sounds.yourTurn()
    }
  }, [state, busy])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const myTurn = !busy && !AUTOPILOT && state.turnSeat === ME && state.phase !== 'over'

  // 30-second clock on my decisions; when it runs out the bot logic picks for me.
  const decisionKey = `${state.phase}:${state.tricks.length}:${state.trick.plays.length}:${state.bidding.calls.length}`
  useEffect(() => {
    if (!myTurn) {
      setSecondsLeft(null)
      return
    }
    const deadline = Date.now() + TURN_LIMIT_MS
    setSecondsLeft(TURN_LIMIT_MS / 1000)
    const tick = setInterval(() => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 250)
    const fire = setTimeout(() => {
      const s = stateRef.current
      setSelected([])
      setToast('Time ran out. The table played for you.')
      if (s.phase === 'bidding') act({ type: 'bid', seat: ME, bid: botBid(s, ME, rng) })
      else if (s.phase === 'overshoot') act({ type: 'overshoot', seat: ME, accept: false })
      else if (s.phase === 'nest') act({ type: 'discard', seat: ME, cards: botDiscard(s, ME) })
      else if (s.phase === 'trump') act({ type: 'trump', seat: ME, trump: botTrump(s, ME) })
      else if (s.phase === 'playing') act({ type: 'play', seat: ME, card: botPlay(s, ME, rng) })
    }, TURN_LIMIT_MS)
    return () => {
      clearInterval(tick)
      clearTimeout(fire)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, decisionKey, act, rng])
  const exchanging = state.phase === 'nest' && myTurn
  const legal = state.phase === 'playing' && myTurn ? legalPlays(state, ME) : exchanging ? state.hands[ME] : []
  const bidOptions: BidAction[] = state.phase === 'bidding' && myTurn ? legalBids(state, ME) : []

  const onSelect = (card: CardId) => {
    unlockAudio()
    if (exchanging) {
      // Pick the cards to lay down; tap again to put one back.
      setSelected((sel) => (sel.includes(card) ? sel.filter((c) => c !== card) : sel.length < state.nestPickedUp ? [...sel, card] : sel))
      return
    }
    if (selected[0] === card) {
      setSelected([])
      act({ type: 'play', seat: ME, card })
    } else setSelected([card])
  }
  const playSelected = () => {
    const card = selected[0]
    if (!card) return
    setSelected([])
    act({ type: 'play', seat: ME, card })
  }
  const layDown = () => {
    const cards = selected
    setSelected([])
    act({ type: 'discard', seat: ME, cards })
  }

  const nextHand = () => {
    if (finished && teamsAtTarget(finished.outcome.totals).length > 0) {
      setTotals({ A: 0, B: 0 })
      setHandNumber(1)
      const d = LAST
      setDealerSeat(d)
      setState(newHand(d))
    } else {
      const d = (dealerSeat + 1) % HANDEDNESS
      setDealerSeat(d)
      setHandNumber((n) => n + 1)
      setState(newHand(d))
    }
    seenTricks.current = 0
    setFinished(null)
    setSelected([])
    sounds.deal()
  }

  const gameOver: TeamId | null = (() => {
    if (!finished) return null
    const at = teamsAtTarget(finished.outcome.totals)
    if (at.length === 0) return null
    if (at.length === 1) return at[0]
    return finished.outcome.totals.A >= finished.outcome.totals.B ? 'A' : 'B'
  })()

  const bubbles = useMemo(() => bubblesFor(state, busy), [state, busy])
  const status = statusText(state, myTurn, busy, selected, SEATS)
  const live = tallies(state)
  const bidLabel = state.bid === null
    ? state.bidding.highBid === null ? 'No bid' : `${state.bidding.highBid === 'moon' ? 'Moon' : state.bidding.highBid} · ${SEATS[state.bidding.highSeat!].name}`
    : `${state.bid === 'moon' ? 'Moon' : state.bid} · ${SEATS[state.bidderSeat!].name}`

  return (
    <div className="table-page" onPointerDownCapture={unlockAudio}>
      <header className="table-top">
        <Link className="icon-btn light" to="/play" aria-label="Leave table">‹</Link>
        <div className="table-title">
          <div className="hand-no">Hand {handNumber}</div>
          <div className="scores">
            <span className="score team-A">{totals.A}</span>
            <span className="score-sep">·</span>
            <span className="score team-B">{totals.B}</span>
          </div>
        </div>
        <span className="top-chip">{bidLabel}</span>
        <TrumpChip trump={state.trump} />
        <button
          type="button"
          className="icon-btn light"
          aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
          onClick={() => {
            unlockAudio()
            setMuted(!muted)
            setMutedState(!muted)
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </header>

      <Table state={state} me={ME} seats={SEATS} bubbles={bubbles} sweep={sweep} />

      {myTurn && secondsLeft !== null && (
        <div className="turn-bar" aria-hidden>
          <div className={secondsLeft <= 10 ? 'urgent' : ''} style={{ width: `${(secondsLeft / (TURN_LIMIT_MS / 1000)) * 100}%` }} />
        </div>
      )}
      <div className="live-tally" aria-label="Points this hand">
        <span className="team-A">{TEAM_NAMES.A} {live.points.A}</span>
        <span className="team-B">{TEAM_NAMES.B} {live.points.B}</span>
      </div>

      <div className="my-area">
        <div className="my-row">
          <SeatBadge info={SEATS[ME]} dealer={state.dealerSeat === ME} bidder={state.bidderSeat === ME} turn={myTurn} size="lg" />
          <div className="my-status">
            {status}
            {myTurn && secondsLeft !== null && (
              <span className={`turn-clock${secondsLeft <= 10 ? ' urgent' : ''}`} aria-label={`${secondsLeft} seconds left`}>
                {secondsLeft}s
              </span>
            )}
          </div>
          {state.phase === 'playing' && myTurn && selected.length > 0 && (
            <button type="button" className="btn primary play-btn" onClick={playSelected}>Play</button>
          )}
        </div>

        {state.phase === 'bidding' && myTurn && <BidPanel state={state} options={bidOptions} onBid={(b) => act({ type: 'bid', seat: ME, bid: b })} seats={SEATS} />}
        {state.phase === 'overshoot' && myTurn && (
          <OvershootPanel shooter={SEATS[state.bidding.highSeat!].name} onChoose={(accept) => act({ type: 'overshoot', seat: ME, accept })} />
        )}
        {exchanging && (
          <KittyPanel bid={state.bid === 'moon' ? 'Moon' : String(state.bid)} picked={state.nestPickedUp} chosen={selected.length} onLayDown={layDown} />
        )}
        {state.phase === 'trump' && myTurn && <TrumpPanel onChoose={(t) => act({ type: 'trump', seat: ME, trump: t })} />}

        <HandFan
          cards={state.hands[ME]}
          trump={state.trump}
          legal={legal}
          selected={selected}
          onSelect={onSelect}
          disabled={!(state.phase === 'playing' || state.phase === 'nest') || !myTurn}
        />
      </div>

      {toast && <div className="toast">{toast}</div>}

      {finished && (
        <HandSummary
          result={finished.result}
          outcome={finished.outcome}
          bidderName={SEATS[state.bidderSeat!].name}
          seats={SEATS}
          totalsBefore={finished.before}
          teamNames={TEAM_NAMES}
          gameOver={gameOver}
          onNext={nextHand}
        />
      )}
    </div>
  )
}

function statusText(state: HandState, myTurn: boolean, busy: boolean, selected: CardId[], seats: SeatInfo[]): string {
  if (state.phase === 'over') return 'Hand over'
  if (busy) return ''
  const who = seats[state.turnSeat].name
  switch (state.phase) {
    case 'bidding':
      return myTurn ? 'Your bid' : `${who} is bidding…`
    case 'overshoot':
      return myTurn ? 'Overshoot?' : `${who} is deciding…`
    case 'nest':
      return myTurn ? 'Pick cards to lay down' : `${who} is sorting the Kitty…`
    case 'trump':
      return myTurn ? 'Name trump' : `${who} is picking trump…`
    case 'playing': {
      if (!myTurn) return `${who} is thinking…`
      if (selected.length) return 'Tap again or press Play'
      const lead = state.trick.plays[0]
      if (!lead) return 'Your lead'
      return 'Your turn'
    }
  }
}

function bubblesFor(state: HandState, busy: boolean): Record<number, ReactNode> {
  const out: Record<number, ReactNode> = {}
  if (state.phase === 'nest' && state.bidderSeat !== null && state.turnSeat !== ME) {
    out[state.bidderSeat] = '🃏 Kitty…'
  } else if (state.phase === 'bidding' || state.phase === 'overshoot' || state.phase === 'trump') {
    const last = new Map<number, BidAction>()
    for (const c of state.bidding.calls) last.set(c.seat, c.bid)
    for (const [seat, b] of last) out[seat] = b === 'pass' ? 'Pass' : b === 'moon' ? '🌙 Moon' : String(b)
  } else if (state.phase === 'playing' && !busy && state.trick.plays.length === 0 && state.tricks.length === 0 && state.bidderSeat !== null) {
    out[state.bidderSeat] = state.bid === 'moon' ? '🌙 Moon' : `Bid ${state.bid}`
  }
  if (!busy && state.phase !== 'over' && state.turnSeat !== ME) out[state.turnSeat] = out[state.turnSeat] ?? '…'
  return out
}
