# Rook Scorekeeper

A mobile-first web app for keeping score in the card game **Rook**. Everyone in
the family opens it on their phone, enters the family passcode, and sees every
hand and running total update live. Hosted for free on GitHub Pages with
Firebase Firestore as the realtime database.

- 4-handed (2 v 2) and 6-handed (3 v 3) games
- Seat order, automatic dealer rotation with manual override
- Bids 50–120 and **Moon**, with the correct "jump to the next 500" moon scoring
- Live preview of the result before you save a hand
- Edit or delete any hand; every total after it is recomputed by replaying the game
- Game history and per-player stats
- Installable to the home screen (PWA), works offline and syncs when back online

Rules are fixed: 120 points per hand, play to 500, bids in steps of 5 with a
minimum of 50.

---

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and click **Add project**.
   Name it anything (e.g. `rook-scores`). Google Analytics is not needed; turn it off.
2. In the project, click the **Web** icon (`</>`) under "Get started by adding
   Firebase to your app". Give the app a nickname (e.g. `rook-web`). You do
   **not** need Firebase Hosting. Click **Register app**.
3. The console now shows a `firebaseConfig` object. Keep that tab open; you
   will paste these values in step 4. (You can always find it again later under
   **Project settings → General → Your apps → SDK setup and configuration → Config**.)

## 2. Enable Firestore

1. In the left menu choose **Build → Firestore Database → Create database**.
2. Pick a location close to you (e.g. `nam5 (us-central)`), then choose
   **Start in production mode** and click **Create**. (Production mode denies
   everything until you deploy the rules in step 5, which is what we want.)

## 3. Enable Anonymous sign-in

1. Left menu: **Build → Authentication → Get started**.
2. Open the **Sign-in method** tab, click **Anonymous**, switch **Enable** on,
   and **Save**.

The app signs each phone in anonymously behind the scenes. Nobody ever creates
an account or types a password; the family passcode is the only thing people
enter.

## 4. Paste the config into the app

Open [`src/firebase/config.ts`](src/firebase/config.ts). It looks like this:

```ts
export const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  storageBucket: 'PASTE_PROJECT_ID.appspot.com',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId: 'PASTE_APP_ID',
}
```

Replace each `PASTE_…` value with the matching value from the `firebaseConfig`
the console showed you in step 1. Keep the quotes. These values are **not
secret**: they only identify your project, and they are meant to ship inside
the website. Access is controlled by the security rules, not by hiding them.

Until this file is filled in, the app runs in **demo mode**: it works, but data
stays in that one browser and nothing syncs between phones.

> This copy already has the `rook-scores-36244` project config pasted in.

## 5. Deploy the Firestore security rules

The rules live in [`firestore.rules`](firestore.rules). Deploy them either way:

**Option A: paste in the console (easiest).**
Firestore Database → **Rules** tab → select everything in the editor, paste the
full contents of `firestore.rules`, click **Publish**.

**Option B: Firebase CLI.**

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # pick your project
firebase deploy --only firestore:rules
```

### Security model and its limits (please read)

- Every phone signs in anonymously. The rules require a signed-in user, so
  random internet traffic without the Firebase SDK is rejected.
- All data lives under `families/{passcode}/…`. A device can only read or write
  the family whose passcode it knows. There is no list of families to browse.
- **The passcode is the only secret.** Anyone who learns it (or guesses it) can
  read and change your scores. Pick something that is not guessable (a short
  phrase works well, e.g. `grandmas-table-1987`), and do not reuse a real password.
- There are no per-person accounts, so there is no audit of who changed what,
  and no way to lock out one device without changing the passcode for everyone.
- Firebase's free plan has generous quotas for a family app, but a malicious
  script that knows your passcode could run up reads/writes. Firebase lets you
  set budget alerts; the Spark (free) plan simply stops serving when quota is hit.

This is fine for a card-game scoreboard. It is **not** a design for anything
private or valuable. If you ever want that, add Firebase Authentication with
real accounts and tighten the rules to a list of allowed user IDs.

## 6. Put the code on GitHub and enable Pages

1. Create a new, empty repository on GitHub (public or private; Pages works on
   public repos for free, and on private repos with GitHub Pro).
   **Note the repository name.** The site will be served from
   `https://<your-username>.github.io/<repo-name>/`.
2. From this folder:

   ```bash
   git init
   git add .
   git commit -m "Rook scorekeeper"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```

3. On GitHub open the repo → **Settings → Pages**. Under **Build and
   deployment → Source**, choose **GitHub Actions**. That is the only setting
   needed.
4. Open the **Actions** tab. The "Deploy to GitHub Pages" workflow
   ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) runs the
   tests, builds the app, and publishes it. If it ran before you switched the
   Pages source, click **Re-run all jobs**. After a minute the site is live at
   the URL above.

Every later `git push` to `main` redeploys automatically.

### About the Vite `base` path

GitHub Pages serves project sites from a sub-path, so Vite needs to know the
repo name. The workflow sets it automatically from the repository name
(`VITE_BASE=/<repo-name>/`). The default in
[`vite.config.ts`](vite.config.ts) is `/rook/`; if you build by hand for Pages,
run `VITE_BASE=/<repo-name>/ npm run build`, or change the default in that file
to your repo name. Routing uses a `HashRouter` (`…/#/game/abc`), so refreshing
any screen works on Pages without a server rewrite.

## 7. Add it to your phone's home screen

Open the site URL in the phone's browser and enter the family passcode once;
the phone remembers it.

- **iPhone / iPad (Safari):** tap the **Share** button (square with an arrow)
  → **Add to Home Screen** → **Add**. It opens full-screen like an app.
- **Android (Chrome):** tap the **⋮** menu → **Add to Home screen** (or
  **Install app**) → **Install**.

The app caches itself, so it opens instantly and keeps working if the Wi-Fi
drops; changes made offline sync when the connection returns.

---

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173/rook/
npm test           # unit tests for scoring, seating, dealer rotation, stats
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

## How scoring works

Let **B** = bid, **P** = points the bidding team took, **T** = 120.

| Situation | Bidding team | Other team |
|---|---|---|
| Normal bid, P ≥ B (made) | +P | +(T − P) |
| Normal bid, P < B (set) | −B | +(T − P) |
| Moon made | total **set to** the next multiple of 500 above its current total | +0 |
| Moon missed | total **set to** the next multiple of 500 below its current total | +(T − P) |

Because a moon *sets* a total instead of adding to it, the app never stores
running totals. It stores only the hands and replays them in order through a
pure function ([`src/lib/scoring.ts`](src/lib/scoring.ts)) every time it
renders. Editing or deleting an early hand therefore recomputes everything after
it, on every phone, automatically. Scores can go negative.

Examples (all covered by unit tests in `src/lib/scoring.test.ts`):

- Bid 80, took 85 → bidders +85, other team +35.
- Bid 80, took 75 → bidders −80, other team +45.
- Moon at +10: made → 500, missed → 0. At −50: made → 0, missed → −500.
  At 0: made → 500, missed → −500. At 250: made → 500, missed → 0.
- Missed moon where the shooters had taken 95 → other team +25; taken 0 → +120.

When a team reaches 500 or more a banner appears, but the game does not end on
its own, so you can still fix a hand first. Tap **Finish game** to record the
result: the higher score wins, even if both teams passed 500 on the same hand
(an exact tie asks you to pick). Finished games can be reopened.

## Data model

```
families/{passcode}/players/{playerId}
  name, emoji?, color?, archived, createdAt

families/{passcode}/games/{gameId}
  handedness (4|6), teams { A: {name, playerIds}, B: {...} }, seatOrder[],
  firstDealerId, status ('active'|'finished'), winner?, createdAt, finishedAt?

families/{passcode}/games/{gameId}/hands/{handId}
  handNumber, dealerId, bidderId, bidTeam, bid (number | 'moon'),
  pointsTaken, moonMade? (moons only), rookHolderId?, createdAt
```

The dealer for the next hand is always the seat after the previous hand's
dealer (or the game's first dealer for hand 1), so a manual override on one hand
flows naturally into the following hands.

## Project layout

```
src/
  firebase/config.ts      ← paste your Firebase config here
  firebase/app.ts         Firebase init, anonymous sign-in, offline cache
  data/                   DataStore interface, Firestore + local demo stores, passcode handling
  lib/scoring.ts          pure scoring + replay (unit tested)
  lib/seating.ts          seat validation, dealer rotation, team names (unit tested)
  lib/stats.ts            per-player statistics (unit tested)
  pages/                  screens: passcode gate, games, players, new game, live game, hand form, stats, settings
  components/             scoreboard, hand table, dialogs, layout
firestore.rules           Firestore security rules
.github/workflows/deploy.yml   GitHub Pages deployment
```
