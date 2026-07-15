import { getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { DEV_KEY, HUSBAND_EMAIL, LEGACY_KEY } from "./config.js";
import { auth, db, provider } from "./firebase.js";
import { $, nameFor } from "./util.js";
import { showView } from "./nav.js";
import { murphDate, normalizeState, onboardingIncomplete, renderAll, save, seedState, setReady, setState, setUser, setUserRef, user, userRef } from "./store.js";

/* ---------------- Auth ---------------- */
export const overlay=$("auth-overlay");
export function showOverlay(msg,isErr){
  overlay.hidden=false; $("topbar").style.visibility="hidden";
  if(msg){ $("auth-note").textContent=msg; $("auth-note").className="auth-note "+(isErr?"err":"ok"); }
}
export function hideOverlay(){ overlay.hidden=true; $("topbar").style.visibility="visible"; }
$("auth-send").onclick=async()=>{
  const btn=$("auth-send"); btn.disabled=true; btn.textContent="Opening Google…";
  $("auth-note").textContent="";
  try{
    await signInWithPopup(auth, provider); // onAuthStateChanged takes over on success
  }catch(e){
    if(e.code==="auth/popup-blocked" || e.code==="auth/operation-not-supported-in-this-environment"
       || e.code==="auth/cancelled-popup-request"){
      // Popups are often blocked in home-screen/mobile webviews — fall back to full-page redirect.
      try{ await signInWithRedirect(auth, provider); return; }
      catch(e2){ $("auth-note").textContent="Sign-in failed: "+(e2.code||e2.message); $("auth-note").className="auth-note err"; }
    }else if(e.code==="auth/popup-closed-by-user"){
      $("auth-note").textContent="";
    }else{
      $("auth-note").textContent="Sign-in failed: "+(e.code||e.message); $("auth-note").className="auth-note err";
    }
  }finally{ btn.disabled=false; btn.textContent="Continue with Google"; }
};
$("signout").onclick=async()=>{ await signOut(auth); };
export async function handleRedirectResult(){
  // Surfaces errors from the redirect flow; success is handled by onAuthStateChanged.
  try{ await getRedirectResult(auth); }
  catch(e){ if(e && e.code) showOverlay("Sign-in failed: "+e.code, true); }
}
export function initAuth(){
 onAuthStateChanged(auth, async (u)=>{
  if(u){
    const email=(u.email||"").toLowerCase();
    setUser(u); hideOverlay();
    $("who").textContent=nameFor(email);
    await initUserData(email);
  } else {
    setUser(null); setUserRef(null);
    showOverlay();
  }
 });
}
// Local test mode: no sign-in, no cloud. State persists to a separate localStorage key only.
export function devInit(){
  setUser({email:"dev@local",uid:"dev"}); setUserRef(null);   // userRef null => save() never hits Firestore
  let saved=null;
  try{ const raw=localStorage.getItem(DEV_KEY); if(raw) saved=JSON.parse(raw); }catch(e){}
  setState(saved || {completed:[],supps:{},plan:"murph-phase1",bodyweight:null,weights:{},murphDate:null,daysPerWeek:null});
  normalizeState();
  hideOverlay();
  $("who").textContent="🔧 Local test (no cloud)";
  setReady(true); renderAll();
  if(onboardingIncomplete()) showView("inputs");   // first run: go set your goal inputs
}
export async function initUserData(email){
  setUserRef(doc(db,"users",user.uid));
  let snap=null;
  try{ snap=await getDoc(userRef); }catch(e){}
  if(snap && snap.exists() && Array.isArray(snap.data().completed)){
    const d=snap.data();
    setState({completed:d.completed||[], supps:d.supps||{}, plan:d.plan||"murph-phase1", bodyweight:d.bodyweight||null, weights:d.weights||{}, murphDate:d.murphDate||null, daysPerWeek:d.daysPerWeek||null, fcmTokens:d.fcmTokens||[], reminderPrefs:d.reminderPrefs||null, coachNote:d.coachNote||null, recoveryDue:!!d.recoveryDue, recoveryReason:d.recoveryReason||null, deload:d.deload||{active:false,left:0,cooldown:0}, milestones:d.milestones||{}, benchmarks:d.benchmarks||[]});
  }else{
    // New profile. Only the husband inherits the pre-cloud Session #1 backfill /
    // any log already stored on his device; everyone else starts clean.
    if(email===HUSBAND_EMAIL){
      let legacy=null;
      try{ const raw=localStorage.getItem(LEGACY_KEY); if(raw) legacy=JSON.parse(raw); }catch(e){}
      setState((legacy && Array.isArray(legacy.completed) && legacy.completed.length)
        ? {completed:legacy.completed, supps:legacy.supps||{}, plan:"murph-phase1", weights:legacy.weights||{}}
        : {...seedState(), plan:"murph-phase1", weights:{}});
    }else{
      setState({completed:[], supps:{}, plan:"murph-phase1", weights:{}});
    }
    await save();
  }
  normalizeState();
  setReady(true);
  renderAll();
  if(onboardingIncomplete()) showView("inputs");   // first run: go set your goal inputs
}
