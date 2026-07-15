import { setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { CACHE_KEY, DEV, DEV_KEY, PROGRAM_SESSIONS } from "./config.js";
import { nameFor, parseYMD } from "./util.js";

export let state={completed:[],supps:{}};
export let user=null;
export let userRef=null;
export let ready=false;
// The name to greet the user by: their own choice (Inputs page) wins over the email-derived default.
export function myName(){ return (state.name && state.name.trim()) || nameFor((user&&user.email||"").toLowerCase()); }
// Weighted-vest load for the final Murph, by gender: 20 lb (men) / 14 lb (women). Default 20.
export function vestWeight(){ return state.gender==="f" ? 14 : 20; }
// Protein target derived from bodyweight (lb): plan calls for 0.7–1.0 g/lb.
// "Everyday" target ≈ 0.8 g/lb; range spans 0.7–1.0.
export function proteinGoal(){ return state.bodyweight>0 ? Math.round(state.bodyweight*0.8) : null; }
export function proteinRange(){ return state.bodyweight>0 ? [Math.round(state.bodyweight*0.7), Math.round(state.bodyweight)] : null; }
export function murphDate(){ return state.murphDate ? parseYMD(state.murphDate) : null; }
// Is a target date reachable at a chosen weekly cadence? Null until both are given.
// Params are explicit so the Inputs page can preview unsaved values too.
export function paceInfo(md, dpw, completedLen){
  if(!md || !(dpw>0)) return null;
  const today=new Date(); today.setHours(0,0,0,0);
  const weeksUntil=Math.max(0,(md-today)/(7*86400000));
  const sessionsRemaining=Math.max(0,PROGRAM_SESSIONS-(completedLen||0));
  const weeksNeeded=Math.ceil(sessionsRemaining/dpw);
  const weeksPerPhase=Math.ceil(16/dpw);
  const onPace=weeksNeeded<=Math.floor(weeksUntil);
  const suggestedDpw=weeksUntil>0?Math.min(7,Math.ceil(sessionsRemaining/weeksUntil)):7;
  return {weeksUntil,sessionsRemaining,weeksNeeded,weeksPerPhase,onPace,suggestedDpw};
}
// First-run gate: the profile + goal inputs the app personalizes around.
export function onboardingIncomplete(){ return !state.name || !state.gender || !state.murphDate || !(state.daysPerWeek>0) || !(state.bodyweight>0); }
// Recommended working weight per exercise: the user's saved value, else the plan default.
export function exWeight(e){ return (state.weights && state.weights[e.name]!=null) ? state.weights[e.name] : e.w.def; }
export function normalizeState(){
  if(!state.weights) state.weights={};
  if(!state.fcmTokens) state.fcmTokens=[];
  if(!state.reminderPrefs) state.reminderPrefs={enabled:false,days:[0,1,2,3,4,5,6],time:"07:00",tz:(Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York")};
  if(typeof state.recoveryDue!=="boolean") state.recoveryDue=false;
  if(state.recoveryReason===undefined) state.recoveryReason=null;
  if(!state.deload) state.deload={active:false,left:0,cooldown:0};
  if(!state.milestones) state.milestones={};
  if(!state.benchmarks) state.benchmarks=[];
  // Goal inputs (set on the Inputs page): target date + weekly training cadence.
  if(state.murphDate===undefined) state.murphDate=null;
  if(state.daysPerWeek===undefined) state.daysPerWeek=null;
  // Profile inputs: preferred name + gender (gender sets the weighted-vest load).
  if(state.name===undefined) state.name=null;
  if(state.gender===undefined) state.gender=null;
}
/* ---- Deload cycle: 3 hard sessions (>=8) in a row -> a 4-session lighter block ---- */
export function deloadActive(){ return !!(state.deload && state.deload.active); }
// Suggested weight for display: base weight, pulled to ~85% during a deload block.
export function dlWeight(e){
  const base=exWeight(e);
  if(deloadActive()) return Math.max(e.w.step, Math.round(base*0.85/e.w.step)*e.w.step);
  return base;
}
export function updateDeloadAfterSession(){
  const dl=state.deload||(state.deload={active:false,left:0,cooldown:0});
  if(dl.active){
    dl.left--;
    if(dl.left<=0){ dl.active=false; dl.left=0; dl.cooldown=6; }   // end deload, brief cooldown before another can trigger
  }else{
    if(dl.cooldown>0) dl.cooldown--;
    const last3=state.completed.slice(-3);
    if(dl.cooldown<=0 && last3.length>=3 && last3.every(s=>s.difficulty>=8)){
      dl.active=true; dl.left=4;   // one A->B->C->D cycle
    }
  }
}
// Session #1 (Jul 13, 2026), logged in chat before the tracker existed — his baseline.
export function seedState(){
  return {
    completed:[{
      session:1, day:"A", date:"2026-07-13T12:00:00.000Z", difficulty:7,
      notes:"8 reps each; lat pulldown 100 lb; came in sore from prior-day cardio (mile run, incline walking, 500m row @ 2:10)."
    }],
    supps:{ "2026-07-13":{ creatine:5, protein:48 } }
  };
}
/* ---------------- Persistence ---------------- */
export async function save(){
  const key = DEV ? DEV_KEY : CACHE_KEY+":"+(user?user.uid:"anon");
  try{ localStorage.setItem(key, JSON.stringify(state)); }catch(e){}
  if(!DEV && userRef && user){
    try{
      await setDoc(userRef, {
        email:user.email, name:state.name||null, gender:state.gender||null,
        plan:state.plan||"murph-phase1", bodyweight:state.bodyweight||null, weights:state.weights||{},
        murphDate:state.murphDate||null, daysPerWeek:state.daysPerWeek||null,
        fcmTokens:state.fcmTokens||[], reminderPrefs:state.reminderPrefs||null,
        coachNote:state.coachNote||null, recoveryDue:!!state.recoveryDue, recoveryReason:state.recoveryReason||null,
        deload:state.deload||{active:false,left:0,cooldown:0}, milestones:state.milestones||{}, benchmarks:state.benchmarks||[],
        completed:state.completed, supps:state.supps, updatedAt:Date.now()
      }, {merge:true});
    }catch(e){ console.warn("cloud save failed (will retry when online):", e); }
  }
}
export function cleanupDay(k){const s=state.supps[k];if(s&&!s.creatine&&s.protein==null)delete state.supps[k];}

// `state`/`user`/`userRef`/`ready` are owned by this module. ES modules give importers a live
// READ binding but only the owner may reassign, so auth (sign-in / dev boot) and Reset — which
// replace state wholesale — go through these setters instead of assigning across the boundary.
export function setState(s){ state=s; }
export function setUser(u){ user=u; }
export function setUserRef(r){ userRef=r; }
export function setReady(v){ ready=v; }

// Late-bound full repaint. app.js owns render() and registers it here, so feature modules can
// trigger a repaint without importing app.js — which imports them, and would cycle.
let _renderAll=()=>{};
export function setRenderAll(fn){ _renderAll=fn; }
export function renderAll(){ _renderAll(); }
