import { setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { CACHE_KEY, DEV, DEV_KEY, PROGRAM_SESSIONS } from "./config.js";
import { iso, nameFor, parseYMD } from "./util.js";

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
// Are they ACTUALLY training as often as they said they would? paceInfo() above answers "is the
// plan achievable"; this answers "is the plan happening", projecting a finish date from real
// logged sessions rather than the promised cadence.
//   status: "none"  nothing logged yet
//           "early" too little history to project honestly (a 2-session first week would imply
//                   an absurd rate — better to say nothing than to mislead)
//           "done"  program complete
//           "on"/"behind"
const PACE_MIN_DAYS=14;
export function actualPace(){
  const md=murphDate(), dpw=state.daysPerWeek, done=(state.completed||[]).length;
  if(!md || !(dpw>0)) return null;
  if(!done) return {status:"none", dpw};
  // Sessions LEFT come from the plan position (credits for easy sessions genuinely remove work),
  // but the RATE comes from sessions he actually did. Mixing these up would let credits inflate
  // his apparent training rate — which would be a lie.
  const remaining=Math.max(0, PROGRAM_SESSIONS-planPos());
  if(!remaining) return {status:"done"};
  const today=new Date(); today.setHours(0,0,0,0);
  const first=new Date(state.completed.map(c=>c.date).sort()[0]); first.setHours(0,0,0,0);
  const days=Math.round((today-first)/86400000)+1;          // inclusive of the first day
  if(days<PACE_MIN_DAYS) return {status:"early", done, dpw, daysIn:days, daysLeft:PACE_MIN_DAYS-days};
  const rate=done/(days/7);                                  // real sessions per week
  const finish=new Date(today.getTime()+Math.ceil(remaining/rate)*7*86400000);
  const weeksLate=Math.round((finish-md)/(7*86400000));
  const aheadWeeks=Math.floor((md-finish)/(7*86400000));
  const credit=(state.accel&&state.accel.credit)||0;
  return {status: finish<=md ? "on" : "behind", rate, finish, weeksLate, dpw, remaining, credit,
          aheadWeeks,
          // Only offer to pull the date in when the gap is big enough to be real rather than noise.
          suggestDate: (finish<=md && aheadWeeks>=3) ? iso(finish) : null,
          needRate: Math.min(7, Math.ceil(remaining/Math.max(0.1,(md-today)/(7*86400000)))) };
}
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
  if(!state.accel) state.accel={credit:0,cooldown:0,log:[]};
  if(!Array.isArray(state.accel.log)) state.accel.log=[];
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
/* ---------------- Adaptive progression ----------------
   Deload's mirror image. Three hard sessions in a row earn a lighter block; three EASY ones in a
   row earn a jump forward — the plan advances by an extra session, so he moves through the phases
   faster than the calendar says and his finish date pulls in.

   `planPos()` is where he is IN THE PLAN (sessions done + credits). It is deliberately NOT the same
   as completed.length, which stays the count of workouts he actually did: the pace projection needs
   the real rate from real sessions, but the sessions REMAINING come from the plan position. Use
   planPos() for "which day/phase/session is next", completed.length for "how much has he trained".  */
const EASY_MAX=4;         // 1-10 self-rating; <=4 is "this was easy"
const ACCEL_WINDOW=3;     // consecutive easy sessions needed (same window as deload's hard streak)
const ACCEL_COOLDOWN=3;   // sessions before another jump can be earned — no runaway skipping
const ACCEL_CAP_FRAC=0.25;// never let credits skip more than a quarter of the program

export function planPos(){ return (state.completed||[]).length + ((state.accel&&state.accel.credit)||0); }

// Call AFTER pushing the session. Returns the new credit total if a jump was earned, else null.
export function updateAccelAfterSession(hadPain){
  const a=state.accel||(state.accel={credit:0,cooldown:0,log:[]});
  if(a.cooldown>0){ a.cooldown--; return null; }
  if(deloadActive()) return null;                 // never skip ahead while backing off
  if(hadPain) return null;                        // pain outranks "easy" every time
  const last=(state.completed||[]).slice(-ACCEL_WINDOW);
  if(last.length<ACCEL_WINDOW) return null;
  if(!last.every(s=>s.difficulty<=EASY_MAX)) return null;
  if(planPos()>=PROGRAM_SESSIONS) return null;    // nothing left to skip into
  if(a.credit>=Math.floor(PROGRAM_SESSIONS*ACCEL_CAP_FRAC)) return null;
  a.credit++; a.cooldown=ACCEL_COOLDOWN;
  a.log.push({at:(state.completed||[]).length, date:new Date().toISOString()});
  return a.credit;
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
