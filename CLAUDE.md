# Murph Tracker — notes for Claude

Single-file web app: `index.html` holds all markup, CSS, and JS (an ES module).
State lives in `state` and persists to Firebase (Firestore) in prod, `localStorage` in dev.

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

## Supplements model

`state.supps[dateKey]` = `{ creatine?: number, protein?: number }`.
- Creatine: toggle, 5g (`CREATINE_G`).
- Protein: toggle = "had a shake" (48g, `SHAKE_G`). Presence of `protein` means a
  shake was logged that day; absence means none. (Older data may hold arbitrary gram
  values from the previous free-text input — treated as "shake logged".)
