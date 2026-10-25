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
          <Card id="G1" width={64} style={{ transform: 'rotate(14deg) translateY(6px)' }} label="green ace" />
        </div>
        <section className="section">
          <h3>Practice</h3>
          <Link className="card tappable lobby-card" to="/play/demo">
            <div className="grow">
              <div className="lobby-card-title">Play against the computer</div>
              <div className="small muted">A full game on this phone. Good for learning the table.</div>
            </div>
            <span className="lobby-arrow">›</span>
          </Link>
        </section>
        <section className="section">
          <h3>Online tables</h3>
          <div className="empty">Playing with the family from your own phones is coming next. Tables will show up here.</div>
        </section>
      </main>
    </>
  )
}
