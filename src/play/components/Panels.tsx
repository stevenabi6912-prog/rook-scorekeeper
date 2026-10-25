import { TrumpDot, TrumpPicker } from '../../components/TrumpPicker'
import type { BidAction, HandState } from '../../game/engine'
import type { HandResult } from '../../game/score'
import { type Suit } from '../../game/rules'
import type { HandOutcome } from '../../lib/scoring'
import type { TeamId } from '../../lib/types'
import { CARD_INK } from './Card'
import type { SeatInfo } from './Table'

export function BidPanel({
  state, options, onBid, seats,
}: { state: HandState; options: BidAction[]; onBid: (b: BidAction) => void; seats: SeatInfo[] }) {
  const numbers = options.filter((o): o is number => typeof o === 'number')
  const high = state.bidding.highBid
  const highSeat = state.bidding.highSeat
  const stuck = !options.includes('pass')
  return (
    <div className="action-panel">
      <div className="panel-title">
        {high === null
          ? stuck ? 'Everyone passed. You are stuck with 65.' : 'Your bid'
          : <>Bid is <strong>{high === 'moon' ? 'Moon' : high}</strong> by {seats[highSeat!].name}</>}
      </div>
      <div className="bid-grid">
        {numbers.map((b) => (
          <button key={b} type="button" className="bid-btn" onClick={() => onBid(b)}>
            {b}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        {options.includes('moon') && (
          <button type="button" className="btn moon grow" onClick={() => onBid('moon')}>🌙 Moon</button>
        )}
        {options.includes('pass') && (
          <button type="button" className="btn ghost-light grow" onClick={() => onBid('pass')}>Pass</button>
        )}
      </div>
    </div>
  )
}

export function OvershootPanel({ shooter, onChoose }: { shooter: string; onChoose: (accept: boolean) => void }) {
  return (
    <div className="action-panel">
      <div className="panel-title">
        <strong>{shooter}</strong> shot the Moon. As dealer you may overshoot and take it yourself.
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn moon grow" onClick={() => onChoose(true)}>🌙 Overshoot</button>
        <button type="button" className="btn ghost-light grow" onClick={() => onChoose(false)}>Let it go</button>
      </div>
    </div>
  )
}

export function TrumpPanel({ onChoose }: { onChoose: (s: Suit) => void }) {
  return (
    <div className="action-panel">
      <div className="panel-title">You won the bid. Name trump.</div>
      <TrumpPicker value={null} onChange={(t) => t && onChoose(t)} allowClear={false} size="grid" />
    </div>
  )
}

export function HandSummary({
  result, outcome, bidderName, seats, totalsBefore, teamNames, gameOver, onNext,
}: {
  result: HandResult
  outcome: HandOutcome
  bidderName: string
  seats: SeatInfo[]
  totalsBefore: Record<TeamId, number>
  teamNames: Record<TeamId, string>
  gameOver: TeamId | null
  onNext: () => void
}) {
  const bt = result.bidTeam
  const ot: TeamId = bt === 'A' ? 'B' : 'A'
  const headline = result.bid === 'moon'
    ? result.moonMade ? `${bidderName} made the Moon! 🌙` : `${bidderName} missed the Moon`
    : result.made ? `${teamNames[bt]} made ${result.bid}` : `${teamNames[bt]} set!`
  return (
    <div className="summary-backdrop">
      <div className={`summary-card ${result.made ? 'good' : 'bad'}`}>
        <div className="summary-headline">{headline}</div>
        <div className="summary-sub">
          Bid {result.bid === 'moon' ? 'Moon' : result.bid} · took {result.pointsByTeam[bt]} of 120 · {result.tricksByTeam[bt]} tricks
        </div>
        <div className="summary-teams">
          {([bt, ot] as TeamId[]).map((t) => (
            <div key={t} className={`summary-team team-${t}`}>
              <div className="summary-team-name">{teamNames[t]}</div>
              <div className="summary-points">{result.pointsByTeam[t]} pts</div>
              <div className="summary-total">
                {totalsBefore[t]} → <strong>{outcome.totals[t]}</strong>
                <span className={`delta ${outcome.delta[t] >= 0 ? 'pos' : 'neg'}`}>
                  {outcome.delta[t] >= 0 ? '+' : ''}{outcome.delta[t]}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="summary-seats">
          {seats.map((s, i) => (
            <span key={i} className={`badge team-${s.team}`}>{s.name}</span>
          ))}
        </div>
        {gameOver ? (
          <>
            <div className="summary-headline" style={{ marginTop: 12 }}>🏆 {teamNames[gameOver]} win the game!</div>
            <button type="button" className="btn primary big block" onClick={onNext}>New game</button>
          </>
        ) : (
          <button type="button" className="btn primary big block" onClick={onNext}>Next hand</button>
        )}
      </div>
    </div>
  )
}

export function TrumpChip({ trump }: { trump: Suit | null }) {
  if (!trump) return <span className="top-chip muted-chip">Trump ?</span>
  return (
    <span className="top-chip trump-pill" style={{ background: CARD_INK[trump] }}>
      <TrumpDot trump={trump} /> {trump.toUpperCase()} TRUMP
    </span>
  )
}
