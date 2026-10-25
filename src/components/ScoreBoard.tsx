import { RULES, type Game, type Player, type TeamId } from '../lib/types'
import { leadingTeam, type Scores } from '../lib/scoring'
import { Avatar } from './Avatar'

export function ScoreBoard({ game, totals, byId }: { game: Game; totals: Scores; byId: Map<string, Player> }) {
  const leader = leadingTeam(totals)
  return (
    <div className="scoreboard">
      {(['A', 'B'] as TeamId[]).map((t) => {
        const total = totals[t]
        const pct = Math.max(0, Math.min(100, (total / RULES.TARGET_SCORE) * 100))
        const remaining = RULES.TARGET_SCORE - total
        return (
          <div key={t} className={`score-card team-${t}${leader === t ? ' leading' : ''}`}>
            <div className="team-name truncate">{game.teams[t].name}</div>
            <div className="players truncate">{game.teams[t].playerIds.map((id) => byId.get(id)?.name ?? '?').join(', ')}</div>
            <div className={`total${total < 0 ? ' neg' : ''}`}>{total}</div>
            <div className="progress" role="progressbar" aria-valuenow={total} aria-valuemin={0} aria-valuemax={RULES.TARGET_SCORE}>
              <div style={{ width: `${pct}%` }} />
            </div>
            <div className="progress-label">{remaining > 0 ? `${remaining} to ${RULES.TARGET_SCORE}` : `Reached ${RULES.TARGET_SCORE}!`}</div>
          </div>
        )
      })}
    </div>
  )
}

export function DealerCard({ dealer, label = 'Dealer' }: { dealer: Player | undefined; label?: string }) {
  return (
    <div className="dealer-card">
      <Avatar player={dealer} size="lg" />
      <div>
        <div className="label">{label}</div>
        <div className="name">{dealer?.name ?? 'Unknown'}</div>
      </div>
    </div>
  )
}
