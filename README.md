# Murph Tracker — Phase 1

A single-file web app for tracking a "from-zero" training build toward completing the **Murph** challenge (1-mile run → 100 pull-ups → 200 push-ups → 300 squats → 1-mile run, unweighted).

It shows the next workout in an A→B→C→D rotation, records completion + a 1–10 difficulty rating, logs daily supplements (creatine + protein), keeps a color-coded history, and has a **Copy log** button that exports everything as plain text to paste back into a coaching chat.

## How it works

- **One file:** `index.html` — all HTML, CSS, and vanilla JavaScript. No build step, no backend, no dependencies (Google Fonts loads over the network with a system-font fallback).
- **Storage:** the browser's `localStorage`, under the key `murph:state`. Data is **per-device** — it lives only in the browser it was entered in and is never transmitted anywhere.
- **Session #1** (Jul 13, 2026 — Day A, 7/10) is pre-loaded on a first-ever visit so the log reflects reality out of the box. A **Reset** clears everything for good.

## Live site

Hosted on GitHub Pages. Open the URL on a phone and "Add to Home Screen" for an app-like shortcut.

## Customizing

Everything is in `index.html`:
- **Workouts:** the `PHASE1` object at the top of the `<script>` defines each day and its exercises.
- **Plan length / rotation:** `PHASE1_SESSIONS` (16) and the `ORDER` array (`["A","B","C","D"]`).
- **Colors / fonts:** CSS custom properties in the `:root` block.
