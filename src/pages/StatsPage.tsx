import { useMemo } from 'react'
import { Avatar } from '../components/Avatar'
import { TopBar } from '../components/Layout'
import { useAllHands, useGames, usePlayers } from '../hooks/useData'
import { computePlayerStats } from '../lib/stats'

export function StatsPage() {
  const { players, byId, loading: pl } = usePlayers()
  const { games, loading: gl } = useGames()
  const handsByGame = useAllHands(games)

  const rows = useMemo(() => {
    if (!players || !games || !handsByGame) return null
    return computePlayerStats(players, games, handsByGame)
      .filter((s) => s.gamesPlayed > 0 || !byId.get(s.playerId)?.archived)
      .sort((a, b) => b.wins - a.wins || b.gamesPlayed - a.gamesPlayed || (byId.get(a.playerId)?.name ?? '').localeCompare(byId.get(b.playerId)?.name ?? ''))
  }, [players, games, handsByGame, byId])

  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—')
  const finished = (games ?? []).filter((g) => g.status === 'finished').length

  return (
    <>
      <TopBar title="Stats" />
      <main className="page">
        {(pl || gl || !rows) && <div className="spinner" />}
        {rows && (
          <>
            <p className="muted small">{finished} finished game{finished === 1 ? '' : 's'} · {(games ?? []).length - finished} in progress. Wins count finished games only; bids and moons count every hand recorded.</p>
            {rows.length === 0 && <div className="empty">No players yet.</div>}
            {rows.length > 0 && (
              <div className="stats-wrap">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Games</th>
                      <th>Wins</th>
                      <th>Win %</th>
                      <th>Bids</th>
                      <th>Bid made</th>
                      <th>Avg bid</th>
                      <th>Moons</th>
                      <th>Rook held</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => {
                      const p = byId.get(s.playerId)
                      return (
                        <tr key={s.playerId}>
                          <td>
                            <span className="row" style={{ gap: 8 }}>
                              <Avatar player={p} size="sm" />
                              <span style={{ fontWeight: 600 }}>{p?.name ?? '?'}</span>
                            </span>
                          </td>
                          <td>{s.gamesPlayed}</td>
                          <td>{s.wins}</td>
                          <td>{pct(s.wins, s.gamesPlayed)}</td>
                          <td>{s.bids}</td>
                          <td>{pct(s.bidsMade, s.bids)}{s.bids ? <span className="muted small"> ({s.bidsMade}/{s.bids})</span> : null}</td>
                          <td>{s.averageBid ?? '—'}</td>
                          <td>{s.moonsAttempted ? `${s.moonsMade}/${s.moonsAttempted}` : '—'}</td>
                          <td>{s.rookHeld}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}
