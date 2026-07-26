# Murph Tracker — handover note

Running log of what's been built and what's open, so a fresh session (or Caroline) can pick up
without re-deriving everything. Newest work at the top. See `CLAUDE.md` for the architecture and
module layout; this file is state + history + gotchas.

## What this app is
- Vanilla JS PWA (no build step), served by **GitHub Pages** at
  `https://carolinebyrnes25.github.io/murph-tracker/`.
- State persists to **Firebase Firestore** (project **`murph-tracker-c94db`**) in prod;
  `localStorage` in dev. Open sign-up — any Google account gets its own private tracker
  (privacy enforced per-uid by `firestore.rules`, not an allowlist).
- Two server-side pieces outside the static site:
  - `reminder-sender/` — push-notification sender, GitHub Actions cron (`reminder.yml`),
    auth via the `FIREBASE_SERVICE_ACCOUNT` repo secret (scoped to Firestore/FCM only).
  - `functions/` — Firebase Cloud Function AI proxy (see "AI coach note" below).

## Session history (most recent first)

### AI coach note — Gemini Flash (LIVE)
- After a workout is logged, `js/workout.js` shows the instant rule-based note, then
  `enhanceCoachNote()` calls a Cloud Function that asks **Gemini** to rewrite it so it responds to
  the athlete's free-text feedback (the original complaint: the note went only off the difficulty
  number, ignoring "I did unassisted pull-ups instead of assisted"). Best-effort; falls back to the
  rule-based note on any failure. Skipped in DEV.
- Backend: `functions/index.js` = protected proxy `askAI` (`onRequest`, CORS to the Pages origin,
  Firebase ID-token auth + allow-list [Caroline, Luke, Diana, Lloyd], `AI_API_KEY` secret,
  `gemini-flash-latest`, `thinkingConfig.thinkingBudget: 0`, model hardcoded).
- Deploy: `.github/workflows/deploy-functions.yml`, triggers on `functions/**` push or manual
  dispatch. **Auth is `FIREBASE_TOKEN`** (a `firebase login:ci` repo secret), NOT the reminder
  service account — see gotchas.
- Status: deployed & live (PRs #20 → #21 → #22, all merged). Setup done: Blaze plan on
  `murph-tracker-c94db`, `AI_API_KEY` secret set, `FIREBASE_TOKEN` repo secret set.
- **Still to confirm on the live site:** log a workout with a written note as Luke and check the
  note upgrades to the AI version a second later. (Couldn't test from a remote session — see
  "Testing" below.) If it doesn't swap, check the function logs in the Firebase console.

### Input-time cadence/date reconciliation (merged; Pages deploy)
- PR #23. The Inputs pace read-out now reconciles a target date that's looser than the chosen
  cadence: shows the projected finish + weeks of slack and a one-tap "Move target to <finish>"
  (fires only when slack ≥ 3 weeks). `paceInfo()` in `store.js` gained `finish` + `slackWeeks`;
  logic in `updatePaceReadout()` in `inputs.js`.
- Root problem it fixed: Luke set "4×/week" AND "Dec 31", but 4×/week finishes the fixed
  64-session program ~8 weeks before Dec 31, so the workout screen kept offering to pull the date
  in even though he trained exactly as planned. The two inputs were never reconciled.

### Pain-detector false positive (LIVE)
- PR #19. The post-session pain scan matched the bare word "pull" (`pull(ed)?`), so
  "struggling on the assisted pull ups" read as a pain report — falsely triggering the recovery
  card and blocking earned forward jumps. Dropped "pull"/"pulled" from the keyword set
  (`js/workout.js`); a real pulled muscle still trips "strain(ed)".

### Email allowlist (reverted — no-op)
- Sign-up is open, so there's no allowlist to add to. Briefly added Diana/Lloyd display names to
  `NAMES`, then reverted at Caroline's request. (They're now on the AI allow-list in
  `functions/index.js`, which is a separate thing — who may call the paid endpoint.)

## Gotchas learned (don't rediscover these)
- **Functions deploy auth:** the reminder `FIREBASE_SERVICE_ACCOUNT` can't deploy functions or
  enable Google APIs (403). Use `FIREBASE_TOKEN` (`firebase login:ci`) — same as the
  byrnes-finance repo. This is now what `deploy-functions.yml` uses.
- **No `defineString` params in CI:** Firebase's `--non-interactive` deploy errors on a
  `defineString` param even with a default ("no value for AI_MODEL"). Hardcode such values or write
  a `functions/.env`. Secrets (`defineSecret`) are fine.
- **Deploy trigger:** `deploy-functions.yml` only fires on `functions/**` changes. If you change
  only the workflow file, trigger it manually (Actions → Run workflow, or `workflow_dispatch`).
- **Git proxy can't delete remote branches** in these sessions (`git push --delete` reports
  "Everything up-to-date" and no-ops). Delete stale branches in the GitHub UI. NOTE: the old
  `claude/allowlist-email-addresses-cl5bxg` branch may still exist — safe to delete.

## Related repos (patterns copied, NOT dependencies)
- `carolinebyrnes25/baby-answers` and `carolinebyrnes25/byrnes-finance-dashboard` each have the same
  shape of Gemini Ask-AI proxy. Murph's function copies the *pattern* only — no cross-repo imports,
  its own Firebase project, its own endpoint. Reusing the same Gemini API key across all three is
  fine (creates no coupling).

## Testing / environment constraints
- **Remote/web Claude sessions can't drive the live app** — Firebase + Google sign-in load from
  `gstatic.com`, blocked by the network policy, so the app never boots. Verify changes by reading
  the diff + syntax-check; do interactive testing on desktop (`?dev=1` for offline dev mode) or the
  live site. (This is why the AI note and the #23 UI still need a live human check.)

## Open / optional (not started)
- Confirm the AI coach note works end-to-end on the live site (see above).
- Optional: make the *workout-screen* "move my target in" nudge less eager in the first ~2 weeks
  (partly mitigated by the #23 input-time reconciliation; not done).
- Considered and declined: replacing the rule-based plan engine with AI. The deterministic
  progression (phases, benchmark gates, deloads) is sound; AI only adds value in the coaching layer,
  which is what the coach note now does.
