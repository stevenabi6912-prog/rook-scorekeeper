import { Link } from 'react-router-dom'
import { TopBar } from '../../components/Layout'
import { ROOK } from '../../game/cards'
import { Card } from '../components/Card'
import '../play.css'

export function PlayLobbyPage() {
  return (
    <>
      <TopBar title="Play" />
      <main className="page">
        <div className="lobby-hero" aria-hidden>
          <Card id="R14" width={64} style={{ transform: 'rotate(-14deg) translateY(6px)' }} />
          <Card id={ROOK} width={64} style={{ zIndex: 2 }} />
          <Card id="G14" width={64} style={{ transform: 'rotate(14deg) translateY(6px)' }} />
        </div>
        <section className="section">
          <h3>Practice</h3>
          <Link className="card tappable lobby-card" to="/play/demo">
            <div className="grow">
              <div className="lobby-card-title">4 players: you and 3 bots</div>
              <div className="small muted">Partners across the table, 9 cards each. A full game on this phone.</div>
            </div>
            <span className="lobby-arrow">›</span>
          </Link>
          <Link className="card tappable lobby-card" to="/play/demo?players=6">
            <div className="grow">
              <div className="lobby-card-title">6 players: you and 5 bots</div>
              <div className="small muted">Three a side, 6 cards each.</div>
            </div>
            <span className="lobby-arrow">›</span>
          </Link>
          <p className="small muted">The bots always play by the rules but keep no memory of what has been played, so they do make mistakes.</p>
        </section>
        <section className="section">
          <h3>Online tables</h3>
          <div className="empty">Playing with the family from your own phones is coming next. Tables will show up here.</div>
        </section>
      </main>
    </>
  )
}
