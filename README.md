# Murph Tracker

A web app for tracking a "from-zero" training build toward completing the **Murph** challenge (1-mile run → 100 pull-ups → 200 push-ups → 300 squats → 1-mile run, unweighted).

It shows the next workout in an A→B→C→D rotation, records completion + a 1–10 difficulty rating, logs daily supplements (creatine + protein), keeps a color-coded history, shows a partner's progress, and has a **Copy log** button that exports everything as plain text to paste back into a coaching chat.

## How it works

- **One file:** `index.html` — HTML, CSS, and vanilla JavaScript, plus the Firebase web SDK loaded from a CDN. No build step.
- **Accounts:** sign in with Google (passwordless). Access is limited to an allowlist of approved accounts, defined in the `ALLOWLIST` array in `index.html` and enforced server-side by `firestore.rules`.
- **Storage:** each user's log is stored in Cloud Firestore under `users/{uid}`, so it syncs across that user's devices and survives a browser wipe / new phone. A local cache is also kept for instant loads and offline resilience.
- **Partner view:** approved users can see each other's progress (read-only); each person can only edit their own log.
- **Migration:** on a user's first Google sign-in, any pre-existing per-device `localStorage` log (from the old single-user version) is migrated up to the cloud.

## Live site

Hosted on GitHub Pages: https://carolinebyrnes25.github.io/murph-tracker/ — open on a phone and "Add to Home Screen" for an app-like shortcut. Updates pushed to `main` redeploy automatically.

## Firebase setup

- Project: `murph-tracker-c94db` (free Spark plan).
- **Authentication:** Google sign-in provider enabled; `carolinebyrnes25.github.io` in the authorized domains.
- **Firestore:** rules in `firestore.rules` restrict reads to approved accounts and writes to each user's own document.

## Customizing

Everything is in `index.html`:
- **Approved accounts / names:** `ALLOWLIST` and `NAMES` near the top of the `<script>` (also update `firestore.rules` to match).
- **Workouts:** the `PHASE1` object defines each day and its exercises.
- **Plan length / rotation:** `PHASE1_SESSIONS` (16) and the `ORDER` array (`["A","B","C","D"]`).
- **Colors / fonts:** CSS custom properties in the `:root` block.
