import { describeBid, type ScoredHand } from '../lib/scoring'
import { otherTeam, type Game, type Player, type TeamId } from '../lib/types'

interface Props {
  game: Game
  scored: ScoredHand[]
  byId: Map<string, Player>
  onSelect?: (handId: string) => void
}

export function HandTable({ game, scored, byId, onSelect }: Props) {
  if (scored.length === 0) return <div className="empty">No hands yet. Tap “Add hand” after the first hand is played.</div>
  const name = (id: string | null | undefined) => (id ? byId.get(id)?.name ?? '?' : '—')
  return (
    <table className="hand-table">
      <thead>
        <tr>
          <th className="num">#</th>
          <th>Hand</th>
          <th className="score-col team-A">{game.teams.A.name}</th>
          <th className="score-col team-B">{game.teams.B.name}</th>
        </tr>
      </thead>
      <tbody>
        {scored.map(({ hand, outcome }) => {
          const bt = hand.bidTeam
          const ot = otherTeam(bt)
          return (
            <tr key={hand.id} onClick={() => onSelect?.(hand.id)}>
              <td className="num">{hand.handNumber}</td>
              <td>
                <span className="line">
                  <strong>{name(hand.bidderId)}</strong> <span className={`badge team-${bt}`}>{bt}</span>{' '}
                  bid <strong>{describeBid(hand.bid)}</strong>{' '}
                  <span className={`badge ${outcome.made ? 'good' : 'bad'}`}>{outcome.made ? 'Made' : hand.bid === 'moon' ? 'Missed' : 'Set'}</span>
                </span>
                <span className="line small">
                  Took {hand.pointsTaken} · Dealer {name(hand.dealerId)}{hand.rookHolderId ? ` · Rook: ${name(hand.rookHolderId)}` : ''}
                </span>
              </td>
              <ScoreCell team="A" bidTeam={bt} otherTeam={ot} outcome={outcome} />
              <ScoreCell team="B" bidTeam={bt} otherTeam={ot} outcome={outcome} />
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ScoreCell({ team, bidTeam, outcome }: { team: TeamId; bidTeam: TeamId; otherTeam: TeamId; outcome: ScoredHand['outcome'] }) {
  const isMoonShooter = outcome.setTo !== undefined && team === bidTeam
  const d = outcome.delta[team]
  return (
    <td className={`score-col team-${team}`}>
      <span className="line running">{outcome.totals[team]}</span>
      {isMoonShooter ? (
        <span className="line delta set">set to {outcome.setTo}</span>
      ) : (
        <span className={`line delta ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}`}>{d > 0 ? `+${d}` : d}</span>
      )}
    </td>
  )
}
