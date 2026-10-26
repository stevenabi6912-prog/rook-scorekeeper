import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { botDecision } from '../../game/bots'
import type { CardId } from '../../game/cards'
import { applyAction, startHand, type Action, type HandState } from '../../game/engine'
import { randomSeed, seededRng } from '../../game/rng'
import { FAMILY_RULES } from '../../game/rules'
import { summarizeHand, toHandInput } from '../../game/score'
import { scoreHand, teamsAtTarget, type Scores } from '../../lib/scoring'
import type { Handedness, TeamId } from '../../lib/types'
import type { SeatInfo } from '../components/Table'
import { TableView, type Finished } from '../components/TableView'
import { sounds } from '../sound'

/*
 * Practice table: you at seat 0 against computer players, all on this phone.
 * No network, nothing saved. The TableView is the same one the online table
 * uses; here the moves just go straight into the engine.
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

export function joinNames(list: string[]): string {
  return list.length <= 1 ? (list[0] ?? '') : list.slice(0, -1).join(', ') + ' & ' + list.slice(-1)
}

function tableConfig(handedness: Handedness, autopilot: boolean): TableConfig {
  const seats = ALL_SEATS.slice(0, handedness)
  const names = (team: TeamId) => seats.filter((s) => s.team === team).map((s) => s.name)
  return {
    handedness,
    seats,
    teamNames: { A: joinNames(names('A')), B: joinNames(names('B')) },
    playerIds: seats.map((s) => `demo-${s.name.toLowerCase()}`),
    teams: seats.map((s) => s.team),
    autopilot,
  }
}

const BOT_DELAY = 750
/** A person gets this long per decision; then the table picks for them. */
export const TURN_LIMIT_MS = 60_000

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
  const { handedness, seats, teamNames, playerIds, teams, autopilot } = cfg
  const last = handedness - 1
  const rng = useMemo(() => seededRng(randomSeed()), [])
  const newHand = useCallback(
    (dealer: number) => startHand({ rules: FAMILY_RULES, handedness, teams, dealerSeat: dealer, seed: randomSeed() }),
    [handedness, teams],
  )
  const [dealerSeat, setDealerSeat] = useState(last)
  const [handNumber, setHandNumber] = useState(1)
  const [totals, setTotals] = useState<Scores>({ A: 0, B: 0 })
  const [state, setState] = useState<HandState>(() => newHand(last))
  const [busy, setBusy] = useState(false)

  const act = useCallback((action: Action) => {
    const r = applyAction(state, action)
    if (!r.ok) throw new Error(r.error)
    setState(r.state)
  }, [state])

  // Score the hand the moment it ends; the view shows it after the last sweep.
  const finished = useMemo<Finished | null>(() => {
    if (state.phase !== 'over') return null
    const result = summarizeHand(state)
    const outcome = scoreHand(totals, toHandInput(state, playerIds))
    return { result, outcome, before: totals }
  }, [state, totals, playerIds])

  // Bots take their turn after a short pause.
  useEffect(() => {
    if (busy || state.phase === 'over') return
    const seat = state.turnSeat
    if (seat === ME && !autopilot) return
    const timer = setTimeout(() => {
      const action = botDecision(state, seat, rng)
      if (action) {
        const r = applyAction(state, action)
        if (r.ok) setState(r.state)
      }
    }, BOT_DELAY + rng() * 500)
    return () => clearTimeout(timer)
  }, [state, busy, rng, autopilot])

  // On a throw-in every hand is known here: the cards sit in the synthetic tricks.
  const revealHands = useMemo<Record<number, CardId[]>>(() => {
    if (state.phase !== 'over' || state.claimedBySeat === null) return {}
    const synthetic = state.tricks.slice(state.tricks.length - (state.claimedCards?.length ?? 0))
    const out: Record<number, CardId[]> = {}
    for (const t of synthetic) for (const p of t.plays) if (p.seat !== state.claimedBySeat) (out[p.seat] ??= []).push(p.card)
    return out
  }, [state])

  const gameOver: TeamId | null = useMemo(() => {
    if (!finished) return null
    const at = teamsAtTarget(finished.outcome.totals)
    if (at.length === 0) return null
    if (at.length === 1) return at[0]
    return finished.outcome.totals.A >= finished.outcome.totals.B ? 'A' : 'B'
  }, [finished])

  const nextHand = () => {
    if (!finished) return
    if (gameOver) {
      setTotals({ A: 0, B: 0 })
      setHandNumber(1)
      setDealerSeat(last)
      setState(newHand(last))
    } else {
      setTotals(finished.outcome.totals)
      const d = (dealerSeat + 1) % handedness
      setDealerSeat(d)
      setHandNumber((n) => n + 1)
      setState(newHand(d))
    }
    sounds.deal()
  }

  return (
    <TableView
      state={state}
      me={ME}
      seats={seats}
      teamNames={teamNames}
      totals={totals}
      handNumber={handNumber}
      act={act}
      rng={rng}
      turnLimitMs={TURN_LIMIT_MS}
      autopilot={autopilot}
      finished={finished}
      gameOver={gameOver}
      onNext={nextHand}
      backTo="/play"
      onBusyChange={setBusy}
      revealHands={revealHands}
    />
  )
}
