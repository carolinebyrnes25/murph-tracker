import { DEV } from "./config.js";
import { auth } from "./firebase.js";
import { $ } from "./util.js";
import { myName, onboardingIncomplete, ready, setRenderAll, user } from "./store.js";
import { setNavLocked } from "./nav.js";
import { devInit, handleRedirectResult, initAuth, showOverlay } from "./auth.js";
import { buildDiff, renderBanner, renderCoachNote, renderNext, renderProgress, renderRecovery, renderWeights } from "./workout.js";
import { renderSupps } from "./supps.js";
import { renderHist } from "./history.js";
import { renderProgressDash } from "./progress.js";
import { renderInputs, renderReminders } from "./inputs.js";

export function render(){
  if(!ready) return;
  // Re-evaluated on every repaint, so the gate lifts the moment the profile is complete and
  // re-arms for an existing user who signed in before these fields existed.
  setNavLocked(onboardingIncomplete());
  if(user && !DEV) $("who").textContent=myName();   // reflect the chosen name in the drawer
  renderRecovery();renderProgress();renderNext();renderWeights();renderHist();renderSupps();renderBanner();renderProgressDash();renderInputs();renderReminders();renderCoachNote();
}
/* ---------------- Boot ---------------- */
// Register the repaint hook BEFORE anything boots: devInit()/initUserData() call renderAll(),
// and until this runs that hook is a no-op — the app would load its data and never paint.
setRenderAll(render);

buildDiff();
if(DEV){
  // localhost: skip auth entirely, load the local test profile.
  devInit();
}else{
  initAuth();
  await handleRedirectResult();
  // onAuthStateChanged drives the rest; show overlay immediately if clearly signed out
  if(!auth.currentUser) showOverlay();
}
// Service worker ONLY in production (always-latest + offline). In preview/dev we skip it and
// actively clear any leftover SW/caches, so the preview always renders the newest file.
if(DEV){
  if("serviceWorker" in navigator){ navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{}); }
  if(self.caches){ caches.keys().then(ks=>ks.forEach(k=>caches.delete(k))).catch(()=>{}); }
}else if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js", {updateViaCache:"none"})
    .then(reg=>reg.update()).catch(()=>{});
}
