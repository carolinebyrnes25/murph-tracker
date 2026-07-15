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
  (no sign-in, isolated localStorage). Append `?dev=1` to force it. So on desktop you
  can open `index.html` locally / via a simple static server and it just works.

## Supplements model

`state.supps[dateKey]` = `{ creatine?: number, protein?: number }`.
- Creatine: toggle, 5g (`CREATINE_G`).
- Protein: toggle = "had a shake" (48g, `SHAKE_G`). Presence of `protein` means a
  shake was logged that day; absence means none. (Older data may hold arbitrary gram
  values from the previous free-text input — treated as "shake logged".)
