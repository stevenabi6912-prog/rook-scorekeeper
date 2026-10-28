import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Dialog } from '../components/Dialog'
import { TrumpPicker } from '../components/TrumpPicker'
import { TopBar } from '../components/Layout'
import { useStore } from '../data/StoreContext'
import { useGame, useHands, usePlayers } from '../hooks/useData'
import { BID_OPTIONS, currentTotals, isValidBid, isValidPoints, replayHands, scoreHand, type Scores } from '../lib/scoring'
import { nextDealerId, teamOf } from '../lib/seating'
import { ROOK_IN_KITTY, otherTeam, RULES, type Bid, type Game, type Hand, type HandInput, type Player, type TeamId, type Trump } from '../lib/types'

export function HandFormPage() {
  const { gameId, handId } = useParams()
  const { game, loading: gl } = useGame(gameId)
  const { hands, loading: hl } = useHands(gameId)
  const { byId, loading: pl } = usePlayers()
  const back = `/game/${gameId}`

  if (gl || hl || pl || !hands) return <><TopBar title="Hand" back={back} /><main className="page no-nav"><div className="spinner" /></main></>
  if (!game) return <><TopBar title="Hand" back={back} /><main className="page no-nav"><div className="empty">Game not found.</div></main></>
  const editing = handId ? hands.find((h) => h.id === handId) : undefined
  if (handId && !editing) return <><TopBar title="Hand" back={back} /><main className="page no-nav"><div className="empty">Hand not found.</div></main></>

  return <HandForm key={handId ?? 'new'} game={game} hands={hands} byId={byId} editing={editing} />
}

const MISSED_MOON_MAX = RULES.TOTAL_POINTS - RULES.POINT_STEP // 115

function HandForm({ game, hands, byId, editing }: { game: Game; hands: Hand[]; byId: Map<string, Player>; editing?: Hand }) {
  const store = useStore()
  const navigate = useNavigate()
  const back = `/game/${game.id}`
  const ordered = useMemo(() => replayHands(hands).map((s) => s.hand), [hands])

  // Hands before this one decide the totals entering it.
  const priorHands = useMemo(
    () => (editing ? ordered.filter((h) => h.handNumber < editing.handNumber) : ordered),
    [ordered, editing],
  )
  const laterHands = useMemo(
    () => (editing ? ordered.filter((h) => h.handNumber > editing.handNumber) : []),
    [ordered, editing],
  )
  const before: Scores = useMemo(() => currentTotals(priorHands), [priorHands])
  const handNumber = editing ? editing.handNumber : ordered.length + 1

  const [dealerId, setDealerId] = useState(editing?.dealerId ?? nextDealerId(game, priorHands))
  const [showDealerPicker, setShowDealerPicker] = useState(false)
  // New hands start with whatever was set on the live screen: who has the bid, for how much, and the trump.
  const [bidderId, setBidderId] = useState<string>(editing?.bidderId ?? game.currentBid?.bidderId ?? '')
  const [bid, setBid] = useState<Bid | null>(editing?.bid ?? game.currentBid?.bid ?? null)
  const [points, setPoints] = useState<number>(editing?.pointsTaken ?? (typeof game.currentBid?.bid === 'number' ? game.currentBid.bid : 0))
  const [pointsTouched, setPointsTouched] = useState(!!editing)
  const [moonMade, setMoonMade] = useState<boolean | null>(editing?.bid === 'moon' ? (editing.moonMade ?? null) : null)
  const [rookHolderId, setRookHolderId] = useState<string | null>(editing?.rookHolderId ?? null)
  // New hands start with whatever trump was set on the live screen.
  const [trump, setTrump] = useState<Trump | null>(editing ? (editing.trump ?? null) : (game.currentTrump ?? null))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const bidTeam: TeamId | null = bidderId ? teamOf(game.teams, bidderId) : null
  const isMoon = bid === 'moon'
  const maxPoints = isMoon ? (moonMade === false ? MISSED_MOON_MAX : RULES.TOTAL_POINTS) : RULES.TOTAL_POINTS

  const chooseBid = (b: Bid) => {
    setBid(b)
    if (b === 'moon') {
      if (moonMade === null) setMoonMade(true)
    } else if (!pointsTouched) {
      setPoints(b)
    }
  }
  const chooseMoon = (made: boolean) => {
    setMoonMade(made)
    if (!made && points > MISSED_MOON_MAX) setPoints(MISSED_MOON_MAX)
  }
  const step = (d: number) => {
    setPointsTouched(true)
    setPoints((p) => Math.max(0, Math.min(maxPoints, p + d)))
  }
  // A missed Moon is entered as the points the other team took (that is what people count);
  // the hand still stores what the shooters took.
  const missedMoon = isMoon && moonMade === false
  const shown = missedMoon ? RULES.TOTAL_POINTS - points : points
  const shownMin = missedMoon ? RULES.TOTAL_POINTS - maxPoints : 0
  const shownMax = missedMoon ? RULES.TOTAL_POINTS : maxPoints
  const setShown = (v: number) => {
    setPointsTouched(true)
    const clamped = Math.max(shownMin, Math.min(shownMax, Math.round(v / RULES.POINT_STEP) * RULES.POINT_STEP))
    setPoints(missedMoon ? RULES.TOTAL_POINTS - clamped : clamped)
  }

  const effectivePoints = isMoon && moonMade ? RULES.TOTAL_POINTS : points
  const input: HandInput | null =
    bidderId && bidTeam && bid !== null && (!isMoon || moonMade !== null)
      ? {
          dealerId,
          bidderId,
          bidTeam,
          bid,
          pointsTaken: effectivePoints,
          ...(isMoon ? { moonMade: moonMade === true } : {}),
          rookHolderId,
          trump,
        }
      : null

  const pointsOk = isMoon && moonMade ? true : isValidPoints(points, maxPoints)
  const valid = !!input && isValidBid(input.bid) && pointsOk
  const preview = input && valid ? scoreHand(before, input) : null

  const finalTotals = useMemo(() => {
    if (!input || !valid || laterHands.length === 0 || !editing) return null
    const replaced: Hand[] = [...priorHands, { ...editing, ...input }, ...laterHands]
    return currentTotals(replaced)
  }, [input, valid, laterHands, priorHands, editing])

  const save = async () => {
    if (!input || !valid) return
    setBusy(true)
    setErr(null)
    try {
      if (editing) await store.updateHand(game.id, editing.id, input)
      else await store.addHand(game.id, input)
      navigate(back, { replace: true })
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!editing) return
    setDeleteOpen(false)
    setBusy(true)
    try {
      await store.deleteHand(game.id, editing.id)
      navigate(back, { replace: true })
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  const playerChip = (id: string, selected: boolean, onClick: () => void, extraClass = '') => {
    const p = byId.get(id)
    const t = teamOf(game.teams, id)
    return (
      <button key={id} className={`chip team-${t}${selected ? ' selected' : ''} ${extraClass}`} onClick={onClick} aria-pressed={selected} aria-label={p?.name ?? 'Unknown player'}>
        <Avatar player={p} size="sm" /> <span className="truncate">{p?.name ?? '?'}</span>
      </button>
    )
  }

  return (
    <>
      <TopBar title={editing ? `Edit hand ${handNumber}` : `Hand ${handNumber}`} back={back} />
      <main className="page no-nav">
        <section className="section">
          <div className="row between">
            <h3 style={{ margin: 0 }}>Dealer</h3>
            <button className="btn ghost small" onClick={() => setShowDealerPicker((s) => !s)}>{showDealerPicker ? 'Done' : 'Change'}</button>
          </div>
          {!showDealerPicker ? (
            <div className="row" style={{ marginTop: 6 }}>
              <Avatar player={byId.get(dealerId)} />
              <strong>{byId.get(dealerId)?.name}</strong>
              {!editing && dealerId !== nextDealerId(game, priorHands) && <span className="badge neutral">manual</span>}
            </div>
          ) : (
            <div className="chips grid-2" style={{ marginTop: 8 }}>
              {game.seatOrder.map((id) => playerChip(id, dealerId === id, () => setDealerId(id)))}
            </div>
          )}
        </section>

        <section className="section">
          <h3>Who bid?</h3>
          <div className="chips grid-2">
            {game.seatOrder.map((id) => playerChip(id, bidderId === id, () => setBidderId(id)))}
          </div>
          {bidTeam && <p className="muted small" style={{ marginTop: 6 }}>Bidding team: <span className={`badge team-${bidTeam}`}>{bidTeam}</span> {game.teams[bidTeam].name}</p>}
        </section>

        <section className="section">
          <h3>Bid</h3>
          <div className="chips grid-4">
            {BID_OPTIONS.map((b) => (
              <button key={b} className={`chip${bid === b ? ' selected' : ''}`} onClick={() => chooseBid(b)} aria-pressed={bid === b}>{b}</button>
            ))}
            <button className={`chip${isMoon ? ' selected' : ''}`} style={{ gridColumn: '1 / -1' }} onClick={() => chooseBid('moon')} aria-pressed={isMoon}>🌙 Moon</button>
          </div>
        </section>

        {isMoon && (
          <section className="section">
            <h3>Did they take every trick?</h3>
            <div className="chips grid-2">
              <button className={`chip good${moonMade === true ? ' selected' : ''}`} onClick={() => chooseMoon(true)}>Made 🌕</button>
              <button className={`chip bad${moonMade === false ? ' selected' : ''}`} onClick={() => chooseMoon(false)}>Missed 🌑</button>
            </div>
          </section>
        )}

        {bid !== null && !(isMoon && moonMade !== false) && (
          <section className="section">
            <h3>{missedMoon ? `Points ${bidTeam ? game.teams[otherTeam(bidTeam)].name : 'the other team'} took` : `Points ${bidTeam ? game.teams[bidTeam].name : 'bidding team'} took`}</h3>
            <div className="stepper">
              <button onClick={() => (missedMoon ? setShown(shown - RULES.POINT_STEP) : step(-RULES.POINT_STEP))} disabled={shown <= shownMin} aria-label="Minus 5">−</button>
              <input
                type="number"
                inputMode="numeric"
                min={shownMin}
                max={shownMax}
                step={RULES.POINT_STEP}
                value={shown}
                onChange={(e) => (missedMoon ? setShown(Number(e.target.value)) : (setPointsTouched(true), setPoints(Number(e.target.value))))}
                onBlur={() => (missedMoon ? setShown(shown) : setPoints((p) => Math.max(0, Math.min(maxPoints, Math.round(p / RULES.POINT_STEP) * RULES.POINT_STEP))))}
                aria-label="Points taken"
              />
              <button onClick={() => (missedMoon ? setShown(shown + RULES.POINT_STEP) : step(RULES.POINT_STEP))} disabled={shown >= shownMax} aria-label="Plus 5">+</button>
            </div>
            {!pointsOk && <div className="error" style={{ marginTop: 8 }}>Enter {shownMin}–{shownMax} in steps of 5.</div>}
            {bidTeam && !isMoon && <p className="muted small" style={{ marginTop: 6 }}>{game.teams[otherTeam(bidTeam)].name} took {RULES.TOTAL_POINTS - Math.min(RULES.TOTAL_POINTS, Math.max(0, points))}.</p>}
            {missedMoon && bidTeam && <p className="muted small" style={{ marginTop: 6 }}>{game.teams[bidTeam].name} took {points} before missing.</p>}
          </section>
        )}

        <section className="section">
          <h3>Trump</h3>
          <TrumpPicker value={trump} onChange={setTrump} size="grid" />
        </section>

        <section className="section">
          <h3>Who held the Rook? (optional)</h3>
          <div className="chips grid-2">
            {game.seatOrder.map((id) => playerChip(id, rookHolderId === id, () => setRookHolderId(rookHolderId === id ? null : id)))}
            <button
              type="button"
              className={`chip${rookHolderId === ROOK_IN_KITTY ? ' selected' : ''}`}
              onClick={() => setRookHolderId(rookHolderId === ROOK_IN_KITTY ? null : ROOK_IN_KITTY)}
              aria-pressed={rookHolderId === ROOK_IN_KITTY}
            >
              🃏 Kitty
            </button>
          </div>
        </section>

        {preview && bidTeam && (
          <section className="section">
            <h3>Result</h3>
            <div className={`preview ${preview.made ? 'good' : 'bad'}`}>
              <div className="headline">
                {isMoon
                  ? preview.made
                    ? `🌕 Moon made! ${game.teams[bidTeam].name} jumps to ${preview.setTo}`
                    : `🌑 Moon missed. ${game.teams[bidTeam].name} drops to ${preview.setTo}`
                  : preview.made
                    ? `✅ Made it: ${game.teams[bidTeam].name} +${preview.delta[bidTeam]}`
                    : `❌ Set: ${game.teams[bidTeam].name} −${bid}`}
              </div>
              <div className="totals">
                {(['A', 'B'] as TeamId[]).map((t) => (
                  <div key={t}>
                    <div className="small truncate"><span className={`badge team-${t}`}>{t}</span> {game.teams[t].name}</div>
                    <div className="n">{preview.totals[t]}</div>
                    <div className="d">
                      {before[t]} {preview.setTo !== undefined && t === bidTeam ? `→ set to ${preview.setTo}` : `${preview.delta[t] >= 0 ? '+' : '−'} ${Math.abs(preview.delta[t])}`}
                    </div>
                  </div>
                ))}
              </div>
              {finalTotals && (
                <p className="small" style={{ marginTop: 10, marginBottom: 0 }}>
                  {laterHands.length} later hand{laterHands.length === 1 ? '' : 's'} will be recalculated. Final totals: {game.teams.A.name} {finalTotals.A} · {game.teams.B.name} {finalTotals.B}
                </p>
              )}
            </div>
          </section>
        )}

        {err && <div className="error">{err}</div>}
        {editing && (
          <button className="btn danger block" onClick={() => setDeleteOpen(true)} disabled={busy}>Delete hand {handNumber}</button>
        )}
      </main>

      <div className="fab-bar no-nav">
        <button className="btn primary big block" disabled={!valid || busy} onClick={save}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Save hand'}
        </button>
      </div>

      <Dialog open={deleteOpen} title={`Delete hand ${handNumber}?`} confirmLabel="Delete" danger onCancel={() => setDeleteOpen(false)} onConfirm={remove}>
        <p className="muted">Every hand after it will be renumbered and the totals recalculated for everyone.</p>
      </Dialog>
    </>
  )
}
