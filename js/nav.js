import { $ } from "./util.js";

/* ---------------- Navigation (hamburger drawer + views) ---------------- */
export const VIEWS=["workout","supps","history","progress","inputs"];
export function openDrawer(){ $("drawer").classList.add("open"); $("drawer-backdrop").classList.add("show"); }
export function closeDrawer(){ $("drawer").classList.remove("open"); $("drawer-backdrop").classList.remove("show"); }
export function showView(v){
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
