import type { Player } from '../lib/types'

export const PLAYER_COLORS = ['#1f6feb', '#d9480f', '#2f9e44', '#9c36b5', '#e03131', '#0ca678', '#f08c00', '#6741d9', '#c2255c', '#495057']
export const PLAYER_EMOJIS = ['🙂', '😎', '🤠', '🧙', '🦊', '🐻', '🦉', '🐧', '🐸', '🦁', '🐝', '🌵', '🍕', '⭐', '🔥', '🎯', '🃏', '👑']

export function playerColor(p: Pick<Player, 'color' | 'name'> | undefined): string {
  if (p?.color) return p.color
  const s = p?.name ?? ''
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PLAYER_COLORS[h % PLAYER_COLORS.length]
}

export function Avatar({ player, size }: { player?: Pick<Player, 'name' | 'emoji' | 'color' | 'photo'>; size?: 'sm' | 'lg' }) {
  const cls = `avatar${size ? ` ${size}` : ''}`
  if (!player) return <span className={cls}>?</span>
  return (
    <span className={cls} style={{ background: playerColor(player) }} aria-hidden>
      {player.photo ? <img src={player.photo} alt="" /> : player.emoji || player.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

export function PlayerName({ player, fallback = 'Unknown' }: { player?: Pick<Player, 'name'>; fallback?: string }) {
  return <>{player?.name ?? fallback}</>
}
