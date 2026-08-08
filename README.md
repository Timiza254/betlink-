# Betlink (test build — virtual coins only)

A peer-to-peer bet-matching app. Betlink never holds a position itself — one user
writes the terms and stake, another matches it, and you (the admin) settle who won.
Right now everything runs on virtual coins, so there's no money-handling or licensing
question to solve yet.

## How it works

1. Someone signs up and starts with 1,000 virtual coins.
2. They write a slip: plain-language terms, a stake, a resolve-by date.
3. Someone else matches it — both stakes get locked.
4. Once the deadline's passed, you (admin) mark a winner in the Admin tab.
5. The winner gets both stakes automatically.

## One-time setup (about 10 minutes)

You need a free Firebase project — it handles logins and stores the data, no server
for you to run.

1. Go to https://console.firebase.google.com → **Add project** → name it (e.g. `betlink`).
2. In the project, go to **Build → Authentication → Get started** → enable
   **Email/Password** as a sign-in method.
3. Go to **Build → Firestore Database → Create database** → start in **test mode**
   for now (we'll lock it down before you launch publicly).
4. Go to **Project settings** (gear icon) → scroll to **Your apps** → click the
   **</>** (web) icon → register the app (any nickname) → it'll show you a
   `firebaseConfig` object.
5. Open `firebase-config.js` in this project and paste your values in — replace
   every `"YOUR_..."` placeholder.
6. In the same file, set `ADMIN_EMAILS` to the email address(es) you'll sign up
   with — that's what unlocks the Admin tab for you.

## Deploying to GitHub Pages

1. Push all these files (`index.html`, `style.css`, `app.js`, `firebase-config.js`)
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
