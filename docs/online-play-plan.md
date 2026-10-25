# Online Play: plan

Goal: play Rook on phones through the existing Rook Scorekeeper app. Each
family member sits at a virtual table from their own phone, sees only their own
cards, bids, plays tricks, and at the end of each hand the result is written as
a normal scorekeeper hand so history and stats keep working unchanged.

Everything here lives on the `online-play` branch. Nothing is deployed until
Steven says so. The live scorekeeper at `main` is untouched.

Sections:

1. [Rules questionnaire](#1-rules-questionnaire) (answer this first)
2. [Look and feel](#2-look-and-feel)
3. [Technical design](#3-technical-design)
4. [Build order and effort](#4-build-order-and-effort)

---

## 1. Rules questionnaire

Rook has many family variants. The engine will be written to the answers
below, so please go through them. Every question has a **default** marked; to
save time you can reply "defaults for everything except…" and list the
exceptions by number.

The scoring side is already settled by the scorekeeper and is not asked again:
120 points per hand, play to 500, bids 65–120 in steps of 5 or Moon, a made
Moon sets the team to the next multiple of 500 above, a missed Moon to the
next multiple below, a set team loses its bid.

### Deck

**Q1. Which cards are removed?**
A full Rook deck is 1–14 in four colors (red, yellow, green, black) plus the
Rook bird, 57 cards.
- **Default (4-handed): remove the 2s, 3s and 4s.** Leaves 45 cards: 10 per
  player and a 5-card nest.
- Alternatives: remove only the 2s, 3s, 4s *and 1s*; or play the full 57 cards.

**Q2. 6-handed deck?**
- **Default: remove the 2s, 3s, 4s (45 cards): 7 cards each, 3-card nest.**
- Alternative: full 57 cards: 9 each, 3-card nest.
- Or: 6-handed is not needed for online play yet (the scorekeeper supports it,
  the first version of online play could be 4-handed only).

**Q3. Where does the 1 rank?**
- **Default: 1 is the highest card of its color, above the 14.**
- Alternative: 1 is the lowest (below the 5 once 2–4 are gone).

### The Rook card

**Q4. How does the Rook rank?**
- **Default: the Rook is the highest trump, above the trump 1.**
- Alternatives: lowest trump (below the trump 5); or it ranks between the
  trump 10 and 11 ("10½"); or "it is always trump but ranks just below the 1".

**Q5. Rook point value?**
- **Default: 20 points.** This is what makes the deck total 120 with Q6.

**Q6. Point cards?**
- **Default: 5s = 5, 10s = 10, 14s = 10, Rook = 20. Total 120.** 1s are high
  but score nothing.
- Alternative: 1s worth 15 (that makes 180 per hand, which does not match the
  scorekeeper, so I assume this is not your variant).

**Q7. May the Rook be played when you are not void?**
When a color is led and you still hold that color:
- **Default: yes, the Rook may be played at any time; it counts as a trump.**
- Alternative: no, you must follow color if you can; the Rook can only be
  played when you are void in the led color or when trump is led.

**Q8. If the Rook is led, what must others play?**
- **Default: the Rook is trump, so others must follow with trump if able.**

### Nest (kitty)

**Q9. Nest size** is set by Q1/Q2 (5 cards for 4-handed, 3 for 6-handed).
Anything different?

**Q10. Who gets the nest?**
- **Default: the winning bidder picks up the whole nest, then discards the
  same number of cards face down.**

**Q11. May point cards be discarded? Where do discarded points go?**
- **Default: any cards may be discarded (points included); the discard pile
  goes to whoever wins the last trick.**
- Alternatives: discards go to the bidder's team regardless; or point cards
  may not be discarded unless the whole hand is points; or the Rook may not be
  discarded.

**Q12. Does anyone else see the nest?**
- **Default: no. Only the bidder sees it.** (Some families turn the nest face
  up before bidding; say so if yours does.)

### Bidding

**Q13. Who bids first?**
- **Default: the player to the dealer's left, then clockwise.**

**Q14. Can you re-enter after passing?**
- **Default: no, a pass is final.** Bidding ends when only one bidder is left.

**Q15. What happens if everyone passes?**
- **Default: the dealer must take it at 65.**
- Alternatives: re-deal with the same dealer; re-deal with the next dealer.

**Q16. Is the dealer allowed to bid?** (Default: yes, in turn like everyone.)

**Q17. Jump bids?** (Default: yes, any multiple of 5 above the current bid up
to 120, or Moon.)

### Moon

**Q18. What does Moon mean in play?**
- **Default: the bidding team must take all 120 points. Taking every trick is
  not required; the opponents simply must end with zero points.** The nest
  discards go to the last trick as usual, so a point card you discard can
  still cost you the Moon if the other side wins the last trick.
- Alternatives: must win every trick; or Moon is bid at 120 points and
  "Moon" is just the name for it.

**Q19. Does the Moon shooter play alone?**
- **Default: no, partner plays normally.**
- Alternative: partner's cards go face down and sit out.

**Q20. Does a Moon still use the nest?** (Default: yes, same as any bid.)

**Q21. Can play stop early when a Moon is lost?**
- **Default: yes. The moment the opponents take any points the hand is over
  and scored as a missed Moon with the points taken so far.** Nothing else
  changes. (Say "no" if you want it played out.)

### Trump and play

**Q22. When is trump declared?**
- **Default: by the bidder after looking at the nest and discarding, before
  the first lead.**
- Alternative: before picking up the nest.

**Q23. Who leads the first trick?**
- **Default: the bidder.**
- Alternative: the player to the dealer's left.

**Q24. Following suit.**
- **Default: you must follow the led color if you can. If you cannot, you may
  play anything, including trump.** (Q7 covers the Rook exception.)
- Alternative: you must trump if you cannot follow.

**Q25. Who wins a trick?**
- **Default: highest trump if any trump was played, otherwise the highest card
  of the led color.** The winner leads next.

**Q26. Last-trick bonus?**
- **Default: none beyond the nest discards (Q11).** The deck totals 120 so
  there is no room for a bonus without changing the scorekeeper.
- Alternative: 20 for the last trick (then I need to know which card values
  shrink to keep 120, or whether the family actually plays to 140).

**Q27. When does the hand end?**
- **Default: when every card has been played (10 tricks 4-handed, 7 tricks
  6-handed), or the moment a Moon becomes impossible (Q21).**
- Optional extra: a "concede" button so the bidding team can give up early
  once they cannot make the bid; points not yet taken go to the other team.
  Want it? (Default: yes, as a later nicety, not in the first version.)

**Q28. Who is recorded as "Rook holder" for stats?**
The scorekeeper has an optional `rookHolderId` on each hand.
- **Default: the player who was dealt the Rook (or who picked it up from the
  nest), recorded automatically.**

**Q29. Anything else your family does** that is not covered above (table talk
rules do not matter to the engine, but things like "the nest is shown face up
after the hand", "the dealer gets the nest if nobody bids above 100", or
special scoring for taking all the 14s do).

### Answers (2026-10-25)

Steven answered the questionnaire. These are the rules the engine implements;
each maps to a field in `src/game/rules.ts`.

| # | Rule | Engine |
| --- | --- | --- |
| 1, 3 | The 1s, 2s, 3s and 4s are removed (confirmed). 41 cards: 5–14 in four colors plus the Rook. 4-handed: 9 each + 5 nest. | `removedRanks: [1,2,3,4]` |
| 2 | 6-handed uses the same deck. 41 cards: 6 each + 5 nest. | derived |
| 4 | Rook is the highest trump. | `rookRank: 'high'` |
| 5, 6 | Rook 20, 5s 5, 10s 10, 14s 10. Total 120. | `points` |
| 7 | Must follow suit if able; the Rook may only be played when void in the led color or when trump is led. | `rookOnlyWhenVoid: true` |
| 8 | Rook led counts as a trump lead; others must play trump if able. | built in |
| 9 | Nest is 5 cards, 4- or 6-handed. | `nestSize: 5` |
| 10, 11, 12 | **Corrected by Steven later the same day:** the winning bidder **picks up all 5 Kitty cards**, then lays any 5 cards from their hand face down as the new Kitty. That face-down pile goes to the team that wins the last trick. **The top card of the Kitty is dealt face up** so everyone sees it while bidding; it goes into the bidder's hand with the rest. **Any cards may be laid down**, point cards and the Rook included (confirmed). | `bidderTakesNest: true`, `discardPointsAllowed: true`, `nestToLastTrick: true`, `nestTopExposed: true`, phase `nest` |
| 13–17 | Bidding starts left of dealer, clockwise; a pass is final; if everyone passes the dealer takes it at 65; dealer bids in turn. **Jump bids are allowed**: the opening bid can be any multiple of 5 from 65 up (80, say) and any later bid can jump by more than 5 (80 to 90, or 80 to 120). | `legalBids` |
| 17b | **Moon may only be a player's first call.** Once you have bid a number you cannot shoot later in the auction. (Steven, 2026-10-25.) | `moonOnlyAsFirstBid: true` |
| 18 | **Moon means the bidding team must take every trick.** | `moonRequiresAllTricks: true` |
| 19 | Partner plays normally on a Moon. | built in |
| 20 | Nest still goes to the last trick on a Moon (so the shooting team collects it by taking every trick). | built in |
| 21, 27 | No early stop. Every card is played even when a Moon is already lost. | `stopEarlyOnBrokenMoon: false` |
| 22 | Bidder names trump after laying down the Kitty, before the first lead. | phase `trump` |
| 23 | Bidder leads the first trick. | built in |
| 24, 25 | Must follow the led color; if void, anything. Highest trump wins, else highest of the led color. | `trick.ts` |
| 26 | No last-trick bonus beyond the nest. | built in |
| 28 | Rook holder recorded as the player dealt the Rook. If the Rook came up in the Kitty it is recorded as **"Kitty"**, not the bidder who picked it up (Steven). History shows "Rook: Kitty", stats credit nobody, and the manual hand form gets a Kitty chip too. | `rookHolderSeat`, `ROOK_IN_KITTY` |
| 29 | **Overshoot (confirmed):** when someone bids Moon, the dealer may (not must) "over shoot" and take the Moon themselves. Scored exactly like a normal Moon; the first shooter cannot respond; the auction ends. Because a Moon must be a first call (17b) and the dealer calls last in the first round, the dealer has never bid or passed when the offer comes, so the "dealer already passed" case cannot arise under these rules. If the dealer shoots, nobody can overshoot. | `dealerMayOvershoot: true` |
| 29b | **Throw the cards in (Steven, 2026-10-25):** a player on lead whose every card is unbeatable by anything still held (a trump nobody can top, or, when nobody else has trump left, a plain card nobody can top in its color) may end the hand at once; every remaining trick and the Kitty go to their team. The engine proves it before allowing it, so there is never a dispute. Bots do it automatically. | `canClaimRest`, action `claim` |
| 30 | Steven sent photos of the family deck: the classic Parker Brothers / Hasbro Rook deck. White faces; a big numeral top-left in the card's color with the color name printed vertically beside it ("RED", "BLACK", "GREEN", "YELLOW"); a small square badge with the point value under the numeral on point cards; a large numeral in the center inside a thin square frame; the whole index repeated upside down bottom-right. Green is a blue-green, yellow is golden. The Rook card is a drawn bird with "ROOK" vertical and a big "20". Backs are light blue with a scribbled texture and the ROOK logo. The `Card` component reproduces this layout; the back uses the same blue texture with the family's raven instead of the trademarked logo. | `Card.tsx` |
| 31 | Sound style: default stands (realistic card sounds, a few short musical cues for bids, trump, Moon, your turn). | `sound.ts` |
| 32 | **Voice notes: yes.** See 3.10. | messages `kind: 'voice'` |
| — | The family calls the nest the **Kitty**. Every screen says Kitty; the code keeps `nest` as the identifier. | |

---

## 2. Look and feel

You said you want the graphics to look nice, so this is a real work item, not
an afterthought. The plan below treats the card art and table as its own
phase with its own milestone.

What I propose:

- **Cards drawn as SVG components, not images.** They stay crisp at any size,
  color themselves from the suit, and animate with CSS. One `Card` component
  renders any of the 57 cards: big colored numeral top-left and bottom-right
  (upside down), a bold center numeral in the Rook style, a thin inner border,
  and a distinct Rook card with the bird (we already have the raven icon from
  the app icon and can reuse its silhouette).
- **The four Rook colors**, tuned for both light and dark phones, reusing the
  `TRUMPS` colors already in the app so trump chips and cards match.
- **A felt table** (deep green by default, dark navy in dark mode) with the
  trick in the middle, each played card sliding in from the side of the
  player who played it, the winner's card glowing briefly and the trick
  sweeping off toward the winning team.
- **Your hand as a fan** across the bottom in portrait. Cards you are allowed
  to play are raised and bright; illegal cards are dimmed. Tap to select, tap
  again (or drag up) to play. Cards sort by color then rank, trump on the
  right.
- **Opponents and partner** shown around the table with their avatar
  (existing `Avatar` component with emoji and color), card count, a "thinking"
  pulse on whose turn it is, and small chips for the current bid, trump, and
  trick count.
- **Bidding** as a big dial of 65–120 and a Moon button, with the bid history
  shown as speech bubbles next to each player.
- **Nest exchange** as a drag-to-discard tray.
- **Hand summary** card at the end of each hand: points per team, made or
  set, animated into the existing score board.
- **Sound effects that feel like a real table.** You asked for good ones, so
  they get real attention: a soft card slide for each play, a crisp snap when
  a card lands, a satisfying sweep when a trick is gathered, a wooden knock for
  a bid and a low "pass", a short brass flourish when trump is named, a rising
  fanfare for a Moon bid and a big one when it is made, a sad trombone-style
  slide for a set, and a gentle two-note chime (plus haptic buzz) when it is
  your turn. Sounds are synthesized with the Web Audio API or shipped as tiny
  compressed clips, so nothing noticeable is added to the download and they
  work offline. A mute toggle lives on the table screen; the setting is
  remembered per phone. Mobile browsers only allow audio after a tap, so the
  first tap on the table unlocks it silently.
- **Table chat.** A chat button on the table opens a slide-up panel over the
  bottom of the screen (your hand stays visible above it). Messages show the
  sender's avatar and name in their team color, and the newest message also
  pops up briefly as a bubble next to that player's seat so you can keep
  playing without opening the panel. A row of quick taps ("nice", "ouch",
  "hurry up", a laugh, a Rook bird) sends a reaction with one touch. An
  unread badge sits on the chat button, with the short message sound from the
  set above. Game events ("Abi bid 85", "Steven named green trump", "Team A
  takes the trick with the Rook") appear in the same stream in a muted style
  so the chat doubles as the hand's log. Table talk about your cards is the
  family's business, not the app's; nothing is filtered.

**Q30. Graphics preferences.** Anything you have in mind? For example: a
particular Rook deck's look you grew up with (the classic Parker Brothers
deck has solid colored numerals with a thin frame; newer decks use white
numerals in colored circles), felt color, whether you want the bird on the
back of the cards, and whether animations should be quick or showy. If you
have a photo of your family's deck, send it and I will match it.

**Q31. Sound preferences.** Realistic (actual recorded card and table sounds)
or playful (synthesized, game-like tones)? Default: realistic card sounds
with a few playful musical cues for bids, trump, Moon and your turn. Should
sound be on by default when someone opens the table, or off until they tap
the speaker? Default: on, with the mute toggle remembered.

**Q32. Chat.** Free text plus quick reactions is the default. Do you also
want voice notes (short recorded clips), or is text enough? Default: text and
reactions only. (Answered: yes to voice notes; see 3.10 for how they are
stored without Firebase Storage.)

---

## 3. Technical design

### 3.1 Where it fits

Everything stays inside the existing app and behind the existing passcode
gate. New routes:

| Route | Screen |
| --- | --- |
| `/play` | Lobby: open tables for this family, "new table" |
| `/play/:matchId` | The table: seat claiming, then bidding, Kitty exchange, trump, trick play, hand summary, driven by match phase |
| `/play/demo` | Single-phone demo against simple bots (local store only), used to build the UI before multiplayer exists |

A match is linked to a normal scorekeeper `Game`. Creating a table either
creates a new game (same form as today: players, teams, seats, first dealer)
or attaches to an active game. When a hand finishes, the client that resolves
the last trick calls the existing `store.addHand(gameId, …)` with
`dealerId`, `bidderId`, `bidTeam`, `bid`, `pointsTaken`, `moonMade`, `trump`
and `rookHolderId`. The game page, history and stats then work as they do
today with no changes. When totals reach 500 the match ends and the game is
marked finished exactly as the manual flow does.

### 3.2 Code layout

```
src/game/            pure engine, no React, no Firebase, fully unit tested
  cards.ts           Card type, deck construction per handedness, rank order, point values
  deal.ts            seeded shuffle (so a deal can be reproduced in tests), deal into seats + nest
  bidding.ts         bidding state machine
  trick.ts           legal plays, trick winner with Rook rules
  hand.ts            full hand state machine: deal -> bid (with overshoot) -> Kitty exchange -> trump -> play -> scored
  score.ts           points taken per team from tricks + discards, Moon early-exit, builds a scorekeeper HandInput
  bots.ts            simple legal-move bots for the demo table
  index.ts
src/play/            data layer and UI for online play
  matchStore.ts      MatchStore interface (mirrors DataStore style)
  localMatchStore.ts single-device implementation (demo mode and tests)
  firestoreMatchStore.ts
  hooks.ts           useMatch, useMySeat, useMyHand
  components/        Card, Hand (fan), Table, TrickPile, BidDial, NestTray, SeatBadge, HandSummary, ChatPanel, SpeechBubble
  pages/             PlayLobbyPage, TablePage, DemoTablePage
```

The engine is written as pure functions over immutable state:
`applyAction(state, action) -> state | error`. The same reducer runs in the
browser for optimistic UI, in the Firestore transaction that commits an
action, and in tests. Card identity is a short string like `R10`, `Y1`,
`ROOK` so documents stay small and readable.

### 3.3 Data model (Firestore)

New subcollections under the family. Nothing existing is modified.

```
families/{code}/matches/{matchId}                     public table state
families/{code}/matches/{matchId}/seats/{seatIndex}   PRIVATE: that seat's cards
families/{code}/matches/{matchId}/nest/current        PRIVATE: the Kitty (bidder reads it to pick up; face-down lay-down until the hand is over)
families/{code}/matches/{matchId}/hands/{n}           archive of each finished hand's plays (public, written at hand end)
families/{code}/matches/{matchId}/messages/{msgId}    table chat: players' messages, reactions and game events
```

**Match document** (public, everyone at the table reads it):

```ts
interface Match {
  id: string
  gameId: string                 // linked scorekeeper game
  handedness: 4 | 6
  hostUid: string                // created the table; can release seats, abandon match
  seats: Array<{                 // index = seat position, clockwise, same order as game.seatOrder
    playerId: string
    team: 'A' | 'B'
    uid: string | null           // Firebase anonymous uid of the phone holding this seat
    bot: boolean                 // filled by a bot that the host's phone moves (3.4b)
    cardCount: number            // so others can draw the right number of card backs
    connectedAt: number | null
  }>
  handNumber: number
  dealerSeat: number
  phase: 'seating' | 'dealing' | 'bidding' | 'overshoot' | 'nest' | 'trump' | 'playing' | 'handOver' | 'finished'
  dealSeed?: string              // see 3.5
  bidding: {
    turnSeat: number
    bids: Array<{ seat: number; bid: number | 'moon' | 'pass' }>
    highBid: number | 'moon' | null
    highSeat: number | null
  }
  bidderSeat: number | null
  bid: number | 'moon' | null
  trump: Trump | null
  turnSeat: number               // whose move, in every phase
  turnStartedAt: number          // for the 30-second clock (3.9)
  kittyTop: string | null        // the face-up Kitty card everyone can see
  trick: { leadSeat: number; plays: Array<{ seat: number; card: string }> }
  tricksTaken: Array<{ winnerSeat: number; cards: string[]; points: number }>
  pointsTaken: { A: number; B: number }   // running, from completed tricks only
  rookHolderPlayerId: string | null
  lastHand?: { bid, bidTeam, pointsTaken, made, moonMade, scorekeeperHandId }
  createdAt: number
  updatedAt: number
}
```

**Seat document** `seats/{seatIndex}` (private): `{ cards: string[] }`.
Written by the dealer when dealing (see 3.5) and by the seat's owner as cards
are played and discarded.

**Nest document** `nest/current` (private): `{ cards: string[] }`. Written by
the dealer at the deal. Readable by the bidder once bidding closes (to pick
the Kitty up), rewritten by the bidder with the laid-down cards, and readable
by everyone once `phase` is `handOver`, when its points are added to the last
trick. The face-up top card is copied to `kittyTop` on the public match doc.

**Message document** `messages/{msgId}`:
`{ uid, playerId, kind: 'text' | 'reaction' | 'event', text, createdAt }`.
Players write `text` and `reaction` messages for themselves; `event`
messages are written by the client that commits the move they describe, in
the same batch as the move. The table subscribes to the latest 100 messages
ordered by `createdAt`; older ones stay in Firestore but are not loaded.
Messages are deleted with the match when the host ends it.

Per-hand archive `hands/{n}` is written once at hand end by the resolving
client. It holds the bids, trump, every trick, and the discards, so a hand can
be reviewed ("who took the Rook?") and stats can grow later. It is not needed
for play.

### 3.4 Claiming a seat with an anonymous UID

Every phone already signs in anonymously (`ensureAnonymousUser` in
`src/firebase/app.ts`), and Firebase persists that uid in the browser, so the
same phone keeps the same uid across reloads and app restarts. That uid is the
seat key.

Flow:

1. Host creates the table. Seats are pre-filled from the linked game's
   `seatOrder` with `uid: null`.
2. Each phone opens `/play/:matchId` (from the lobby list; everyone already
   shares the family passcode so no extra invite code is needed). It sees the
   seats with player names and taps "That's me" on a free seat. The claim is a
   transaction: it succeeds only if `seats[i].uid` is still null.
3. Rejoin: on load, if `seats[i].uid == my uid` the phone drops straight into
   its seat. Works after reloads, backgrounding, and network drops.
4. New phone or cleared storage: the seat shows as taken. The host (or the
   player themself from another seat) can "release" a seat, setting `uid` to
   null, and the new phone claims it. The private seat doc does not move; it
   is keyed by seat index and the rule below re-checks the uid on every read.

### 3.4b Mixed tables: people and bots

The practice table is all bots, but an online table is for real people
first. Seats work like this:

- A table starts with every seat open. Family members claim seats from their
  phones as in 3.4. Nothing fills in automatically while the host is waiting
  for people.
- When the host is ready, any seat still open can be given to a bot with one
  tap ("Fill the rest with bots"), or left open for someone to join before
  the first deal. A bot seat shows a robot badge instead of a phone.
- A bot never takes a seat a person holds. If a person leaves mid-game, the
  host can hand that seat to a bot for the rest of the game (same takeover
  path as 3.9), and hand it back when they return.
- With no server, the host's phone runs the bots: when it is a bot's turn,
  the host client computes the move with `src/game/bots.ts` and commits it
  as that seat, after the same short pause a person would take. Firestore
  rules allow the host uid to act for seats marked `bot: true`. If the host's
  phone is closed, bots stop moving until it comes back, and the table says
  so ("Waiting for Steven's phone to move Hank").
- Bot seats write their cards to the same private seat documents, so the
  game looks identical to the other players and the hand archive stays
  complete.

The practice table remains available on its own as "you and bots" for
learning and for playing when nobody else is around.

### 3.5 Shuffling and dealing: who can be trusted?

This is the honest trade-off of the whole design.

Firestore security rules can say *who* may read a document, but nobody can
write a deal into Firestore without first holding every card in memory on
their device. Someone has to shuffle.

**Option A: Cloud Function deals.** A server function shuffles, writes each
seat doc and the nest, and nobody's phone ever sees other hands. This is the
only arrangement where cheating by a modified client is impossible.
**But Cloud Functions are not available on the free Spark plan.** They need
the Blaze (pay-as-you-go) plan, which means putting a card on the Firebase
project. Actual cost for a family would be $0.00/month (the free quota is
2 million invocations), but it is a billing-enabled project from then on,
and every later deploy needs the Firebase CLI. It also adds a cold-start
delay of a second or two at the start of each hand.

**Option B: a trusted dealer client (recommended for v1).** The phone sitting
in the dealer seat for that hand shuffles locally and writes, in one batch,
every seat doc, the nest doc, and the public match doc moving to `bidding`.
After the batch commits, the dealer's phone discards everything but its own
hand. Trade-offs, stated plainly:

- A family member who opened the browser developer tools on their phone at
  the exact moment they were dealing could read the whole deal. Nobody can do
  this on a hand they did not deal, and the dealer rotates every hand.
- Firestore rules can verify the deal is well formed (right card counts, no
  duplicates, all 45 cards accounted for) but cannot verify it was *random*.
- Mitigation that costs nothing: the dealer writes `dealSeed`, and each seat's
  cards are derived from the seed by the shared seeded shuffle. After the
  hand, when all cards are public, any phone can recompute the deal from the
  seed and confirm it matches what was dealt. This turns "could they have
  cheated" into "it would be visible afterwards".

For a family game this is the right trade: no billing, no server, and the
exposure is limited to the dealer of that one hand, who still has to go out of
their way to look. The code will keep dealing behind a `Dealer` interface so a
Cloud Function dealer can be swapped in later without touching the UI if the
family ever wants it.

**Option C: cryptographic shuffling (mental poker).** Provably fair without a
server. Far more complexity than this project deserves; mentioned only so you
know it exists.

### 3.6 Turn order, moves and realtime updates

Every phone holds an `onSnapshot` on the match doc and on its own seat doc,
through the same `useX` hook style as `useGame`/`useHands`. The UI is a pure
function of (match, my seat index, my cards), so a reload rebuilds the exact
screen.

A move (bid, lay down, name trump, play card, throw the cards in) is a Firestore **transaction**:

1. Read the match doc.
2. Check `phase` and that `turnSeat` is my seat.
3. Run the pure engine reducer on the public state plus my private cards. If
   the move is illegal the transaction aborts with a message shown locally.
4. Write the new match doc and my updated seat doc (card removed) together.
5. When a trick completes, the same transaction records the winner, adds the
   points, and sets `turnSeat` to the winner. When the last trick completes
   (or a Moon becomes impossible), the transaction moves `phase` to
   `handOver`, writes `lastHand`, and the client then calls
   `store.addHand(...)`. If that second write fails (phone dies), the next
   phone to load a `handOver` match without `lastHand.scorekeeperHandId`
   retries it, so a hand is never lost or double-counted.

Because every client runs the same reducer, two phones cannot both think it
is their turn: the transaction's read-check-write is atomic, and a stale
client's write is rejected and retried against fresh data.

Rules enforcement beyond "it is your turn" is client-side. A modified client
could play a card it does not hold. To blunt that, the rule for playing a card
requires that the card being removed from `seats/{i}` is the same card being
added to `match.trick.plays`, and that the seat doc shrinks by exactly one.
Full follow-suit legality is not checked by rules (they cannot see the hand
while also validating the public write cheaply); honest clients enforce it,
and the after-hand archive makes a bad play visible to everyone.

### 3.7 Firestore rules (to be added on the branch, not published until you say so)

Sketch; the real rules file will be more defensive.

```
match /families/{code}/matches/{matchId} {
  allow read: if signedIn() && validCode(code);
  allow create: if signedIn() && validCode(code)
    && request.resource.data.hostUid == request.auth.uid
    && request.resource.data.phase == 'seating';
  // Seat claims: only the claimant may write their own uid into an empty seat.
  // Moves: only the uid of seats[turnSeat] may change the game state.
  // Host: may release seats and abandon the match.
  allow update: if signedIn() && validCode(code) && (isSeatedPlayerMove() || isSeatClaim() || isHost());
  allow delete: if isHost();

  match /seats/{seatIndex} {
    // Only the phone holding this seat may read its cards.
    allow read: if signedIn() && matchDoc().seats[int(seatIndex)].uid == request.auth.uid;
    // The dealer writes every seat during 'dealing'; afterwards only the owner.
    allow write: if signedIn() && (
      (matchDoc().phase == 'dealing' && matchDoc().seats[matchDoc().dealerSeat].uid == request.auth.uid)
      || matchDoc().seats[int(seatIndex)].uid == request.auth.uid);
  }
  match /nest/current {
    allow read: if signedIn() && validCode(code) && (
      matchDoc().phase in ['handOver', 'finished']
      || (matchDoc().bidderSeat != null && matchDoc().seats[matchDoc().bidderSeat].uid == request.auth.uid));
    allow write: if (dealer during 'dealing') || (bidder during 'nest', writing exactly nestSize cards);
  }
  match /hands/{n} {
    allow read: if signedIn() && validCode(code);
    allow create: if signedIn() && seated player;
    allow update, delete: if false;
  }
  match /messages/{msgId} {
    allow read: if signedIn() && validCode(code);
    // Anyone seated may post as themselves; text capped at 500 chars.
    allow create: if signedIn() && seated player
      && request.resource.data.uid == request.auth.uid
      && request.resource.data.kind in ['text', 'reaction', 'event']
      && request.resource.data.text is string
      && request.resource.data.text.size() <= 500;
    allow update: if false;
    allow delete: if isHost();
  }
}
```

`matchDoc()` is `get(/databases/$(database)/documents/families/$(code)/matches/$(matchId)).data`.
Each `get` in a rule costs a read, which is fine at this scale (a hand is a
few hundred reads in total).

Everything under `/families/{code}/players`, `/games` and `/hands` keeps the
current rules word for word. I will not publish the new rules; when the data
layer is ready I will show you the full diff and you paste it into the
console yourself, as the README describes.

### 3.8 Local demo store

`localMatchStore.ts` implements the same `MatchStore` interface in memory for
the demo table and for tests, chat included (the bots answer with canned
lines so the panel can be built and styled offline). In demo mode all seats belong to the one phone,
and `bots.ts` plays the other three seats with simple legal moves (follow
suit, win cheaply, dump points on partner's winning trick). This is how the
whole UI gets built and polished before a single Firestore rule changes, and
it stays as a practice mode afterwards.

### 3.9 Reconnect, rejoin, timeouts

- **Reconnect:** Firestore's persistent cache (already enabled) replays the
  last known state instantly and resyncs. The seat uid survives reloads.
- **Rejoin from a different phone:** release and reclaim the seat (3.4).
- **Phone dies mid-move:** nothing is lost; the match doc is the only truth.
  The only client-side follow-up write is the scorekeeper hand (3.6), which
  is retried by whoever loads next.
- **Timeouts (one minute per decision, Steven's rule):** every decision a
  person has to make (bid, overshoot, lay-down, trump, play) gets a visible
  60-second clock. When it runs out, that player's own phone picks for them using the
  bot logic (the best legal card by the same heuristics the bots use) and
  commits the move, with a note that the table played for them. The
  practice table already does this.
  If their phone is closed or offline it cannot move for them, so the match
  doc records `turnStartedAt` on every move and the rules let **any seated
  player** read the stalled seat's cards and play for it once
  `request.time` is more than 60 seconds past `turnStartedAt`. The host's
  phone does this automatically (it already moves the bots), so a game never
  waits on an absent person for more than about a minute. Everyone sees
  "The table played for June". The seat keeps its uid; when the person
  comes back they simply continue.
- **Abandon:** the host can end a match; the linked game stays with whatever
  hands were recorded, exactly as if the family had stopped a paper game.

### 3.10 Voice notes

Correction to an earlier line in this doc: Firebase projects created after
October 2024 need the Blaze (billing-enabled) plan to create a Cloud Storage
bucket, so Storage is **not** available to this project on Spark.

Voice notes do not need it. A clip is recorded in the browser with
`MediaRecorder` (Opus in Chrome/Android, AAC in Safari/iOS), capped at 15
seconds, which is 30–60 KB. It is stored base64-encoded inside the chat
message document (`kind: 'voice'`, `audio`, `mimeType`, `durationMs`), well
under Firestore's 1 MiB document limit. Playback is a tap on the message; the
clip is cached locally after the first play. Rules cap `audio` at 200 KB.
Cost at family scale is negligible (a loud evening of 100 clips is ~5 MB of
storage and bandwidth; the free tier is 1 GiB stored and 10 GiB/month out).

Microphone access is requested on the first tap of the record button, and
the clip is sent only when the player lets go of the button, with a slide-to-
cancel like a messaging app.

---

## 4. Build order and effort

Effort is in focused working sessions of a few hours each, assuming the
questionnaire is answered. Each phase lands as small commits on
`online-play` with `npm test` and `npm run build` green.

| Phase | What | Effort | Done when |
| --- | --- | --- | --- |
| 0 | This plan, your answers | now | Questionnaire answered |
| 1 | **Engine** in `src/game/` with unit tests: deck per handedness, seeded deal, bidding, nest and discards, trump, legal plays, trick winner with Rook rules, points, Moon early-exit, conversion to scorekeeper `HandInput` | 1–2 sessions | Tests cover every rule in section 1, including the odd cases (Rook led, Rook when not void, everyone passes, Moon broken on a discard) |
| 2 | **Card graphics, sound and table** (section 2): `Card` SVG, hand fan, table, trick animation, bid dial, nest tray, sound set with mute; demo table at `/play/demo` against bots using the local store | 2–3 sessions | **First demo milestone:** you can open the app on your phone, tap Play, and play a full hand of Rook against bots with nice cards. Nothing online yet. |
| 3 | **Data layer**: `MatchStore` interface, local implementation, Firestore implementation, dealer, transactions, draft rules | 1–2 sessions | Two browser tabs on the dev server play against each other through Firestore (emulator or the real project under a test passcode) |
| 4 | **Multi-phone UI**: lobby, table creation from a game, seat claiming, rejoin, turn indicators, hand summary, chat panel with reactions and event log | 1–2 sessions | **Second milestone:** four phones on the family passcode play a full hand |
| 5 | **Wire to scorekeeper and polish**: write hands to the game, finish at 500, Rook holder, host controls, nudge, concede | 1 session | A full game played online appears in history and stats like any paper game |
| 6 | Publish rules and merge | when you say | Rules diff reviewed by you, pasted into the console; branch merged |

Total: roughly 7–10 sessions. Phases 1 and 2 need only your rule answers and
touch nothing shared, so they start as soon as you reply.

What I will not do without asking: push anything to `main`, publish Firestore
rules, open a PR, or change the deploy workflow.
