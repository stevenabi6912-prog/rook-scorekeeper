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
}

/** Where seat `k` (relative to me, clockwise) sits, as a fraction of the table. */
export function seatPosition(k: number, n: number): { x: number; y: number } {
  const angle = Math.PI / 2 + (k * 2 * Math.PI) / n
  const rx = n > 4 ? 0.36 : 0.37
  const ry = n > 4 ? 0.36 : 0.4
  return { x: 0.5 + rx * Math.cos(angle), y: 0.5 + ry * Math.sin(angle) }
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

export function Table({ state, me, seats, bubbles, sweep }: TableProps) {
  const n = state.handedness
  const rel = (seat: number) => (seat - me + n) % n
  const { ref, size } = useSize()
  const cardW = Math.max(54, Math.min(84, Math.floor(size.w / 5)))
  const exposed = exposedNestCard(state)

  const plays: { seat: number; card: CardId; key: string }[] = sweep
    ? sweep.trick.plays.map((p) => ({ ...p, key: `sweep-${p.card}` }))
    : state.trick.plays.map((p) => ({ ...p, key: `trick-${p.card}` }))

  return (
    <div className="table-area" ref={ref} style={state.trump ? { ['--trump' as string]: CARD_INK[state.trump] } : undefined}>
      <div className={`felt-edge${state.trump ? ' has-trump' : ''}`} aria-hidden />
      {state.trump && (
        <div className="trump-marker" aria-label={`${state.trump} is trump`}>
          <span className="trump-swatch" style={{ background: CARD_INK[state.trump] }} />
          <span>{state.trump} trump</span>
        </div>
      )}
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

      {/* Kitty in the middle until the last trick takes it */}
      {state.nest.length > 0 && !state.tricks.some((t) => t.tookNest) && plays.length === 0 && (
        <div className="kitty" aria-label={`Kitty, ${state.nest.length} cards${exposed ? `, ${cardLabel(exposed)} showing` : ''}`}>
          <CardStack count={state.nest.length} width={Math.round(cardW * (exposed ? 0.6 : 0.38))} topCard={exposed} />
          <span className="kitty-label">Kitty</span>
        </div>
      )}

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
          cls = `trick-card ${sweep.stage === 'move' ? 'sweep-out' : winning ? 'winning' : 'resting'}`
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
