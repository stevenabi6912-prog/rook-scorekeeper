import { useLayoutEffect, useRef, useState } from 'react'
import { effectiveSuit, sortHand, type CardId } from '../../game/cards'
import { FAMILY_RULES, type Suit } from '../../game/rules'
import { CARD_INK, Card } from './Card'

interface HandProps {
  cards: CardId[]
  trump: Suit | null
  /** Cards that may be played right now; others are dimmed. */
  legal: CardId[]
  selected: CardId[]
  onSelect: (card: CardId) => void
  disabled?: boolean
}

/**
 * The player's cards fanned across the bottom of the screen. Cards overlap
 * so nine fit on a phone; the selected card lifts; illegal cards dim.
 */
export function HandFan({ cards, trump, legal, selected, onSelect, disabled }: HandProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(360)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const sorted = sortHand(cards, trump, FAMILY_RULES)
  const n = sorted.length
  // Smaller cards when holding the Kitty too (14 cards), so every card keeps a tappable strip.
  const cardW = Math.min(96, Math.max(56, Math.floor(width / (n > 10 ? 5.4 : 4.2))))
  const step = n > 1 ? Math.min(cardW * 0.72, (width - cardW - 8) / (n - 1)) : 0
  const total = cardW + step * (n - 1)
  const left0 = (width - total) / 2
  const legalSet = new Set(legal)

  return (
    <div className={`hand-fan${disabled ? ' disabled' : ''}`} ref={ref} style={{ height: Math.round(cardW * 1.556) + 30 }}>
      {sorted.map((id, i) => {
        const mid = (n - 1) / 2
        const rot = n > 1 ? (i - mid) * Math.min(3, 24 / n) : 0
        const lift = Math.abs(i - mid) * Math.min(2.2, 16 / n)
        const isSelected = selected.includes(id)
        const playable = legalSet.has(id) && !disabled
        const isTrump = trump !== null && effectiveSuit(id, trump) === trump
        return (
          <div
            key={id}
            className={`hand-slot${isSelected ? ' selected' : ''}${isTrump ? ' trump' : ''}`}
            style={{
              left: left0 + i * step,
              top: 14 + lift,
              // Chosen cards lift but keep their place in the fan, so neighbours stay visible.
              zIndex: i,
              transform: `rotate(${rot}deg)`,
              ...(isTrump && trump ? { ['--trump' as string]: CARD_INK[trump] } : {}),
            }}
          >
            <Card
              id={id}
              width={cardW}
              selected={isSelected}
              dimmed={!disabled && !playable && !isSelected}
              onClick={playable ? () => onSelect(id) : undefined}
            />
          </div>
        )
      })}
    </div>
  )
}
