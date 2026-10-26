import { NavLink, Outlet } from 'react-router-dom'

export function Layout() {
  return (
    <div className="app">
      <Outlet />
      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/" end><span className="ico">🃏</span>Score</NavLink>
        <NavLink to="/play"><span className="ico">🎴</span>Play</NavLink>
        <NavLink to="/players"><span className="ico">👥</span>Players</NavLink>
        <NavLink to="/stats"><span className="ico">📊</span>Stats</NavLink>
      </nav>
    </div>
  )
}

export function TopBar({ title, back, right }: { title: string; back?: string | (() => void); right?: React.ReactNode }) {
  return (
    <header className="topbar">
      {back !== undefined && (
        typeof back === 'string'
          ? <NavLink className="icon-btn" to={back} aria-label="Back">‹</NavLink>
          : <button className="icon-btn" onClick={back} aria-label="Back">‹</button>
      )}
      <h1>{title}</h1>
      {right}
    </header>
  )
}
