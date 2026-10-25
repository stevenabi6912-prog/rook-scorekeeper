import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { StoreProvider } from './data/StoreContext'
import { GamePage } from './pages/GamePage'
import { GamesPage } from './pages/GamesPage'
import { HandFormPage } from './pages/HandFormPage'
import { NewGamePage } from './pages/NewGamePage'
import { PasscodeGate } from './pages/PasscodeGate'
import { PlayersPage } from './pages/PlayersPage'
import { SettingsPage } from './pages/SettingsPage'
import { StatsPage } from './pages/StatsPage'
import { DemoTablePage } from './play/pages/DemoTablePage'
import { PlayLobbyPage } from './play/pages/PlayLobbyPage'
import { TablePage } from './play/pages/TablePage'

export default function App() {
  return (
    <StoreProvider>
      <PasscodeGate>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<GamesPage />} />
              <Route path="/players" element={<PlayersPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/play" element={<PlayLobbyPage />} />
            </Route>
            <Route path="/play/demo" element={<DemoTablePage />} />
            <Route path="/play/:matchId" element={<TablePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/new" element={<NewGamePage />} />
            <Route path="/game/:gameId" element={<GamePage />} />
            <Route path="/game/:gameId/hand/new" element={<HandFormPage />} />
            <Route path="/game/:gameId/hand/:handId" element={<HandFormPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </PasscodeGate>
    </StoreProvider>
  )
}
