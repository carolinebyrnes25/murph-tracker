import { $ } from "./util.js";

/* ---------------- Navigation (hamburger drawer + views) ---------------- */
export const VIEWS=["workout","supps","history","progress","inputs"];
export function openDrawer(){ $("drawer").classList.add("open"); $("drawer-backdrop").classList.add("show"); }
export function closeDrawer(){ $("drawer").classList.remove("open"); $("drawer-backdrop").classList.remove("show"); }

// Onboarding gate. The goal inputs drive the plan, the countdown, the vest load, the protein
// target and the reminders — a half-set profile means a wrong plan everywhere. So until they're
// all filled, `showView` itself refuses to leave Inputs: disabling the nav buttons alone would
// leave any other showView() caller (boot, save, a future feature) able to route around it.
// Sign-out stays reachable so nobody is trapped in the gate.
let locked=false;
export function setNavLocked(v){
  locked=!!v;
  document.querySelectorAll(".nav-item").forEach(b=>{
    const off = locked && b.dataset.view!=="inputs";
    b.classList.toggle("locked", off);
    b.setAttribute("aria-disabled", off?"true":"false");
  });
  const note=$("nav-lock-note"); if(note) note.hidden=!locked;
}
export function navLocked(){ return locked; }
export function showView(v){
  if(locked && v!=="inputs") return;
  VIEWS.forEach(x=>{ const el=$("view-"+x); if(el) el.hidden=(x!==v); });
  document.querySelectorAll(".nav-item").forEach(b=>{
    const on=b.dataset.view===v; b.classList.toggle("active", on);
    if(on) $("topbar-title").textContent=b.dataset.title;
  });
  closeDrawer();
  window.scrollTo(0,0);
}
$("menu-btn").onclick=openDrawer;
$("drawer-backdrop").onclick=closeDrawer;
document.querySelectorAll(".nav-item").forEach(b=>{ b.onclick=()=>showView(b.dataset.view); });
