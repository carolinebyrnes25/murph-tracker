import { $ } from "./util.js";

/* ---------------- Dark / light theme ----------------
   Device-local display preference, persisted in localStorage (independent of Firebase, so it
   applies before sign-in and never waits on the network). The theme is FIRST applied by a tiny
   inline script in index.html <head> — before the stylesheet paints — so there's no flash of the
   wrong theme on load. This module re-applies it (idempotent), wires the drawer toggle, and keeps
   following the OS setting until the user makes an explicit choice. */
const KEY = "murph-theme";
const META = { dark: "#14171B", light: "#F3F4EF" };  // browser chrome (status bar) per theme

// The user's explicit choice if they've made one, otherwise the OS preference.
export function currentTheme(){
  const saved = localStorage.getItem(KEY);
  if(saved === "dark" || saved === "light") return saved;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(t){
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", META[t] || META.light);
  const btn = $("theme-toggle");
  if(btn){
    const dark = t === "dark";
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
    // The button offers the OTHER mode — that's the action it performs.
    const icon = btn.querySelector(".tt-icon"), label = btn.querySelector(".tt-label");
    if(icon)  icon.textContent  = dark ? "☀️" : "🌙";
    if(label) label.textContent = dark ? "Light mode" : "Dark mode";
  }
}

export function toggleTheme(){
  const next = currentTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(KEY, next);   // an explicit choice — from now on we stop following the OS
  applyTheme(next);
}

export function initTheme(){
  applyTheme(currentTheme());
  const btn = $("theme-toggle");
  if(btn) btn.onclick = toggleTheme;
  // Follow the OS live, but only while the user hasn't overridden it.
  try{
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if(!localStorage.getItem(KEY)) applyTheme(e.matches ? "dark" : "light");
    });
  }catch(_){ /* older Safari: no matchMedia change events — the inline script's default still applies */ }
}
