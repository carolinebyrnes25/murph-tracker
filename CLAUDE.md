# Murph Tracker — notes for Claude

Vanilla web app, no build step — GitHub Pages serves these files as-is.
State lives in `state` and persists to Firebase (Firestore) in prod, `localStorage` in dev.

## Layout — work in the ONE file your feature owns

```
index.html      markup only
app.css         all styles
js/config.js    firebase config, constants, DEV detection   (imports nothing)
js/plan.js      PHASE1 workout data + per-day `totals`      (imports nothing)
js/util.js      $, date/format helpers
js/firebase.js  fbApp / auth / db / provider
js/store.js     `state`, save(), derived helpers, setters, renderAll hook
js/auth.js      sign-in, dev boot, loading the user doc
js/nav.js       drawer + showView
js/charts.js    generic svgLine / svgBars
js/workout.js   next workout, weights, coach note, logging a session
js/supps.js     creatine + protein shake
js/history.js   history list + expandable detail, copy/undo/reset
js/progress.js  countdown, milestones, benchmarks, charts
js/inputs.js    goal inputs + reminders
js/app.js       render() + boot
```

This split exists so **parallel sessions don't collide** — a milestones change and a
reminders change now touch different files. Keep it that way: put a feature's code in its
own module rather than growing `app.js` or `store.js`.

Two rules the module graph depends on (see `js/store.js`):
- **`state`/`user`/`userRef`/`ready` are owned by `store.js`.** ES modules give importers a
  live *read* binding but only the owner may reassign, so use `setState()` / `setUser()` /
  `setUserRef()` / `setReady()` from other modules — a bare `state = …` will not compile.
- **Never import `app.js` from a feature module** — `app.js` imports the features, so that
  would cycle. To trigger a full repaint, call `renderAll()` from `store.js`; `app.js`
  registers the real `render()` via `setRenderAll()` before boot.

The dependency graph is acyclic: `config`/`plan` import nothing; features import
`config`/`util`/`plan`/`store`/`charts`/`nav`; only `app.js` imports features.

## Testing / verification

**Do NOT try to drive the running app in a remote/web Claude session.** The app
loads Firebase + Google sign-in from `gstatic.com`, which the remote environment's
network policy blocks (403 at the proxy). The top-level ES-module imports fail, so
the app never boots there — headless-browser click-throughs are a dead end and waste
tokens. Stubbing Firebase to work around it is not worth it.

- **In remote/web sessions:** verify changes by reading the diff. That's the right
  level of check for this codebase.
- **Interactive "try it in the real app" testing belongs on desktop or the live
  site**, where the CDN and auth actually work.
- Dev mode: any host that isn't `carolinebyrnes25.github.io` runs offline of Firebase
  (no sign-in, isolated localStorage). Append `?dev=1` to force it. So on desktop,
  serve the folder (`python -m http.server 8000`) and open `http://localhost:8000/index.html`.

### Always serve over http — never `file://`

**Serve the folder. Do not open `index.html` as a `file://` URL.** The Claude Code
Browser pane cannot use a `file://` tab at all: it reports "No site is open in this
tab" and every tool (`screenshot`, `javascript_tool`, `read_console_messages`) fails
against it. What the user sees is a broken, non-functioning page.

This matters because **the desktop app's built-in auto-preview opens exactly that tab
on every single edit to `index.html`, and fronts it.** It is not a configurable hook —
there is nothing in `settings.json` to switch off. So after editing `index.html`:

1. `tabs_context` → close any tab whose origin starts with `file://`
2. `tabs_select` the `http://127.0.0.1:<port>` tab (or create + navigate one)

Do that yourself; do not leave the user staring at the `file://` tab and do not ask
them to check the URL. If the pane "isn't rendering", this is almost always why.

## Goal inputs (the "Inputs" tab — formerly "Reminders")

The Inputs page (`view-inputs`) collects the profile values the app personalizes around:
- `state.murphDate` — `"YYYY-MM-DD"` target date. Replaces the old hardcoded `MURPH_DATE`;
  drives the Progress countdown. `murphDate()` / `parseYMD()` parse it as a local date.
- `state.daysPerWeek` — 1–7 weekly training cadence. Feeds `paceInfo()` (is the date
  realistic? how many weeks per phase?) and the push sender's rest-day threshold
  (`reminder-sender/send.js`, `u.daysPerWeek`, replacing the old hardcoded 4).
- `state.bodyweight` — single value (no longer entered daily). Powers `proteinGoal()`.
- `state.name` — preferred name. `myName()` (chosen name, else `nameFor(email)`) is used by
  the coach note, copy log, and drawer.
- `state.gender` — `"m"`/`"f"`. `vestWeight()` returns 20 (m) / 14 (f), used in the Murph
  milestone label and the milestones intro (`#vest-inline`).

These fields persist top-level in the Firestore doc so `send.js` can read them.
`onboardingIncomplete()` (missing name, gender, date, days/week, or weight) routes first-time users to
the Inputs page on boot. The bodyweight trend chart and `weightLog` were removed.

## Supplements model

`state.supps[dateKey]` = `{ creatine?: number, protein?: number }`.
- Creatine: toggle, 5g (`CREATINE_G`).
- Protein: toggle = "had a shake" (48g, `SHAKE_G`). Presence of `protein` means a
  shake was logged that day; absence means none. (Older data may hold arbitrary gram
  values from the previous free-text input — treated as "shake logged".)
