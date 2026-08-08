# Betlink (test build — virtual coins only)

A peer-to-peer bet-matching app. Betlink never holds a position itself — one user
writes the terms and stake, another matches it, and you (the admin) settle who won.
Right now everything runs on virtual coins, so there's no money-handling or licensing
question to solve yet.

## How it works

1. Open the link — no login, just type your name once. It starts you with 1,000 virtual coins.
2. They write a slip: pick a live match and a side (or write custom terms), set a stake.
3. Someone else matches it — both stakes get locked.
4. Once the deadline's passed, you (admin) mark yes/no in the Admin tab.
5. The winner gets both stakes automatically.

**Admin access:** tap the **Admin** button in the top bar and enter your passcode
(set in `firebase-config.js` under `ADMIN_PASSCODE`). This unlocks the Admin tab
on that device until you clear browser data or log out.

**Note on this identity model:** since there's no login, each person's account is
tied to their browser (an anonymous Firebase session). Clearing browser data,
using a different browser, or switching devices starts a fresh account. Fine for
testing; worth adding real accounts back before a public launch so people don't
lose their balance.

## Live match betting

The **Create bet → Live match** tab pulls real, upcoming Premier League
fixtures. You pick a match and pick a side ("Arsenal to win"); whoever
matches your slip is effectively betting against that exact claim. At
resolution time you just confirm yes/no — did the picked outcome happen.

The **Custom** tab still exists for any bet that isn't a straightforward
match result (props, combos, non-football, etc.) — same free-text flow as
before.

### Setting up live fixtures (optional, ~2 minutes)

1. Get a free API key at https://www.football-data.org/client/register
2. Open `sports-config.js` and paste your key into `FOOTBALL_DATA_TOKEN`.
3. That's it — the free tier covers the Premier League (`PL`) and a few
   other top leagues; change `COMPETITION_CODE` if you want a different one.

If you skip this, the Live match tab will show a message pointing people
to the Custom tab instead — nothing breaks.

**Note on the key being public:** since GitHub Pages only serves static
files, this key is visible to anyone who views your page source. That's a
low-stakes exposure for a free-tier key (rate-limit abuse at worst) — just
don't drop a paid-tier key into this same spot later without moving fixture
fetching behind a small server first.

## One-time setup (about 10 minutes)

You need a free Firebase project — it handles logins and stores the data, no server
for you to run.

1. Go to https://console.firebase.google.com → **Add project** → name it (e.g. `betlink`).
2. In the project, go to **Build → Authentication → Get started** → enable
   **Anonymous** as a sign-in method (under "Native providers" or "Additional providers").
3. Go to **Build → Firestore Database → Create database** → start in **test mode**
   for now (we'll lock it down before you launch publicly).
4. Go to **Project settings** (gear icon) → scroll to **Your apps** → click the
   **</>** (web) icon → register the app (any nickname) → it'll show you a
   `firebaseConfig` object.
5. Open `firebase-config.js` in this project and paste your values in — replace
   every `"YOUR_..."` placeholder.
6. In the same file, set `ADMIN_PASSCODE` to whatever passcode you want to use
   to unlock the Admin tab on your device.

## Deploying to GitHub Pages

1. Push all these files (`index.html`, `style.css`, `app.js`,
   `firebase-config.js`, `sports.js`, `sports-config.js`, `club-colors.js`)
   to the root of your repo — same level, no subfolder.
2. In repo Settings → Pages, confirm source is `main` branch, `/ (root)`.
3. Visit `https://<yourusername>.github.io/<repo-name>/` (case-sensitive).

## Before you'd ever use real money or go public

Two things worth doing ahead of that, not now:

- **Firestore security rules** — test mode leaves your database wide open. Before
  any real users touch this, rules need to restrict writes (e.g. a user can only
  edit their own balance via the transaction logic, not directly).
- **Legal/licensing check** — even as a "third party" matching two bettors rather
  than taking the position yourself, moving real money between users for wagers
  typically requires a gambling or money-transmission license depending on your
  country. Worth a proper look before this becomes real-money.

## What's not built yet (ideas for next passes)

- Password reset flow
- Editing/cancelling an open bet before it's matched
- Push notifications when your bet gets matched or resolved
- Dispute flow (right now the admin's ruling is final)
