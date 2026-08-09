# BETLINK V2 — Upgrade Report

Upgraded in place from the existing project at `timiza254.github.io/betlink-`.
Nothing was rebuilt from scratch — the existing auth flow, live-fixture
picker, club colors, and admin resolve logic are all still there; this pass
adds a dashboard, wallet, profile, tabbed My Bets, marketplace search/sort,
a confirmation step before posting, toast notifications, and an admin
cancel/refund action with an activity log.

## Files changed

- `index.html` — added Dashboard, Wallet, Profile views; tabs on My Bets;
  search/sort controls on Open Bets; confirmation modal; toast host;
  expanded bottom nav (now scrollable).
- `app.js` — transaction logging, user stat counters (wins/losses/created/
  accepted), toast system, review-before-posting flow, admin cancel +
  activity log, search/sort/filter logic, all new view rendering.
- `style.css` — styling for every new component above.
- `README.md` — this report.

No changes were needed to `firebase-config.js`, `sports.js`,
`sports-config.js`, or `club-colors.js` — those are untouched.

## What works right now

- **Dashboard**: real balance, real open/active/won/lost counts, last 5
  transactions — all pulled live from Firestore, not placeholder numbers.
- **Create Bet**: validates stake > 0, stake <= balance, required fields;
  shows a Potential Return preview; requires a Confirm-before-posting step.
- **Marketplace (Open Bets)**: sport filter, text search, sort by newest,
  closing soon, lowest stake, or highest stake.
- **Accept Bet**: blocks accepting your own bet, blocks insufficient
  balance, re-validates inside the same atomic transaction.
- **My Bets**: tabs for All / Open / Active / Won / Lost / Cancelled.
- **Wallet**: balance, total won, total lost, total staked, full
  transaction history, all computed from real logged transactions.
- **Profile**: name, join date, bets created/accepted, wins, losses, win %.
- **Admin**: resolve matched bets (yes/no on the pick), cancel any open or
  matched bet with automatic stake refund, every admin action written to
  an `adminLog` collection.
- **Toasts** for bet posted / matched / resolved / cancelled / errors.
- **Empty states** on every list-based view.

## What's demo-only (by design, per your brief)

- **Money is virtual.** No deposits, withdrawals, or M-Pesa — just a
  starting balance of 1,000 BL Coins.
- **"Users" are anonymous browser sessions**, not real accounts. Clearing
  browser data or switching devices starts a fresh identity. There's no
  password anywhere, so nothing password-related needed hashing.
- **Odds are a fixed 1:1 payout** (stake x 2 to the winner) — not a real
  odds/pricing engine. Building actual variable odds is a separate, fairly
  large feature (see "What I'd build next").
- **Admin access is a shared local passcode**, not per-person admin
  accounts with real authentication.

## What still requires a real backend before this is more than a demo

This is a static site talking directly to Firestore from the browser —
there is no application server. That means, honestly:

- **Nothing here is safe against a motivated user editing requests in
  their own browser.** Firestore transactions stop lost updates between
  simultaneous users, but they don't stop someone from tampering with
  their own client. Real balance/payout logic needs to live behind a
  server (Cloud Functions or a proper API) that the browser can't bypass.
- **Firestore is still in "test mode"** (open read/write rules) from
  earlier setup — this needs locked-down security rules at minimum, and
  ideally all writes routed through a trusted backend, before this touches
  anything beyond play money.
- **The football-data.org API key is visible in the page source**, and
  fixture requests are routed through a public CORS proxy (documented in
  `sports.js`) because the API doesn't allow direct browser calls. Both
  of those are fine for a free-tier demo key, not for a production key or
  a paid data source.
- **No real authentication** — no password, no email verification, no
  account recovery.

## What I'd build next, in order

1. A real backend (even a small one) that owns balance changes and bet
   settlement, with the frontend only ever requesting actions, never
   computing balances itself.
2. Real accounts (email/password or OAuth) so a balance survives
   clearing browser data.
3. Locked-down Firestore security rules matched to whatever the
   backend actually needs the client to read directly.
4. A real odds/payout model if you want stakes to be asymmetric
   instead of a flat 1:1 split.
5. Everything under "Future modules" in your brief (KYC, payments,
   responsible-gambling controls, audit logs, fraud checks) — all of that
   is a legal/compliance project in its own right and shouldn't be
   attempted piecemeal.

## One heads-up on deploying this

Two of the new queries in app.js filter and sort in the same request.
Firestore sometimes needs a one-time "composite index" for that combo — if
a list ever looks stuck on "Loading...", check your browser's console for a
Firestore error with a Create index link, or open Firebase Console ->
Firestore -> Indexes and add one for whatever field pair it names. I
avoided this for the Admin view by sorting in JavaScript instead, but the
Open Bets and Wallet queries still combine a filter with a sort — they
matched a pattern that's historically worked fine in this app, but flagging
it in case Firestore's rules ever change.

## Deploying

Push all files (index.html, style.css, app.js, firebase-config.js,
sports.js, sports-config.js, club-colors.js) to the root of your repo,
same as before — GitHub will overwrite the ones that already exist.
