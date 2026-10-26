import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { TeamId } from '../../lib/types'
import type { CardId } from '../../game/cards'
import { exposedNestCard, type HandState, type TakenTrick } from '../../game/engine'
import { CARD_INK, Card, CardStack, cardLabel } from './Card'

export interface SeatInfo {
  name: string
  emoji?: string
  color: string
  team: TeamId
}

export interface Sweep {
  trick: TakenTrick
  stage: 'rest' | 'move'
}

interface TableProps {
  state: HandState
  me: number
  seats: SeatInfo[]
  /** Speech bubble per seat (last bid, "thinking…", etc.). */
  bubbles: Record<number, ReactNode>
  sweep: Sweep | null
  /** Cards on the table when a hand ends on a throw-in: every seat's remaining cards, face up. */
  reveal: { hands: Record<number, CardId[]>; claimer: number } | null
}

/** Where seat `k` (relative to me, clockwise) sits, as a fraction of the table. */
export function seatPosition(k: number, n: number): { x: number; y: number } {
  const angle = Math.PI / 2 + (k * 2 * Math.PI) / n
  const rx = n > 4 ? 0.36 : 0.37
  const ry = n > 4 ? 0.36 : 0.4
  return { x: 0.5 + rx * Math.cos(angle), y: 0.5 + ry * Math.sin(angle) }
}

/** Where the Kitty sits once it belongs to the bidder: tucked in beside their seat. */
function kittyStyle(k: number, n: number): React.CSSProperties {
  if (k === 0) return { left: '14%', top: '86%' }
  const pos = seatPosition(k, n)
  const toward = { x: 0.5 - pos.x, y: 0.5 - pos.y }
  return { left: `${(pos.x + toward.x * 0.42) * 100}%`, top: `${(pos.y + toward.y * 0.12) * 100}%` }
}

function trickPosition(k: number, n: number): { x: number; y: number } {
  const angle = Math.PI / 2 + (k * 2 * Math.PI) / n
  return { x: 0.5 + 0.17 * Math.cos(angle), y: 0.5 + 0.16 * Math.sin(angle) }
}

function useSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 360, h: 360 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, size }
}

export function Table({ state, me, seats, bubbles, sweep, reveal }: TableProps) {
  const n = state.handedness
  const rel = (seat: number) => (seat - me + n) % n
  const { ref, size } = useSize()
  const cardW = Math.max(54, Math.min(84, Math.floor(size.w / 5)))
  const exposed = exposedNestCard(state)

  // Same keys whether the trick is live or being swept, so the cards already
  // on the table stay put and only the newest one animates in.
  const plays: { seat: number; card: CardId; key: string }[] = (sweep ? sweep.trick.plays : state.trick.plays).map((p) => ({ ...p, key: `card-${p.card}` }))
  const lastPlayed = plays.length ? plays[plays.length - 1].card : null

  // The Kitty: centre of the table while bidding; beside whoever won the bid after that.
  const kittyWithBidder = state.bidderSeat !== null && state.phase !== 'bidding' && state.phase !== 'overshoot'
  const showKitty = state.nest.length > 0 && !state.tricks.some((t) => t.tookNest) && (kittyWithBidder || plays.length === 0)

  return (
    <div className="table-area" ref={ref} style={state.trump ? { ['--trump' as string]: CARD_INK[state.trump] } : undefined}>
      <div className={`felt-edge${state.trump ? ' has-trump' : ''}`} aria-hidden />

      {seats.map((info, seat) => {
        const k = rel(seat)
        if (k === 0) return null
        const pos = seatPosition(k, n)
        const isTurn = state.turnSeat === seat && state.phase !== 'over'
        return (
          <div
            key={seat}
            className={`seat-spot k${k} n${n}${isTurn ? ' turn' : ''}`}
            style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
          >
            <SeatBadge info={info} dealer={state.dealerSeat === seat} bidder={state.bidderSeat === seat} turn={isTurn} />
            <CardStack count={state.hands[seat].length} width={Math.round(cardW * 0.42)} />
            {bubbles[seat] && <div className="bubble">{bubbles[seat]}</div>}
          </div>
        )
      })}

      {showKitty && (
        <div
          className={`kitty${kittyWithBidder ? ' with-bidder' : ''}`}
          style={kittyWithBidder ? kittyStyle(rel(state.bidderSeat!), n) : undefined}
          aria-label={`Kitty, ${state.nest.length} cards${exposed ? `, ${cardLabel(exposed)} showing` : ''}`}
        >
          <CardStack count={state.nest.length} width={Math.round(cardW * (kittyWithBidder ? 0.3 : exposed ? 0.6 : 0.38))} topCard={kittyWithBidder ? null : exposed} />
          <span className="kitty-label">Kitty</span>
        </div>
      )}

      {reveal && Object.entries(reveal.hands).flatMap(([seatStr, cards]) => {
        const seat = Number(seatStr)
        const k = rel(seat)
        const to = trickPosition(k, n)
        const from = seatPosition(k, n)
        const isClaimer = seat === reveal.claimer
        const w = Math.round(cardW * (isClaimer ? 0.72 : 0.56))
        const step = Math.min(w * 0.5, (size.w * 0.9) / Math.max(1, cards.length))
        return cards.map((card, i) => {
          const spread = (i - (cards.length - 1) / 2) * step
          return (
            <div
              key={`reveal-${seat}-${card}`}
              className={`trick-card slide-in reveal${isClaimer ? ' claimer' : ''}`}
              style={{
                left: `calc(${to.x * 100}% + ${spread}px)`,
                top: `${to.y * 100}%`,
                ['--dx' as string]: `${(from.x - to.x) * size.w - spread}px`,
                ['--dy' as string]: `${(from.y - to.y) * size.h}px`,
                animationDelay: `${(isClaimer ? 0 : 0.3) + i * 0.08}s`,
                zIndex: 30 + i,
              }}
            >
              <Card id={card} width={w} />
            </div>
          )
        })
      })}

      {plays.map((p) => {
        const k = rel(p.seat)
        const to = trickPosition(k, n)
        const from = seatPosition(k, n)
        const dx = (from.x - to.x) * size.w
        const dy = (from.y - to.y) * size.h
        let cls = 'trick-card slide-in'
        let style: React.CSSProperties = {
          left: `${to.x * 100}%`,
          top: `${to.y * 100}%`,
          ['--dx' as string]: `${dx}px`,
          ['--dy' as string]: `${dy}px`,
          zIndex: 10 + (state.trick.plays.findIndex((q) => q.card === p.card) + 1 || sweep?.trick.plays.findIndex((q) => q.card === p.card) || 0),
        }
        if (sweep) {
          const wk = rel(sweep.trick.winnerSeat)
          const wpos = seatPosition(wk, n)
          const wdx = (wpos.x - to.x) * size.w
          const wdy = (wpos.y - to.y) * size.h
          const winning = p.seat === sweep.trick.winnerSeat
          // While the completed trick rests, the card that finished it still slides in.
          const base = sweep.stage === 'move' ? 'sweep-out' : p.card === lastPlayed ? 'slide-in' : 'resting'
          cls = `trick-card ${base}${sweep.stage === 'rest' && winning ? ' winning' : ''}`
          style = { ...style, ['--wx' as string]: `${wdx}px`, ['--wy' as string]: `${wdy}px` }
        }
        return (
          <div key={p.key} className={cls} style={style}>
            <Card id={p.card} width={cardW} />
          </div>
        )
      })}
    </div>
  )
}

export function SeatBadge({ info, dealer, bidder, turn, size }: { info: SeatInfo; dealer?: boolean; bidder?: boolean; turn?: boolean; size?: 'lg' }) {
  return (
    <div className={`seat-badge team-${info.team}${turn ? ' turn' : ''}${size ? ` ${size}` : ''}`}>
      <span className="seat-avatar" style={{ background: info.color }} aria-hidden>
        {info.emoji ?? info.name.charAt(0).toUpperCase()}
      </span>
      <span className="seat-name">{info.name}</span>
      {dealer && <span className="seat-tag dealer" title="Dealer">D</span>}
      {bidder && <span className="seat-tag bidder" title="Bidder">★</span>}
    </div>
  )
}
