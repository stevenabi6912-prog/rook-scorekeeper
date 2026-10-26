import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { botDecision } from '../../game/bots'
import type { CardId } from '../../game/cards'
import { cardLabel } from './Card'
import { applyAction, canClaimRest, legalBids, legalPlays, playableCards, type Action, type BidAction, type HandState } from '../../game/engine'
import type { Rng } from '../../game/rng'
import { tallies, type HandResult } from '../../game/score'
import type { HandOutcome, Scores } from '../../lib/scoring'
import type { TeamId } from '../../lib/types'
import { isMuted, setMuted, sounds, unlockAudio } from '../sound'
import { HandFan } from './Hand'
import { BidPanel, HandSummary, KittyPanel, OvershootPanel, TrumpChip, TrumpPanel } from './Panels'
import { SeatBadge, Table, type SeatInfo, type Sweep } from './Table'
import '../play.css'

/*
 * The table screen itself, shared by the practice table and the online
 * table. It renders one seat's view of a hand and turns taps into actions;
 * where the actions go (the local engine, or Firestore) is the caller's
 * business. Sounds are derived from how the state changes, so moves made
 * on other phones sound the same as moves made here.
 */

export interface Finished {
  result: HandResult
  outcome: HandOutcome
  before: Scores
}

export interface TableViewProps {
  /** This seat's view of the hand (other seats' cards may be UNKNOWN). */
  state: HandState
  me: number
  seats: SeatInfo[]
  teamNames: Record<TeamId, string>
  totals: Scores
  handNumber: number
  /** Commit an action. A rejected promise or thrown error is shown as a toast. */
  act: (action: Action) => void | Promise<void>
  rng: Rng
  /** Milliseconds a person gets per decision before the table decides for them. */
  turnLimitMs: number
  /** When the current decision started according to whoever moved last. Only a hint:
   *  the clock runs from when THIS phone first sees its turn, so other devices'
   *  clocks and network lag cannot shorten it. */
  turnStartedAt?: number
  /** The computer plays this seat (watching, testing). */
  autopilot?: boolean
  /** Scored result of a finished hand; the summary shows once the last trick has been swept. */
  finished: Finished | null
  gameOver: TeamId | null
  /** Advance to the next hand; absent when someone else (the host) does that. */
  onNext?: () => void
  /** Who we are waiting on, when onNext is absent. */
  waitingFor?: string
  backTo: string
  /** A line under the status, e.g. "Waiting for Steven's phone to move Hank". */
  notice?: string | null
  /** Tells the controller when an animation is holding the table (so bots can wait). */
  onBusyChange?: (busy: boolean) => void
}

const REST_MS = 900
const SWEEP_MS = 450
const REVEAL_MS = 2800

export function TableView(props: TableViewProps) {
  const { state: serverState, me, seats, teamNames, totals, handNumber, act, rng, turnLimitMs, autopilot, finished, gameOver, onNext, waitingFor, backTo, notice, onBusyChange } = props
  // A move shows on screen the instant it is made; the server's view replaces
  // it when the next snapshot arrives (or the move is refused).
  const [optimistic, setOptimistic] = useState<HandState | null>(null)
  useEffect(() => setOptimistic(null), [serverState])
  const state = optimistic ?? serverState
  const [selected, setSelected] = useState<CardId[]>([])
  const [sweep, setSweep] = useState<Sweep | null>(null)
  const [muted, setMutedState] = useState(isMuted())
  const [toast, setToast] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const seenTricks = useRef(state.tricks.length)
  const prevRef = useRef<HandState | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  // Thrown-in cards stay on the table for a moment before the summary.
  const [revealing, setRevealing] = useState(false)
  const revealKey = state.claimedBySeat !== null ? `${handNumber}:${state.claimedBySeat}` : ''
  useEffect(() => {
    if (!revealKey) {
      setRevealing(false)
      return
    }
    setRevealing(true)
    const t = setTimeout(() => setRevealing(false), REVEAL_MS)
    return () => clearTimeout(t)
  }, [revealKey])
  // Hands recorded before claimedCards existed have none to show.
  const reveal = revealing && state.claimedBySeat !== null ? { seat: state.claimedBySeat, cards: state.claimedCards ?? [] } : null

  const busy = sweep !== null || revealing
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange])

  const run = (action: Action) => {
    // Show the move at once when this phone can work it out; some moves (picking
    // up the Kitty, whose cards only the server holds) cannot be previewed here,
    // so the move is always sent and the server has the final say.
    const preview = applyAction(state, action)
    if (preview.ok) setOptimistic(preview.state)
    try {
      const r = act(action)
      if (r && typeof (r as Promise<void>).catch === 'function') {
        ;(r as Promise<void>).catch((e: unknown) => {
          setOptimistic(null)
          setToast(errorText(e))
        })
      }
    } catch (e) {
      setOptimistic(null)
      setToast(errorText(e))
    }
  }

  // Sounds from how the state changed, whoever changed it.
  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = state
    if (!prev) return
    const calls = state.bidding.calls
    if (calls.length > prev.bidding.calls.length) {
      const last = calls[calls.length - 1].bid
      if (last === 'pass') sounds.pass()
      else if (last === 'moon') sounds.moonBid()
      else sounds.bid()
    }
    if (prev.phase === 'nest' && state.phase === 'trump') sounds.trickSweep()
    if (prev.nestPickedUp === 0 && state.nestPickedUp > 0) sounds.deal()
    if (prev.trump === null && state.trump !== null) sounds.trump()
    if (state.trick.plays.length > prev.trick.plays.length) sounds.cardSlide()
    if (state.phase === 'over' && prev.phase !== 'over' && state.claimedBySeat !== null) sounds.trickSweep()
  }, [state])

  // Sweep timers live in a ref so a later state change (a claim right after a
  // trick, say) can replace or cancel them without leaving the table stuck.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const clearSweepTimers = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }
  useEffect(() => clearSweepTimers, [])

  // New hand: forget the old sweep bookkeeping.
  useEffect(() => {
    if (state.tricks.length === 0) {
      seenTricks.current = 0
      clearSweepTimers()
      setSweep(null)
    }
  }, [handNumber, state.tricks.length])

  // Trick completed: rest, then sweep to the winner.
  useEffect(() => {
    if (state.tricks.length <= seenTricks.current) return
    seenTricks.current = state.tricks.length
    clearSweepTimers()
    // A claim ends the hand with synthetic tricks; nothing to animate.
    if (state.claimedBySeat !== null) {
      setSweep(null)
      return
    }
    const trick = state.tricks[state.tricks.length - 1]
    setSweep({ trick, stage: 'rest' })
    timersRef.current.push(
      setTimeout(() => {
        setSweep({ trick, stage: 'move' })
        sounds.trickSweep()
      }, REST_MS),
      setTimeout(() => setSweep(null), REST_MS + SWEEP_MS),
    )
  }, [state.tricks.length, state.tricks, state.claimedBySeat])

  // Result sounds once the summary appears.
  const showSummary = finished !== null && !busy
  const summaryKey = showSummary ? `${handNumber}` : ''
  const lastSummaryRef = useRef('')
  useEffect(() => {
    if (!showSummary || !finished || lastSummaryRef.current === summaryKey) return
    lastSummaryRef.current = summaryKey
    if (finished.result.bid === 'moon' && finished.result.moonMade) sounds.moonMade()
    else if (finished.result.made) sounds.made()
    else sounds.set()
  }, [showSummary, summaryKey, finished])

  const myTurn = !busy && !autopilot && finished === null && state.turnSeat === me && state.phase !== 'over'

  // Chime when it becomes my move.
  const lastTurnRef = useRef('')
  useEffect(() => {
    const key = `${handNumber}:${state.phase}:${state.turnSeat}:${state.trick.plays.length}:${state.bidding.calls.length}:${state.nestPickedUp}`
    if (myTurn && lastTurnRef.current !== key) {
      lastTurnRef.current = key
      sounds.yourTurn()
    }
  }, [myTurn, state, handNumber])

  // The Kitty comes into my hand as soon as I win the bid.
  useEffect(() => {
    if (myTurn && state.phase === 'nest' && state.nestPickedUp === 0) run({ type: 'pickup', seat: me })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, state.phase, state.nestPickedUp, me])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  // Clock on my decisions, from the moment this phone sees it is my turn;
  // when it runs out the bot logic decides for me.
  const decisionKey = `${handNumber}:${state.phase}:${state.tricks.length}:${state.trick.plays.length}:${state.bidding.calls.length}:${state.nestPickedUp}`
  useEffect(() => {
    if (!myTurn) {
      setSecondsLeft(null)
      return
    }
    const deadline = Date.now() + turnLimitMs
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    update()
    const tick = setInterval(update, 250)
    const fire = setTimeout(() => {
      const s = stateRef.current
      setSelected([])
      const action = botDecision(s, me, rng, { overshootAccept: false })
      if (action) {
        setToast('Time ran out. The table decided for you.')
        run(action)
      }
    }, Math.max(0, deadline - Date.now()))
    return () => {
      clearInterval(tick)
      clearTimeout(fire)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, decisionKey, turnLimitMs, me])

  const exchanging = state.phase === 'nest' && myTurn && state.nestPickedUp > 0
  const claimable = myTurn && canClaimRest(state, me)
  // Pre-play: while waiting on others you can line up the card you mean to play.
  const prePlay = state.phase === 'playing' && !myTurn && !busy && !autopilot && finished === null && state.turnSeat !== me
  const legal = state.phase === 'playing' && myTurn ? legalPlays(state, me) : prePlay ? playableCards(state, me) : exchanging ? state.hands[me] : []
  const bidOptions: BidAction[] = state.phase === 'bidding' && myTurn ? legalBids(state, me) : []

  // A queued card plays itself the moment it is your turn, if it is still legal.
  const queued = prePlay || (myTurn && state.phase === 'playing') ? selected[0] ?? null : null
  useEffect(() => {
    if (!myTurn || state.phase !== 'playing' || !queued) return
    if (!legalPlays(state, me).includes(queued)) {
      setSelected([])
      setToast(`${cardLabel(queued)} is not legal for this trick`)
      return
    }
    const t = setTimeout(() => {
      setSelected([])
      run({ type: 'play', seat: me, card: queued })
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, state.phase, queued, decisionKey])

  const onSelect = (card: CardId) => {
    unlockAudio()
    if (exchanging) {
      setSelected((sel) => (sel.includes(card) ? sel.filter((c) => c !== card) : sel.length < state.nestPickedUp ? [...sel, card] : sel))
      return
    }
    if (prePlay) {
      setSelected((sel) => (sel[0] === card ? [] : [card]))
      return
    }
    if (selected[0] === card) {
      setSelected([])
      run({ type: 'play', seat: me, card })
    } else setSelected([card])
  }
  const playSelected = () => {
    const card = selected[0]
    if (!card) return
    setSelected([])
    run({ type: 'play', seat: me, card })
  }
  const layDown = () => {
    const cards = selected
    setSelected([])
    run({ type: 'discard', seat: me, cards })
  }

  const bubbles = useMemo(() => bubblesFor(state, busy, me), [state, busy, me])
  const status = prePlay && selected[0] ? `Queued: ${cardLabel(selected[0])}` : statusText(state, myTurn, busy, selected, seats, me)
  const live = tallies(state)
  const bidLabel = state.bid === null
    ? state.bidding.highBid === null ? 'No bid' : `${state.bidding.highBid === 'moon' ? 'Moon' : state.bidding.highBid} · ${seats[state.bidding.highSeat!].name}`
    : `${state.bid === 'moon' ? 'Moon' : state.bid} · ${seats[state.bidderSeat!].name}`

  return (
    <div className="table-page" onPointerDownCapture={unlockAudio} onTouchStartCapture={unlockAudio}>
      <header className="table-top">
        <Link className="icon-btn light" to={backTo} aria-label="Leave table">‹</Link>
        <div className="table-title">
          <div className="hand-no">Hand {handNumber}</div>
          <div className="scores">
            <span className="score team-A">{totals.A}</span>
            <span className="score-sep">·</span>
            <span className="score team-B">{totals.B}</span>
          </div>
        </div>
        {(state.bid !== null || state.bidding.highBid !== null) && <span className="top-chip">{bidLabel}</span>}
        <TrumpChip trump={state.trump} />
        <button
          type="button"
          className="icon-btn light"
          aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
          onClick={() => {
            unlockAudio()
            const next = !muted
            setMuted(next)
            setMutedState(next)
            // A chime on unmute, so you can hear at once whether sound works on this phone.
            if (!next) setTimeout(() => sounds.yourTurn(), 50)
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </header>

      <Table state={state} me={me} seats={seats} bubbles={bubbles} sweep={sweep} reveal={reveal} />

      {myTurn && secondsLeft !== null && (
        <div className="turn-bar" aria-hidden>
          <div className={secondsLeft <= 10 ? 'urgent' : ''} style={{ width: `${(secondsLeft / (turnLimitMs / 1000)) * 100}%` }} />
        </div>
      )}
      <div className="live-tally" aria-label="Points this hand">
        <span className="team-A">{teamNames.A} {live.points.A}</span>
        <span className="team-B">{teamNames.B} {live.points.B}</span>
      </div>

      <div className="my-area">
        <div className="my-row">
          <SeatBadge info={seats[me]} dealer={state.dealerSeat === me} bidder={state.bidderSeat === me} turn={myTurn} size="lg" />
          <div className="my-status">
            {status}
            {myTurn && secondsLeft !== null && (
              <span className={`turn-clock${secondsLeft <= 10 ? ' urgent' : ''}`} aria-label={`${secondsLeft} seconds left`}>
                {secondsLeft}s
              </span>
            )}
            {notice && <div className="my-notice">{notice}</div>}
          </div>
          {claimable && (
            <button type="button" className="btn claim-btn" onClick={() => run({ type: 'claim', seat: me })}>
              Throw cards in
            </button>
          )}
          {state.phase === 'playing' && myTurn && selected.length > 0 && (
            <button type="button" className="btn primary play-btn" onClick={playSelected}>Play</button>
          )}
        </div>

        {state.phase === 'bidding' && myTurn && <BidPanel state={state} options={bidOptions} onBid={(b) => run({ type: 'bid', seat: me, bid: b })} seats={seats} />}
        {state.phase === 'overshoot' && myTurn && (
          <OvershootPanel shooter={seats[state.bidding.highSeat!].name} onChoose={(accept) => run({ type: 'overshoot', seat: me, accept })} />
        )}
        {exchanging && (
          <KittyPanel bid={state.bid === 'moon' ? 'Moon' : String(state.bid)} picked={state.nestPickedUp} chosen={selected.length} onLayDown={layDown} />
        )}
        {state.phase === 'trump' && myTurn && <TrumpPanel onChoose={(t) => run({ type: 'trump', seat: me, trump: t })} />}

        <HandFan
          cards={state.hands[me]}
          trump={state.trump}
          legal={legal}
          selected={selected}
          onSelect={onSelect}
          disabled={!((state.phase === 'playing' && (myTurn || prePlay)) || exchanging)}
        />
      </div>

      {toast && <div className="toast">{toast}</div>}

      {showSummary && finished && (
        <HandSummary
          result={finished.result}
          outcome={finished.outcome}
          bidderName={state.bidderSeat === null ? '?' : seats[state.bidderSeat].name}
          seats={seats}
          totalsBefore={finished.before}
          teamNames={teamNames}
          gameOver={gameOver}
          onNext={onNext}
          waitingFor={waitingFor}
        />
      )}
    </div>
  )
}

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message
  return typeof e === 'string' ? e : 'That move did not go through.'
}

function statusText(state: HandState, myTurn: boolean, busy: boolean, selected: CardId[], seats: SeatInfo[], me: number): string {
  if (state.phase === 'over') return 'Hand over'
  if (busy) return ''
  const who = seats[state.turnSeat].name
  switch (state.phase) {
    case 'bidding':
      return myTurn ? 'Your bid' : `${who} is bidding…`
    case 'overshoot':
      return myTurn ? 'Overshoot?' : `${who} is deciding…`
    case 'nest':
      return myTurn ? (state.nestPickedUp > 0 ? 'Pick cards to lay down' : 'Picking up the Kitty…') : `${who} is sorting the Kitty…`
    case 'trump':
      return myTurn ? 'Name trump' : `${who} is picking trump…`
    case 'playing': {
      if (!myTurn) return `${who} is thinking…`
      if (selected.length) return 'Tap again or press Play'
      if (canClaimRest(state, me)) return 'Nobody can beat you now'
      const lead = state.trick.plays[0]
      if (!lead) return 'Your lead'
      return 'Your turn'
    }
  }
}

function bubblesFor(state: HandState, busy: boolean, me: number): Record<number, ReactNode> {
  const out: Record<number, ReactNode> = {}
  if (state.phase === 'nest' && state.bidderSeat !== null && state.turnSeat !== me) {
    out[state.bidderSeat] = '🃏 Kitty…'
  } else if (state.phase === 'bidding' || state.phase === 'overshoot' || state.phase === 'trump') {
    const last = new Map<number, BidAction>()
    for (const c of state.bidding.calls) last.set(c.seat, c.bid)
    for (const [seat, b] of last) out[seat] = b === 'pass' ? 'Pass' : b === 'moon' ? '🌙 Moon' : String(b)
  } else if (state.phase === 'playing' && !busy && state.trick.plays.length === 0 && state.tricks.length === 0 && state.bidderSeat !== null) {
    out[state.bidderSeat] = state.bid === 'moon' ? '🌙 Moon' : `Bid ${state.bid}`
  }
  if (!busy && state.phase !== 'over' && state.turnSeat !== me) out[state.turnSeat] = out[state.turnSeat] ?? '…'
  return out
}
