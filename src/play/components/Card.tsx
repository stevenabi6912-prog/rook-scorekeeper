import type { CSSProperties } from 'react'
import { ROOK, cardPoints, parseCard, type CardId } from '../../game/cards'
import { FAMILY_RULES, type Suit } from '../../game/rules'

/*
 * One Rook card, drawn as SVG to match the family's deck: a white face, the
 * numeral top-left in the card's color with the color name beside it and a
 * small point badge under it on point cards, a big numeral in a thin square
 * frame in the middle, and the index repeated upside down bottom-right.
 */

export const CARD_W = 180
export const CARD_H = 280
export const CARD_RATIO = CARD_H / CARD_W

/** Ink colors tuned to the printed deck (the green is a blue-green, the yellow golden). */
export const CARD_INK: Record<Suit, string> = {
  red: '#d4222b',
  yellow: '#e5a71f',
  green: '#1f9b8a',
  black: '#1f1f23',
}
export const ROOK_INK = '#1b6fb3'
const BACK_BLUE = '#63b8df'
const BACK_BLUE_DEEP = '#2f8bbd'
const FRAME = '#a7b0ba'
const FONT = "'Helvetica Neue', 'Arial Narrow', Arial, Helvetica, sans-serif"

const NAME: Record<Suit, string> = { red: 'RED', yellow: 'YELLOW', green: 'GREEN', black: 'BLACK' }

/** A perched raven, in a 100 x 100 box, facing left. */
export const RAVEN_PATH =
  'M 2 31 L 22 25 C 25 14 36 9 46 14 C 54 18 62 26 70 38 C 79 50 86 62 89 70 L 99 83 L 84 78 C 77 86 64 91 52 87 L 54 98 L 49 98 L 46 87 L 42 98 L 37 98 L 38 85 C 27 79 18 67 18 53 C 18 45 21 39 24 35 Z'
/** Wing line drawn over the silhouette. */
const RAVEN_WING = 'M 40 36 C 52 40 66 52 76 68'

export interface CardProps {
  id: CardId
  /** Rendered width in px. */
  width: number
  faceDown?: boolean
  selected?: boolean
  dimmed?: boolean
  onClick?: () => void
  className?: string
  style?: CSSProperties
  /** Accessible label override. */
  label?: string
}

export function cardLabel(id: CardId): string {
  const c = parseCard(id)
  if (c.kind === 'rook') return 'the Rook'
  return `${c.suit} ${c.rank}`
}

function Index({ rank, color, points }: { rank: number; color: string; points: number }) {
  const two = rank >= 10
  const numeralW = two ? 66 : 34
  return (
    <g>
      <text x="0" y="52" fontSize="58" fontWeight="800" fontFamily={FONT} fill={color} letterSpacing={two ? -3 : 0}>
        {rank}
      </text>
      <text x={numeralW + 4} y="19" fontSize="10.5" fontWeight="700" fontFamily={FONT} fill={color} letterSpacing="0.8">
        {NAME[suitForColor(color)]}
      </text>
      {points > 0 && (
        <g transform={`translate(${numeralW + 4}, 25)`}>
          <rect width="24" height="21" rx="3" fill="none" stroke={color} strokeWidth="1.6" />
          <text x="12" y="15.5" fontSize="13" fontWeight="800" fontFamily={FONT} fill={color} textAnchor="middle">
            {points}
          </text>
        </g>
      )}
    </g>
  )
}

function suitForColor(color: string): Suit {
  return (Object.keys(CARD_INK) as Suit[]).find((s) => CARD_INK[s] === color) ?? 'black'
}

function SuitFace({ suit, rank }: { suit: Suit; rank: number }) {
  const color = CARD_INK[suit]
  const points = cardPoints(`${suit[0].toUpperCase()}${rank}`, FAMILY_RULES)
  return (
    <>
      <g transform="translate(14, 14)">
        <Index rank={rank} color={color} points={points} />
      </g>
      <rect x="33" y="98" width="114" height="114" fill="none" stroke={FRAME} strokeWidth="1.3" />
      <text
        x="90"
        y="193"
        fontSize={rank >= 10 ? 92 : 104}
        fontWeight="800"
        fontFamily={FONT}
        fill={color}
        textAnchor="middle"
        letterSpacing={rank >= 10 ? -4 : 0}
      >
        {rank}
      </text>
      <g transform={`rotate(180 ${CARD_W / 2} ${CARD_H / 2}) translate(14, 14)`}>
        <Index rank={rank} color={color} points={points} />
      </g>
    </>
  )
}

function RookFace() {
  return (
    <>
      <g transform="translate(44, 16)">
        <text transform="rotate(90)" fontSize="24" fontWeight="800" fontFamily={FONT} fill={ROOK_INK} letterSpacing="3">
          ROOK
        </text>
      </g>
      <g transform="translate(46, 56) scale(0.98)">
        <path d={RAVEN_PATH} fill={ROOK_INK} />
        <path d={RAVEN_WING} fill="none" stroke="#ffffff" strokeWidth="1.6" opacity="0.55" strokeLinecap="round" />
        <circle cx="38" cy="21" r="2.4" fill="#fff" />
        <circle cx="38.8" cy="21" r="1.1" fill={ROOK_INK} />
      </g>
      <text x="20" y="250" fontSize="74" fontWeight="800" fontFamily={FONT} fill={ROOK_INK} letterSpacing="-3">
        20
      </text>
      <g transform={`rotate(180 ${CARD_W / 2} ${CARD_H / 2}) translate(44, 16)`}>
        <text transform="rotate(90)" fontSize="24" fontWeight="800" fontFamily={FONT} fill={ROOK_INK} letterSpacing="3">
          ROOK
        </text>
      </g>
    </>
  )
}

function Back() {
  return (
    <>
      <defs>
        <pattern id="rook-back-scribble" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
          <path d="M0 7 q3.5 -5 7 0 t7 0" fill="none" stroke={BACK_BLUE_DEEP} strokeWidth="1.1" opacity="0.55" />
          <path d="M0 2 q3.5 4 7 0 t7 0" fill="none" stroke="#ffffff" strokeWidth="0.8" opacity="0.35" />
        </pattern>
      </defs>
      <rect x="6" y="6" width={CARD_W - 12} height={CARD_H - 12} rx="9" fill={BACK_BLUE} />
      <rect x="6" y="6" width={CARD_W - 12} height={CARD_H - 12} rx="9" fill="url(#rook-back-scribble)" />
      <rect x="14" y="14" width={CARD_W - 28} height={CARD_H - 28} rx="6" fill="none" stroke="#ffffff" strokeWidth="2.5" opacity="0.9" />
      <rect x="20" y="20" width={CARD_W - 40} height={CARD_H - 40} rx="4" fill="none" stroke={BACK_BLUE_DEEP} strokeWidth="1" opacity="0.8" />
      <circle cx={CARD_W / 2} cy={CARD_H / 2} r="46" fill="#ffffff" opacity="0.92" />
      <g transform={`translate(${CARD_W / 2 - 36}, ${CARD_H / 2 - 36}) scale(0.72)`}>
        <path d={RAVEN_PATH} fill={BACK_BLUE_DEEP} />
      </g>
    </>
  )
}

export function Card({ id, width, faceDown, selected, dimmed, onClick, className, style, label }: CardProps) {
  const height = Math.round(width * CARD_RATIO)
  const classes = ['rook-card', faceDown ? 'face-down' : 'face-up', selected ? 'selected' : '', dimmed ? 'dimmed' : '', onClick ? 'tappable' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  const c = faceDown ? null : parseCard(id)
  const aria = faceDown ? 'face-down card' : (label ?? cardLabel(id))
  return (
    <svg
      className={classes}
      style={{ width, height, ...style }}
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      role={onClick ? 'button' : 'img'}
      aria-label={aria}
      aria-pressed={onClick ? !!selected : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
    >
      <rect x="1" y="1" width={CARD_W - 2} height={CARD_H - 2} rx="14" fill="#ffffff" stroke="#c9d0d8" strokeWidth="1.5" />
      {faceDown ? <Back /> : c!.kind === 'rook' ? <RookFace /> : <SuitFace suit={c!.suit} rank={c!.rank} />}
    </svg>
  )
}

/** A small stack of card backs, for other players' hands. */
export function CardStack({ count, width }: { count: number; width: number }) {
  const n = Math.min(count, 5)
  return (
    <div className="card-stack" style={{ width: width + n * 3, height: Math.round(width * CARD_RATIO) + n * 2 }} aria-label={`${count} cards`}>
      {Array.from({ length: n }, (_, i) => (
        <Card key={i} id={ROOK} width={width} faceDown style={{ position: 'absolute', left: i * 3, top: i * 2 }} />
      ))}
      <span className="card-stack-count">{count}</span>
    </div>
  )
}
