import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
         onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, getFirestore, persistentLocalCache, doc, getDoc, setDoc
       } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getMessaging, getToken, isSupported as messagingSupported
       } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

// ---- Firebase config (public identifiers, safe to ship) ----
const firebaseConfig = {
  apiKey: "AIzaSyDBnuhes0kYuy2zfe8oojK9WSxg_PORqEY",
  authDomain: "murph-tracker-c94db.firebaseapp.com",
  projectId: "murph-tracker-c94db",
  storageBucket: "murph-tracker-c94db.firebasestorage.app",
  messagingSenderId: "287760042875",
  appId: "1:287760042875:web:db445367dda2c1a5a10bde"
};

// ---- Who's allowed in, and their display names ----
// Open sign-up: anyone with a Google account gets their own tracker. Privacy is enforced by the
// Firestore rules (each uid can only touch users/{their-own-uid}) — not by anything in this file.
const HUSBAND_EMAIL = "luke.f.byrnes@gmail.com";
const CAROLINE_EMAIL = "carolinebyrnes25@gmail.com";
const NAMES = { [CAROLINE_EMAIL]:"Caroline", [HUSBAND_EMAIL]:"Luke" };

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
let db;
try{ db = initializeFirestore(fbApp, { localCache: persistentLocalCache({}) }); }
catch(e){ db = getFirestore(fbApp); }

// ---- Plan data ----
// `totals` = what the day prescribes toward Murph, and it drives the milestone auto-checks.
// Only the real movement counts: band-assisted pull-ups, incline/knee push-ups and lat pulldowns
// build toward Murph but aren't Murph reps, so they score 0. Weighted squats aren't air squats.
// `mile` = continuous 1-mile runs prescribed (jog/walk intervals aren't a mile).
// Phase 1 tops out at 50 air squats and no unassisted pull-ups or push-ups — by design, nothing
// here trips a milestone. Give later phases the same `totals` and their milestones check themselves.
const PHASE1 = {
  A:{nm:"Pull + Run base",tag:"Pulling pattern · easy running",totals:{pullups:0,pushups:0,squats:0,mile:0},ex:[
    {name:"Dead hang",dose:"3 × 15–20s",what:"Hang from a pull-up bar, arms straight, feet off the floor."},
    {name:"Inverted row (barbell/TRX)",dose:"3 × 8–10",what:"Lie under a bar and pull your chest up to it, body straight.",note:"More upright = easier · more horizontal = harder"},
    {name:"Lat pulldown or assisted pull-up",dose:"3 × 8–10",what:"Machine version of a pull-up — same muscles, at a weight you pick.",w:{def:100,step:10}},
    {name:"Incline push-ups",dose:"3 × 8–12",what:"Push-ups with your hands up on a bench or bar — easier than the floor."},
    {name:"Run / walk",dose:"15 min",what:"Easy jogging broken up with walking to build your running base.",note:"Jog 1 min / walk 2 min"}]},
  B:{nm:"Squat + Intervals",tag:"Legs · interval running",totals:{pullups:0,pushups:0,squats:45,mile:0},ex:[
    {name:"Goblet squat",dose:"3 × 10",what:"Squat while holding one dumbbell against your chest.",w:{def:25,step:5}},
    {name:"Bodyweight squats",dose:"3 × 15",what:"Plain air squats, no weight — the exact squat Murph asks for.",note:"Hip crease below the knee"},
    {name:"Walking lunges",dose:"2 × 10 / leg",what:"Step forward into a lunge, alternating legs as you walk."},
    {name:"DB Romanian deadlift",dose:"2 × 10",what:"Hinge at the hips, sliding dumbbells down your legs — hamstrings and back.",w:{def:30,step:5}},
    {name:"Run / walk intervals",dose:"12–15 min",what:"Short jog/walk repeats to build running fitness.",note:"Jog 1 min / walk 1–2 min"},
    {name:"Plank",dose:"3 × 20–30s",what:"Hold a straight body on forearms and toes — core work."}]},
  C:{nm:"Push + Pull",tag:"Pressing · more pulling volume",totals:{pullups:0,pushups:0,squats:0,mile:0},ex:[
    {name:"DB bench press (or incline push-ups)",dose:"3 × 8–10",what:"Lying on a bench, press dumbbells up off your chest.",w:{def:30,step:5}},
    {name:"Band-assisted pull-ups",dose:"3 × 5–8",what:"Pull-ups with a band under your feet carrying some of your weight.",note:"A band that lets you do clean reps"},
    {name:"Inverted row (barbell/TRX)",dose:"3 × 10",what:"Lie under a bar and pull your chest up to it, body straight."},
    {name:"Incline / knee push-ups",dose:"3 × clean",what:"Push-ups made easier — hands raised, or knees on the floor.",note:"Leave 2 in the tank"},
    {name:"Overhead DB press",dose:"2 × 10",what:"Press dumbbells from your shoulders straight overhead.",w:{def:20,step:5}}]},
  D:{nm:"Mixed conditioning",tag:"A first taste of Murph",totals:{pullups:0,pushups:0,squats:50,mile:0},ex:[
    {name:"Easy jog",dose:"5 min",what:"Gentle warm-up jog to loosen up."},
    {name:"Circuit — unhurried",dose:"5 rounds",what:"Murph's three moves in miniature — repeat the round, no rush.",note:"2 assisted pull-ups · 5 incline push-ups · 10 squats"},
    {name:"Continuous jog",dose:"0.5 → 0.75 mi",what:"Keep jogging without stopping for as long as you can.",note:"Walk when needed; nudge the distance up"}]}
};
const ORDER=["A","B","C","D"];
const PHASE1_SESSIONS=16;
const CREATINE_G=5;
const SHAKE_G=48;   // one protein shake = 48 g
const CACHE_KEY="murph:cache";      // local mirror, keyed per-uid below
const LEGACY_KEY="murph:state";     // pre-cloud single-user data to migrate
// DEV/test mode: ANY host that isn't the real production URL runs offline of Firebase —
// no sign-in, isolated local storage, never writes to Firestore. Covers localhost, file://,
// and every preview host. ?prod=1 forces the real login (to test it); ?dev=1 forces test mode.
const PROD_HOST="carolinebyrnes25.github.io";
const _q=new URLSearchParams(location.search);
const DEV = _q.get("prod")==="1" ? false
          : _q.get("dev")==="1" ? true
          : location.hostname!==PROD_HOST;
const DEV_KEY="murph:dev";
// FCM Web Push public (VAPID) key — safe to ship. Used to register a device for reminders.
const VAPID_KEY="BOYYZpjg9iA3zHQ08dAXpV1wzz9aGH_ytLLcSYr0mX3v_UrXmdyR21WKk9EFwo_msCKtJjVPM4H-mMoTVkGrpVY";

let state={completed:[],supps:{}};
let picked=null;
let user=null;
let userRef=null;
let ready=false;
let weightFb={};   // transient per-session weight feedback: exerciseName -> "down"|"good"|"up"

const $=id=>document.getElementById(id);
function diffColor(n){
  if(n<=3)return"#6E8B3E"; if(n<=5)return"#8a9a3a";
  if(n<=7)return"#C97A2C"; return"#BF4A2B";
}
function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function todayKey(){return iso(new Date());}
function fmtDate(isoStr){
  let d;
  if(/^\d{4}-\d{2}-\d{2}$/.test(isoStr)){const p=isoStr.split("-");d=new Date(+p[0],+p[1]-1,+p[2]);}
  else{d=new Date(isoStr);}
  return d.toLocaleDateString(undefined,{month:"short",day:"numeric"});
}
function shortMD(key){const p=key.split("-");return parseInt(p[1])+"/"+parseInt(p[2]);}
function nameFor(email){ return NAMES[email] || (email? email.split("@")[0] : "Athlete"); }
// Protein target derived from bodyweight (lb): plan calls for 0.7–1.0 g/lb.
// "Everyday" target ≈ 0.8 g/lb; range spans 0.7–1.0.
function proteinGoal(){ return state.bodyweight>0 ? Math.round(state.bodyweight*0.8) : null; }
function proteinRange(){ return state.bodyweight>0 ? [Math.round(state.bodyweight*0.7), Math.round(state.bodyweight)] : null; }
// The full road to Murph-ready: 4 phases × 16 sessions. Only Phase 1 is built today;
// this is the pacing horizon and can be tuned as later phases are authored.
const PROGRAM_SESSIONS=64;
// Parse a "YYYY-MM-DD" input value into a local Date (matches fmtDate's parsing).
function parseYMD(s){ if(!/^\d{4}-\d{2}-\d{2}$/.test(s||""))return null; const p=s.split("-"); return new Date(+p[0],+p[1]-1,+p[2]); }
function murphDate(){ return state.murphDate ? parseYMD(state.murphDate) : null; }
// Is a target date reachable at a chosen weekly cadence? Null until both are given.
// Params are explicit so the Inputs page can preview unsaved values too.
function paceInfo(md, dpw, completedLen){
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
// First-run gate: the three goal inputs the app personalizes around.
function onboardingIncomplete(){ return !state.murphDate || !(state.daysPerWeek>0) || !(state.bodyweight>0); }
// Recommended working weight per exercise: the user's saved value, else the plan default.
function exWeight(e){ return (state.weights && state.weights[e.name]!=null) ? state.weights[e.name] : e.w.def; }
function weightedForDay(day){ return PHASE1[day].ex.filter(e=>e.w); }
function normalizeState(){
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
}

/* ---- Coach's note: a trainer-style summary generated from the logged feedback ---- */
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
function shortName(n){ return n.replace(/\s*\(.*?\)\s*$/,"").replace(/\s+or\s+.*$/,"").trim(); }
function joinNames(arr){
  const ns=arr.map(x=>shortName(x.name));
  if(ns.length<=1) return ns[0]||"";
  if(ns.length===2) return ns[0]+" and "+ns[1];
  return ns.slice(0,-1).join(", ")+", and "+ns[ns.length-1];
}
function buildCoachHTML(c){
  const dayName = PHASE1[c.day] ? PHASE1[c.day].nm : ("Day "+c.day);
  const opener = pick([
    "Nice work — that's another one in the books. 💪",
    "Great job showing up and getting it done. 🙌",
    "Logged and done — that consistency is the whole game.",
    "Strong work today. This is how it gets built, one session at a time. 🔥"
  ]);
  const d=c.difficulty; let read;
  if(d<=3) read="You rated it <b>"+d+"/10</b> — comfortable, with plenty left in the tank.";
  else if(d<=6) read="You rated it <b>"+d+"/10</b> — a solid, controlled effort, right in the zone where progress happens.";
  else if(d<=8) read="You rated it <b>"+d+"/10</b> — a genuine grind. You worked for this one.";
  else read="You rated it <b>"+d+"/10</b> — brutal. You left it all out there.";

  const ups=(c.changes||[]).filter(x=>x.dir==="up");
  const downs=(c.changes||[]).filter(x=>x.dir==="down");
  const adj=[];
  if(ups.length) adj.push("You said "+joinNames(ups)+" felt too light, so I've bumped "+(ups.length>1?"them":"it")+" up for next time — "+ups.map(x=>shortName(x.name)+" to <b>"+x.to+" lb</b>").join(", ")+". We progress by adding a little, often.");
  if(downs.length) adj.push("Since "+joinNames(downs)+" felt too heavy, I've eased "+(downs.length>1?"them":"it")+" back — "+downs.map(x=>shortName(x.name)+" to <b>"+x.to+" lb</b>").join(", ")+". Clean reps beat heavy grinds this phase.");
  if(!ups.length && !downs.length){
    if(d<=3) adj.push("That was on the easy side, so next time we'll add a little — a rep or two per set, or a small bump in load. No big leaps.");
    else if(d<=6) adj.push("This is exactly the effort we want. We'll hold the numbers steady and let your body consolidate before the next small step up.");
    else if(d<=8) adj.push("We'll keep next session right about here — no need to add load while you're still adapting to this volume.");
    else adj.push("No added load next time — when a session is this hard, holding steady <i>is</i> the progression. Let the adaptation catch up.");
  }
  let rec="";
  if(c.pain){
    rec='<div class="coach-flag">⚠ You flagged something that hurt. Muscle burn is fine — but if it\'s sharp or joint pain, back off that movement and give it a day or two. Never push through joint pain.</div>';
  } else if(d>=9){
    rec='<div class="coach-rec"><b>Recovery call:</b> that was near-maximal — take an easy day before your next session. A good recovery day is a short walk or light stretch, plenty of water, a solid protein hit, and 7–9 hours of sleep. That\'s when the strength actually gets built.</div>';
  } else if(d>=7){
    rec='<div class="coach-rec"><b>Tonight:</b> prioritize food, water, and sleep. You don\'t need a full rest day, but don\'t stack another hard session right on top of this one.</div>';
  }
  const closer = pick([
    "Onto the next one — you've got this. 🫡",
    "Same energy next round. Proud of the work.",
    "Rest up, refuel, and I'll see you at the next session.",
    "Keep stacking these. The finish line gets closer every time. 🏁"
  ]);
  return '<button class="coach-x" aria-label="Dismiss">×</button>'+
    '<div class="coach-kicker">Coach\'s note · '+dayName+'</div>'+
    '<p class="coach-open">'+opener+'</p>'+
    '<p>'+read+'</p>'+
    adj.map(a=>'<p>'+a+'</p>').join("")+
    rec+
    '<p class="coach-close">'+closer+'</p>';
}
function renderCoachNote(){
  const el=$("coach-note"); if(!el) return;
  const c=state.coachNote;
  if(!c || c.session!==state.completed.length){ el.hidden=true; el.innerHTML=""; return; }
  el.hidden=false; el.innerHTML=c.html;
  const x=el.querySelector(".coach-x");
  if(x) x.onclick=async()=>{ state.coachNote=null; el.hidden=true; el.innerHTML=""; await save(); };
}

/* ---- Deload cycle: 3 hard sessions (>=8) in a row -> a 4-session lighter block ---- */
function deloadActive(){ return !!(state.deload && state.deload.active); }
// Suggested weight for display: base weight, pulled to ~85% during a deload block.
function dlWeight(e){
  const base=exWeight(e);
  if(deloadActive()) return Math.max(e.w.step, Math.round(base*0.85/e.w.step)*e.w.step);
  return base;
}
function updateDeloadAfterSession(){
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

/* ---- Recovery-day recommendation (real state, not just advice) ---- */
function renderRecovery(){
  const el=$("recovery-card"); if(!el) return;
  if(!state.recoveryDue){ el.hidden=true; return; }
  el.hidden=false;
  const day=ORDER[state.completed.length%4];
  const reason = state.recoveryReason==="pain"
    ? "You flagged something that hurt last session."
    : "Your last session was near-maximal.";
  $("rec-msg").innerHTML = reason+" A <b>recovery day</b> before Day "+day+" ("+PHASE1[day].nm+") is the smart call — a short walk or easy stretch, water, protein, and a good night's sleep. That's when the gains actually happen.";
}
$("rec-rest").onclick=async()=>{
  state.recoveryDue=false; state.recoveryReason=null;
  if(!state.restDays) state.restDays=0; state.restDays++;
  render(); await save();
  window.scrollTo({top:0,behavior:"smooth"});
};
$("rec-proceed").onclick=async()=>{
  state.recoveryDue=false; state.recoveryReason=null;
  render(); await save();
  const nx=document.querySelector('#view-workout .next'); if(nx) nx.scrollIntoView({behavior:"smooth",block:"start"});
};

// Session #1 (Jul 13, 2026), logged in chat before the tracker existed — his baseline.
function seedState(){
  return {
    completed:[{
      session:1, day:"A", date:"2026-07-13T12:00:00.000Z", difficulty:7,
      notes:"8 reps each; lat pulldown 100 lb; came in sore from prior-day cardio (mile run, incline walking, 500m row @ 2:10)."
    }],
    supps:{ "2026-07-13":{ creatine:5, protein:48 } }
  };
}

/* ---------------- Auth ---------------- */
const overlay=$("auth-overlay");
function showOverlay(msg,isErr){
  overlay.hidden=false; $("topbar").style.visibility="hidden";
  if(msg){ $("auth-note").textContent=msg; $("auth-note").className="auth-note "+(isErr?"err":"ok"); }
}
function hideOverlay(){ overlay.hidden=true; $("topbar").style.visibility="visible"; }

const provider=new GoogleAuthProvider();
provider.setCustomParameters({ prompt:"select_account" });

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

async function handleRedirectResult(){
  // Surfaces errors from the redirect flow; success is handled by onAuthStateChanged.
  try{ await getRedirectResult(auth); }
  catch(e){ if(e && e.code) showOverlay("Sign-in failed: "+e.code, true); }
}

function initAuth(){
 onAuthStateChanged(auth, async (u)=>{
  if(u){
    const email=(u.email||"").toLowerCase();
    user=u; hideOverlay();
    $("who").textContent=nameFor(email);
    await initUserData(email);
  } else {
    user=null; userRef=null;
    showOverlay();
  }
 });
}

// Local test mode: no sign-in, no cloud. State persists to a separate localStorage key only.
function devInit(){
  user={email:"dev@local",uid:"dev"}; userRef=null;   // userRef null => save() never hits Firestore
  let saved=null;
  try{ const raw=localStorage.getItem(DEV_KEY); if(raw) saved=JSON.parse(raw); }catch(e){}
  state = saved || {completed:[],supps:{},plan:"murph-phase1",bodyweight:null,weights:{},murphDate:null,daysPerWeek:null};
  normalizeState();
  hideOverlay();
  $("who").textContent="🔧 Local test (no cloud)";
  ready=true; render();
  if(onboardingIncomplete()) showView("inputs");   // first run: go set your goal inputs
}

async function initUserData(email){
  userRef=doc(db,"users",user.uid);
  let snap=null;
  try{ snap=await getDoc(userRef); }catch(e){}
  if(snap && snap.exists() && Array.isArray(snap.data().completed)){
    const d=snap.data();
    state={completed:d.completed||[], supps:d.supps||{}, plan:d.plan||"murph-phase1", bodyweight:d.bodyweight||null, weights:d.weights||{}, murphDate:d.murphDate||null, daysPerWeek:d.daysPerWeek||null, fcmTokens:d.fcmTokens||[], reminderPrefs:d.reminderPrefs||null, coachNote:d.coachNote||null, recoveryDue:!!d.recoveryDue, recoveryReason:d.recoveryReason||null, deload:d.deload||{active:false,left:0,cooldown:0}, milestones:d.milestones||{}, benchmarks:d.benchmarks||[]};
  }else{
    // New profile. Only the husband inherits the pre-cloud Session #1 backfill /
    // any log already stored on his device; everyone else starts clean.
    if(email===HUSBAND_EMAIL){
      let legacy=null;
      try{ const raw=localStorage.getItem(LEGACY_KEY); if(raw) legacy=JSON.parse(raw); }catch(e){}
      state=(legacy && Array.isArray(legacy.completed) && legacy.completed.length)
        ? {completed:legacy.completed, supps:legacy.supps||{}, plan:"murph-phase1", weights:legacy.weights||{}}
        : {...seedState(), plan:"murph-phase1", weights:{}};
    }else{
      state={completed:[], supps:{}, plan:"murph-phase1", weights:{}};
    }
    await save();
  }
  normalizeState();
  ready=true;
  render();
  if(onboardingIncomplete()) showView("inputs");   // first run: go set your goal inputs
}

/* ---------------- Persistence ---------------- */
async function save(){
  const key = DEV ? DEV_KEY : CACHE_KEY+":"+(user?user.uid:"anon");
  try{ localStorage.setItem(key, JSON.stringify(state)); }catch(e){}
  if(!DEV && userRef && user){
    try{
      await setDoc(userRef, {
        email:user.email, name:nameFor((user.email||"").toLowerCase()),
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

/* ---------------- Rendering ---------------- */
function buildDiff(){
  const wrap=$("diff"); wrap.innerHTML="";
  for(let i=1;i<=10;i++){
    const b=document.createElement("button");
    b.textContent=i; b.dataset.v=i;
    b.onclick=()=>{
      picked=i;
      [...wrap.children].forEach(c=>{c.classList.remove("sel");c.style.background="";c.style.borderColor="";});
      b.classList.add("sel"); b.style.background=diffColor(i);
      $("complete").disabled=false; $("miss").textContent="";
    };
    wrap.appendChild(b);
  }
}

function renderBanner(){
  const slot=$("banner-slot"); slot.innerHTML="";
  if(deloadActive()){
    slot.innerHTML+='<div class="banner"><span class="ic">🔄</span><span><b>Deload week · session '+(5-state.deload.left)+' of 4.</b> Planned recovery after a hard stretch — go ~15% lighter, drop a set, keep it easy. You\'ll come back stronger.</span></div>';
  }
  if(state.completed.length>=PHASE1_SESSIONS){
    slot.innerHTML+='<div class="banner done"><span class="ic">🏁</span><span><b>Phase 1 complete — nice work.</b> You can keep logging here in the meantime.</span></div>';
  }
}

function renderNext(){
  const done=state.completed.length;
  const day=ORDER[done%4];
  const w=PHASE1[day];
  const dl=deloadActive();
  let rows=w.ex.map(e=>{
    const dose=e.w ? (e.dose+' · '+dlWeight(e)+' lb'+(dl?' <span class="deload-tag">deload</span>':'')) : e.dose;
    return '<div class="ex"><div class="row"><span class="name">'+e.name+'</span><span class="dose">'+dose+'</span></div>'+(e.what?'<div class="what">'+e.what+'</div>':'')+(e.note?'<div class="note">'+e.note+'</div>':'')+'</div>';
  }).join("");
  $("next-card").className="next fade-in";
  $("next-card").innerHTML='<div class="next-head"><div class="letter">'+day+'</div><div class="t"><div class="nm">'+w.nm+'</div><div class="tag">'+w.tag+'</div></div></div><div class="ex-list">'+rows+'</div>';
}

// Weight-feedback controls in the "Log this session" area for the current day's weighted lifts.
function renderWeights(){
  const day=ORDER[state.completed.length%4];
  const list=weightedForDay(day);
  const block=$("wt-block");
  if(!list.length){ block.innerHTML=""; return; }
  if(deloadActive()){
    block.innerHTML='<div class="wt-title">Deload week</div><div class="wt-note">Weights are pulled back and feedback is paused this week — just move well and keep it easy.</div>';
    return;
  }
  let html='<div class="wt-title">Weights — how did they feel?</div>';
  list.forEach((e,i)=>{
    const cur=exWeight(e);
    const dir=weightFb[e.name]||"good";
    const next = dir==="down" ? Math.max(e.w.step, cur-e.w.step) : dir==="up" ? cur+e.w.step : cur;
    const note = dir==="good" ? "Next time: "+cur+" lb (unchanged)"
               : "Next time: "+next+" lb ("+(dir==="down"?"lighter":"heavier")+")";
    html+='<div class="wt-row"><div class="wt-head"><span class="wt-name">'+e.name+'</span><span class="wt-cur">'+cur+' lb today</span></div>'+
      '<div class="wt-fb" data-idx="'+i+'">'+
        '<button data-dir="down" class="'+(dir==="down"?"sel down":"")+'">Too heavy</button>'+
        '<button data-dir="good" class="'+(dir==="good"?"sel good":"")+'">Just right</button>'+
        '<button data-dir="up" class="'+(dir==="up"?"sel up":"")+'">Too light</button>'+
      '</div><div class="wt-note">'+note+'</div></div>';
  });
  block.innerHTML=html;
  block.querySelectorAll(".wt-fb").forEach(fb=>{
    const ex=list[+fb.getAttribute("data-idx")].name;
    fb.querySelectorAll("button").forEach(b=>{
      b.onclick=()=>{ weightFb[ex]=b.getAttribute("data-dir"); renderWeights(); };
    });
  });
}

function renderProgress(){
  const done=state.completed.length;
  const session=Math.min(done+1,PHASE1_SESSIONS);
  const week=Math.min(Math.floor(done/4)+1,4);
  const day=ORDER[done%4];
  $("title").textContent=done>=PHASE1_SESSIONS?"Phase 1 done":"Next up · Day "+day;
  $("prog-left").innerHTML="Session <b>"+session+"</b> of "+PHASE1_SESSIONS+" · Week <b>"+week+"</b>";
  $("prog-right").textContent=Math.round(Math.min(done,PHASE1_SESSIONS)/PHASE1_SESSIONS*100)+"%";
  setTimeout(()=>{$("bar").style.width=Math.min(done,PHASE1_SESSIONS)/PHASE1_SESSIONS*100+"%";},50);
}

// Expanded view of one logged session: the workout as prescribed that day (with the weight
// actually used per lift) plus the feedback entered. Weights are the only per-session record of
// what he lifted; the rest of the prescription comes from the plan for that day.
function histDetail(c){
  const w=PHASE1[c.day];
  if(!w) return '<div class="hist-detail"><div class="hd-none">This day\'s workout is no longer in the plan.</div></div>';
  const used=c.weights||{};
  const rows=w.ex.map(e=>{
    const lb = used[e.name]!=null ? ' · '+used[e.name]+' lb' : '';
    return '<div class="hd-ex"><span class="hd-n">'+e.name.replace(/</g,"&lt;")+'</span>'+
           '<span class="hd-d">'+e.dose.replace(/</g,"&lt;")+lb+'</span></div>';
  }).join("");
  return '<div class="hist-detail">'+
    '<div class="hd-h">The workout · Day '+c.day+' — '+w.nm+'</div>'+rows+
    '<div class="hd-h">Your feedback</div>'+
    '<div class="hd-fb">Difficulty <b>'+c.difficulty+' / 10</b></div>'+
    '<div class="hd-fb">'+(c.notes ? '“'+c.notes.replace(/</g,"&lt;")+'”' : '<span class="hd-none">No notes entered.</span>')+'</div>'+
  '</div>';
}
function renderHist(){
  const h=$("hist");
  if(!state.completed.length){h.innerHTML='<div class="empty">No sessions logged yet — your first one starts the streak.</div>';return;}
  h.innerHTML=[...state.completed].reverse().map(c=>{
    const wLine=c.weights?'<div class="l2 wtline">'+Object.entries(c.weights).map(([n,w])=>n.replace(/</g,"&lt;")+' '+w+'lb').join(' · ')+'</div>':'';
    return '<div class="entry" data-session="'+c.session+'">'+
      '<div class="entry-main" role="button" tabindex="0" aria-expanded="false">'+
        '<div class="badge">'+c.day+'</div>'+
        '<div class="info"><div class="l1">#'+c.session+' · '+PHASE1[c.day].nm+'</div>'+
        '<div class="l2">'+fmtDate(c.date)+(c.notes?' · '+c.notes.replace(/</g,"&lt;"):'')+'</div>'+wLine+'</div>'+
        '<div class="d" style="background:'+diffColor(c.difficulty)+'">'+c.difficulty+'/10</div>'+
        '<div class="chev">▾</div>'+
      '</div>'+ histDetail(c) +'</div>';
  }).join("");
  h.querySelectorAll(".entry-main").forEach(m=>{
    const open=()=>{ const e=m.closest(".entry"); const now=e.classList.toggle("open");
      m.setAttribute("aria-expanded", now?"true":"false"); };
    m.onclick=open;
    m.onkeydown=ev=>{ if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); open(); } };
  });
}

function renderSupps(){
  const tk=todayKey();
  const t=state.supps[tk]||{};
  $("supp-today").textContent="Today · "+fmtDate(tk);
  const btn=$("creatine-btn");
  if(t.creatine){btn.classList.add("on");btn.textContent="✓ Taken ("+t.creatine+"g)";}
  else{btn.classList.remove("on");btn.textContent="Tap when taken (5g)";}
  const pbtn=$("protein-btn"); const hadShake=t.protein!=null;
  if(hadShake){pbtn.classList.add("on");pbtn.textContent="✓ Shake had ("+SHAKE_G+"g)";}
  else{pbtn.classList.remove("on");pbtn.textContent="Tap when you've had a shake ("+SHAKE_G+"g)";}
  // protein caption: shake status + daily target derived from weight (set on the Inputs page)
  const goal=proteinGoal(); const cap=$("protein-caption");
  cap.className="supp-caption"+(hadShake?" hit":"");
  if(hadShake){
    cap.innerHTML="Shake logged today — <b>"+SHAKE_G+" g protein</b>"+(goal?" · daily target ~"+goal+" g":"");
  }else if(goal){
    cap.innerHTML="Tap above when you've had your shake ("+SHAKE_G+" g) · daily target ~<b>"+goal+" g</b>";
  }else{
    cap.innerHTML="Add your weight on the <b>Inputs</b> page to get a daily protein target.";
  }
  const strip=$("supp-strip");const cells=[];const now=new Date();
  for(let i=6;i>=0;i--){const d=new Date(now);d.setDate(now.getDate()-i);const k=iso(d);const s=state.supps[k]||{};
    const hit=s.creatine||s.protein!=null;
    const pShake=s.protein!=null;
    cells.push('<div class="supp-day"><div class="dot'+(hit?' hit':'')+'"><span class="c">'+(s.creatine?'C✓':'·')+'</span><span class="p"'+(pShake?' style="color:var(--olive-2);font-weight:600"':'')+'>'+(pShake?'🥤':'')+'</span></div><div class="lbl">'+shortMD(k)+'</div></div>');
  }
  strip.innerHTML=cells.join("");
}

function render(){
  if(!ready) return;
  renderRecovery();renderProgress();renderNext();renderWeights();renderHist();renderSupps();renderBanner();renderProgressDash();renderInputs();renderReminders();renderCoachNote();
}

/* ===================== Progress dashboard ===================== */
const WEIGHTED_LIFTS=["Lat pulldown or assisted pull-up","Goblet squat","DB Romanian deadlift","DB bench press (or incline push-ups)","Overhead DB press"];
let selectedLift=WEIGHTED_LIFTS[0];
// The road to Murph — capability checkpoints tied to the real requirements
// (1-mi run · 100 pull-ups · 200 push-ups · 300 squats · 1-mi run · 20-lb vest).
// Tiers climb by fraction of each Murph target: 1/3 → 1/2 → 2/3 → full, with Half-Murph
// sitting at the halfway tier. `need` is checked automatically against prescribed workout
// totals and benchmark tests; `big` ones are once-in-a-lifetime and stay tap-to-mark.
const MS_TIERS=[
  {label:"Foundation",items:[
    {id:"phase1",icon:"🧱",label:"Phase 1 complete",sub:"16 sessions",
     auto:s=>s.completed.length>=16, autoDate:s=>s.completed[15]&&s.completed[15].date},
    {id:"mile1",icon:"🏃",label:"Run 1 mile",sub:"without stopping",need:{mile:1}}
  ]},
  {label:"One third",items:[
    {id:"pull33",icon:"💪",label:"33 pull-ups",sub:"in a workout",need:{pullups:33}},
    {id:"push66",icon:"🙌",label:"66 push-ups",sub:"in a workout",need:{pushups:66}},
    {id:"squat100",icon:"🦵",label:"100 air squats",sub:"in a workout",need:{squats:100}}
  ]},
  {label:"Halfway",items:[
    {id:"pull50",icon:"💪",label:"50 pull-ups",sub:"in a workout",need:{pullups:50}},
    {id:"push100",icon:"🙌",label:"100 push-ups",sub:"in a workout",need:{pushups:100}},
    {id:"squat150",icon:"🦵",label:"150 air squats",sub:"in a workout",need:{squats:150}},
    {id:"half",icon:"🔥",label:"Half-Murph",sub:"tap when you do it",big:true}
  ]},
  {label:"Two thirds",items:[
    {id:"pull66",icon:"💪",label:"66 pull-ups",sub:"in a workout",need:{pullups:66}},
    {id:"push133",icon:"🙌",label:"133 push-ups",sub:"in a workout",need:{pushups:133}},
    {id:"squat200",icon:"🦵",label:"200 air squats",sub:"in a workout",need:{squats:200}}
  ]},
  {label:"Murph targets",items:[
    {id:"pull100",icon:"💪",label:"100 pull-ups",sub:"Murph target",need:{pullups:100},tgt:true},
    {id:"push200",icon:"🙌",label:"200 push-ups",sub:"Murph target",need:{pushups:200},tgt:true},
    {id:"squat300",icon:"🦵",label:"300 air squats",sub:"Murph target",need:{squats:300},tgt:true}
  ]},
  {label:"Putting it together",items:[
    {id:"mile2",icon:"🏃",label:"Two 1-mile runs",sub:"in one session",need:{mile:2}},
    {id:"combo_run_pull",icon:"🏃💪",label:"1-mi run + 100 pull-ups",sub:"in a workout",need:{mile:1,pullups:100}},
    {id:"combo_run_pull_push",icon:"💪🙌",label:"Run + 100 pull + 200 push",sub:"in a workout",need:{mile:1,pullups:100,pushups:200}},
    {id:"combo_reps",icon:"⚡",label:"All the reps",sub:"100 · 200 · 300, no runs",need:{pullups:100,pushups:200,squats:300}}
  ]},
  {label:"The finish",items:[
    {id:"murph",icon:"🏁",label:"Murph — unweighted",sub:"tap when you do it",big:true},
    {id:"murphvest",icon:"🎖️",label:"Murph — 20-lb vest",sub:"tap when you do it",big:true}
  ]}
];

// --- generic SVG chart builders (single-series, app palette) ---
function svgLine(el, pts, opts){
  opts=opts||{};
  if(pts.length<2){ el.innerHTML='<p class="chart-empty">'+(opts.empty||"Log a couple more sessions to see this trend.")+'</p>'; return; }
  const W=520,H=200,L=38,R=14,T=14,B=28;
  const ys=pts.map(p=>p.y);
  let lo=opts.yMin!=null?opts.yMin:Math.min(...ys), hi=opts.yMax!=null?opts.yMax:Math.max(...ys);
  if(lo===hi){lo-=1;hi+=1;} else if(opts.yMin==null&&opts.yMax==null){const pad=(hi-lo)*0.15;lo-=pad;hi+=pad;}
  const x=i=>L+(W-L-R)*(i/(pts.length-1));
  const y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo));
  const line="M"+pts.map((p,i)=>x(i).toFixed(1)+","+y(p.y).toFixed(1)).join(" L");
  const area="M"+x(0).toFixed(1)+","+(H-B)+" L"+pts.map((p,i)=>x(i).toFixed(1)+","+y(p.y).toFixed(1)).join(" L")+" L"+x(pts.length-1).toFixed(1)+","+(H-B)+" Z";
  const fmt=opts.fmt||(v=>Math.round(v));
  const dots=pts.map((p,i)=>'<circle cx="'+x(i).toFixed(1)+'" cy="'+y(p.y).toFixed(1)+'" r="3" fill="var(--olive)"><title>'+p.label+': '+fmt(p.y)+(opts.unit||'')+'</title></circle>').join("");
  let avg="";
  if(opts.avg!=null){ const ay=y(opts.avg); avg='<line x1="'+L+'" y1="'+ay.toFixed(1)+'" x2="'+(W-R)+'" y2="'+ay.toFixed(1)+'" class="avgline"/><text x="'+(W-R)+'" y="'+(ay-4).toFixed(1)+'" text-anchor="end" class="ax">avg '+fmt(opts.avg)+'</text>'; }
  el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" class="wchart" role="img">'+
    '<line x1="'+L+'" y1="'+(H-B)+'" x2="'+(W-R)+'" y2="'+(H-B)+'" class="grid"/>'+
    '<path d="'+area+'" class="warea"/><path d="'+line+'" class="wline"/>'+avg+dots+
    '<text x="'+(L-6)+'" y="'+(T+4)+'" text-anchor="end" class="ax">'+fmt(hi)+'</text>'+
    '<text x="'+(L-6)+'" y="'+(H-B)+'" text-anchor="end" class="ax">'+fmt(lo)+'</text>'+
    '<text x="'+L+'" y="'+(H-9)+'" text-anchor="start" class="ax">'+pts[0].label+'</text>'+
    '<text x="'+(W-R)+'" y="'+(H-9)+'" text-anchor="end" class="ax">'+pts[pts.length-1].label+'</text>'+
  '</svg>';
}
function svgBars(el, data, opts){
  opts=opts||{};
  if(!data.length){ el.innerHTML='<p class="chart-empty">No sessions logged yet.</p>'; return; }
  const W=520,H=180,L=20,R=12,T=16,B=26;
  const hi=Math.max(1, ...data.map(d=>d.value));
  const n=data.length, slot=(W-L-R)/n, bw=slot*0.6;
  const y=v=>T+(H-T-B)*(1-v/hi);
  const bars=data.map((d,i)=>{
    const cx=L+slot*i+slot/2, x=cx-bw/2, yy=y(d.value), h=(H-B)-yy;
    const val=d.value>0?'<text x="'+cx.toFixed(1)+'" y="'+(yy-5).toFixed(1)+'" text-anchor="middle" class="barval">'+d.value+'</text>':'';
    return '<rect x="'+x.toFixed(1)+'" y="'+yy.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(0,h).toFixed(1)+'" rx="4" class="bar"><title>Week of '+d.label+': '+d.value+' session'+(d.value===1?'':'s')+'</title></rect>'+val+
      '<text x="'+cx.toFixed(1)+'" y="'+(H-9)+'" text-anchor="middle" class="ax">'+d.label+'</text>';
  }).join("");
  el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" class="wchart" role="img"><line x1="'+L+'" y1="'+(H-B)+'" x2="'+(W-R)+'" y2="'+(H-B)+'" class="grid"/>'+bars+'</svg>';
}

// --- data helpers ---
function weekStart(d){ const x=new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate()-x.getDay()); return x; } // Sunday
function weeklyCounts(maxN){
  if(!state.completed.length) return [];
  const cur=weekStart(new Date());
  const first=weekStart(state.completed.map(c=>c.date).sort()[0]);
  let n=Math.round((cur-first)/(7*86400000))+1;         // weeks from first session to now
  n=Math.min(Math.max(n,1), maxN||8);                    // at least 1, at most maxN (show the recent window)
  const weeks=[];
  for(let i=n-1;i>=0;i--){ const w=new Date(cur); w.setDate(cur.getDate()-i*7); weeks.push({t:w.getTime(),label:(w.getMonth()+1)+"/"+w.getDate(),value:0}); }
  const idx={}; weeks.forEach((w,i)=>idx[w.t]=i);
  state.completed.forEach(c=>{ const t=weekStart(c.date).getTime(); if(idx[t]!=null) weeks[idx[t]].value++; });
  return weeks;
}

// --- renderers ---
function renderCountdownPhase(){
  if(!$("murph-countdown")) return;
  const done=state.completed.length, p1=Math.min(done,16), pct=Math.round(p1/16*100);
  const md=murphDate();
  if(md){
    const days=Math.max(0,Math.ceil((md-new Date())/86400000));
    $("murph-countdown").innerHTML='<div class="countdown"><div class="big">'+days+'</div><div class="sub">days to Murph · '+fmtDate(iso(md))+'</div></div>';
  }else{
    $("murph-countdown").innerHTML='<div class="countdown"><div class="big">—</div><div class="sub">set your target date on the Inputs page</div></div>';
  }
  let segs=""; for(let i=0;i<4;i++){ segs+= i===0 ? '<div class="phase-seg"><div class="fill" style="width:'+pct+'%"></div></div>' : '<div class="phase-seg"></div>'; }
  const cap = done>=16 ? "Phase 1 complete 🎉 — Phase 2 builds from your numbers" : "Phase 1 · Foundation — session "+Math.min(done+1,16)+" of 16";
  $("phase-bar").innerHTML='<div class="phase-seg-row">'+segs+'</div><div class="phase-labels"><span>Foundation</span><span>Build</span><span>Prep</span><span>Peak</span></div><div class="phase-caption">'+cap+'</div>';
}
// What a logged session prescribed toward Murph. Unknown days score zero rather than guessing.
function dayTotals(entry){
  const d=PHASE1[entry&&entry.day];
  return (d&&d.totals)||{pullups:0,pushups:0,squats:0,mile:0};
}
// A benchmark test is evidence too: a tested max of 100 pull-ups earns the 100 pull-up milestone.
// A recorded mile time means he ran a mile that day; a test can't show two.
function benchTotals(b){
  return {pullups:b.pullups||0, pushups:b.pushups||0, squats:b.squats||0, mile:b.mileSec!=null?1:0};
}
function meetsNeed(totals,need){ return Object.keys(need).every(k=>(totals[k]||0)>=need[k]); }
const MS_ALL = MS_TIERS.reduce((a,t)=>a.concat(t.items),[]);
function msById(id){ return MS_ALL.find(m=>m.id===id); }
// What the data says, ignoring any manual override: earliest date earned, or null.
function msDerived(m){
  if(m.auto) return m.auto(state) ? ((m.autoDate&&m.autoDate(state))||true) : null;
  if(!m.need) return null;                       // `big` finishers are manual by design
  let best=null;
  const take=k=>{ if(k&&(!best||k<best)) best=k; };
  (state.completed||[]).forEach(c=>{ if(meetsNeed(dayTotals(c),m.need)) take(iso(new Date(c.date))); });
  (state.benchmarks||[]).forEach(b=>{ if(meetsNeed(benchTotals(b),m.need)) take(b.date); });
  return best;
}
// What we actually show. state.milestones[id] is the manual override:
//   a date string = forced on, false = forced off, absent = follow the data.
function msEarned(m){
  const ov=(state.milestones||{})[m.id];
  if(ov===false) return null;
  if(typeof ov==="string") return ov;
  return msDerived(m);
}
// True when the override disagrees with the data — worth flagging in the UI so a hand-ticked
// milestone is never mistaken for one Luke actually earned.
function msOverridden(m){
  const ov=(state.milestones||{})[m.id];
  if(ov===undefined) return false;
  if(ov===false) return !!msDerived(m);
  return !m.big && !msDerived(m);
}
// Toggling only stores an override when it contradicts the data — so re-ticking something the
// data already supports drops the override and lets it track the data again.
function msToggle(id){
  const m=msById(id); if(!m) return;
  if(!state.milestones) state.milestones={};
  const derived=msDerived(m);
  if(msEarned(m)){
    if(derived) state.milestones[id]=false; else delete state.milestones[id];
  }else{
    if(derived) delete state.milestones[id]; else state.milestones[id]=todayKey();
  }
}
function renderMilestones(){
  const el=$("milestones"); if(!el) return;
  el.innerHTML=MS_TIERS.map(tier=>{
    const cards=tier.items.map(m=>{
      const date=msEarned(m), done=!!date, ov=msOverridden(m);
      const sub = ov ? (done?'marked by hand':'cleared by hand')
                     : (done&&typeof date==="string" ? fmtDate(date) : m.sub);
      return '<div class="ms-card'+(done?' done':'')+' tap'+(ov?' ov':'')+(m.tgt?' tgt':'')+(m.big?' big':'')+'"'+
        ' role="button" tabindex="0" aria-pressed="'+(done?'true':'false')+'" data-id="'+m.id+'">'+
        '<div class="ms-check">'+(done?'✓':'')+'</div>'+
        '<div class="ms-body"><div class="ms-label">'+m.icon+' '+m.label+'</div>'+
        '<div class="ms-sub2">'+sub+'</div></div></div>';
    }).join("");
    const n=tier.items.filter(m=>!!msEarned(m)).length;
    return '<div class="ms-tier"><div class="ms-tier-h"><span>'+tier.label+'</span>'+
      '<span class="ms-tier-n">'+n+'/'+tier.items.length+'</span></div>'+
      '<div class="ms-grid">'+cards+'</div></div>';
  }).join("");
  const toggle=async id=>{ msToggle(id); renderMilestones(); await save(); };
  el.querySelectorAll(".ms-card.tap").forEach(card=>{
    card.onclick=()=>toggle(card.dataset.id);
    card.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggle(card.dataset.id); } };
  });
}
function renderConsistency(){
  if(!$("consistency-stats")) return;
  const counts={}; state.completed.forEach(c=>{ const t=weekStart(c.date).getTime(); counts[t]=(counts[t]||0)+1; });
  const best=Math.max(0,...Object.values(counts)), thisWk=counts[weekStart(new Date()).getTime()]||0;
  $("consistency-stats").innerHTML='<div class="stat-row">'+
    '<div class="stat"><div class="n">'+state.completed.length+'</div><div class="l">Total sessions</div></div>'+
    '<div class="stat"><div class="n">'+thisWk+'</div><div class="l">This week</div></div>'+
    '<div class="stat"><div class="n">'+best+'</div><div class="l">Best week</div></div></div>';
  svgBars($("weekly-chart"), weeklyCounts(8));
}
function renderDifficultyChart(){
  const el=$("difficulty-chart"); if(!el) return;
  const pts=state.completed.map(c=>({label:'#'+c.session,y:c.difficulty}));
  const avg=pts.length?pts.reduce((s,p)=>s+p.y,0)/pts.length:null;
  svgLine(el, pts, {yMin:1,yMax:10,avg,fmt:v=>Math.round(v*10)/10,empty:"Log a couple more sessions to see your effort trend."});
}
function renderStrengthChart(){
  const ctr=$("strength-controls"); if(!ctr) return;
  ctr.innerHTML=WEIGHTED_LIFTS.map(n=>'<button data-l="'+n.replace(/"/g,'')+'" class="'+(n===selectedLift?'sel':'')+'">'+shortName(n)+'</button>').join("");
  ctr.querySelectorAll("button").forEach(b=>{ b.onclick=()=>{ selectedLift=b.getAttribute("data-l"); renderStrengthChart(); }; });
  const pts=state.completed.filter(c=>c.weights&&c.weights[selectedLift]!=null).map(c=>({label:fmtDate(c.date),y:c.weights[selectedLift]}));
  svgLine($("strength-chart"), pts, {unit:" lb",fmt:v=>Math.round(v),empty:"No "+shortName(selectedLift)+" logged yet."});
}
/* --- Benchmark tests (max reps + mile time vs Murph targets) --- */
const MURPH_TARGETS={pullups:100,pushups:200,squats:300};
const BENCH_METRICS=[
  {id:"pullups",label:"Pull-ups"},
  {id:"pushups",label:"Push-ups"},
  {id:"squats",label:"Squats"},
  {id:"mileSec",label:"1-mile",time:true}
];
let benchMetric="pullups";
// Accepts "m:ss"/"mm:ss", and also bare digits from the numeric keypad ("830" -> 8:30).
function parseMile(s){
  s=String(s).trim();
  const m=s.match(/^(\d{1,2}):([0-5]\d)$/);
  if(m) return (+m[1])*60+(+m[2]);
  const d=s.replace(/\D/g,"");
  if(/^\d{3,4}$/.test(d)){ const sec=+d.slice(-2), min=+d.slice(0,-2); if(sec<60) return min*60+sec; }
  return null;
}
// Numeric keypad has no colon, so insert it as they type: "830" displays as "8:30".
function formatMileField(v){ const d=String(v).replace(/\D/g,"").slice(0,4); return d.length>2 ? d.slice(0,-2)+":"+d.slice(-2) : d; }
function fmtMile(sec){ if(sec==null) return "—"; const m=Math.floor(sec/60), s=Math.round(sec%60); return m+":"+String(s).padStart(2,"0"); }
function renderBenchmarks(){
  const rEl=$("bench-readiness"); if(!rEl) return;
  const list=(state.benchmarks||[]).slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  if(list.length){
    const latest=list[list.length-1];
    let html='<div class="bench-latest">Latest test · '+fmtDate(latest.date)+'</div>';
    [["pullups","Pull-ups"],["pushups","Push-ups"],["squats","Air squats"]].forEach(([k,lbl])=>{
      if(latest[k]!=null){ const tgt=MURPH_TARGETS[k], pct=Math.min(100,Math.round(latest[k]/tgt*100));
        html+='<div class="rbar-row"><div class="rbar-top"><span>'+lbl+'</span><span class="rbar-val">'+latest[k]+' / '+tgt+'</span></div><div class="rbar"><i style="width:'+pct+'%"></i></div></div>';
      }
    });
    if(latest.mileSec!=null) html+='<div class="rbar-row"><div class="rbar-top"><span>1-mile run</span><span class="rbar-val">'+fmtMile(latest.mileSec)+'</span></div></div>';
    rEl.innerHTML=html;
  } else {
    rEl.innerHTML='<p class="chart-empty">No tests yet — log your first benchmark to see where you stand vs Murph.</p>';
  }
  const ctr=$("bench-controls");
  ctr.innerHTML=BENCH_METRICS.map(m=>'<button data-m="'+m.id+'" class="'+(m.id===benchMetric?'sel':'')+'">'+m.label+'</button>').join("");
  ctr.querySelectorAll("button").forEach(b=>{ b.onclick=()=>{ benchMetric=b.getAttribute("data-m"); renderBenchmarks(); }; });
  const met=BENCH_METRICS.find(m=>m.id===benchMetric);
  const pts=list.filter(t=>t[benchMetric]!=null).map(t=>({label:fmtDate(t.date),y:t[benchMetric]}));
  svgLine($("bench-chart"), pts, met.time
    ? {fmt:fmtMile,empty:"Log a couple of mile times to see your pace trend."}
    : {fmt:v=>Math.round(v),empty:"Log a couple of tests to see your "+met.label.toLowerCase()+" trend."});
}
$("bench-log-btn").onclick=()=>{ const f=$("bench-form"); f.hidden=!f.hidden; if(!f.hidden && !$("bf-date").value) $("bf-date").value=todayKey(); };
$("bf-cancel").onclick=()=>{ $("bench-form").hidden=true; $("bf-msg").textContent=""; };
$("bf-mile").oninput=(e)=>{ e.target.value=formatMileField(e.target.value); };
$("bf-save").onclick=async()=>{
  const date=$("bf-date").value||todayKey();
  const pull=parseInt($("bf-pull").value,10), push=parseInt($("bf-push").value,10), squat=parseInt($("bf-squat").value,10);
  const mileRaw=$("bf-mile").value.trim(), mileSec=mileRaw?parseMile(mileRaw):null;
  if(mileRaw && mileSec==null){ $("bf-msg").textContent="Mile time should look like 8:30."; return; }
  const entry={date};
  if(!isNaN(pull)&&pull>=0) entry.pullups=pull;
  if(!isNaN(push)&&push>=0) entry.pushups=push;
  if(!isNaN(squat)&&squat>=0) entry.squats=squat;
  if(mileSec!=null) entry.mileSec=mileSec;
  if(Object.keys(entry).length<2){ $("bf-msg").textContent="Enter at least one result."; return; }
  if(!state.benchmarks) state.benchmarks=[];
  const i=state.benchmarks.findIndex(b=>b.date===date);
  if(i>=0) state.benchmarks[i]=entry; else state.benchmarks.push(entry);
  ["bf-pull","bf-push","bf-squat","bf-mile"].forEach(id=>$(id).value="");
  $("bench-form").hidden=true; $("bf-msg").textContent="";
  renderBenchmarks(); await save();
};

function renderProgressDash(){
  renderCountdownPhase();renderBenchmarks();renderMilestones();renderConsistency();renderDifficultyChart();renderStrengthChart();
}

function cleanupDay(k){const s=state.supps[k];if(s&&!s.creatine&&s.protein==null)delete state.supps[k];}
function resetInputs(){
  picked=null;
  weightFb={};
  [...$("diff").children].forEach(c=>{c.classList.remove("sel");c.style.background="";});
  $("notes").value="";
  $("complete").disabled=true;
}

/* ---------------- Handlers ---------------- */
$("complete").onclick=async()=>{
  if(!picked){$("miss").textContent="Pick a difficulty first.";return;}
  const done=state.completed.length;
  const day=ORDER[done%4];
  // Record the weight used per lift this session, and apply "too heavy/light" feedback to next time's recommendation.
  const list=weightedForDay(day); const used={};
  if(!state.weights) state.weights={};
  const dl=deloadActive();
  const changes=[];
  list.forEach(e=>{
    const base=exWeight(e);
    used[e.name]= dl ? dlWeight(e) : base;   // record what was actually lifted
    if(dl) return;                            // deload week: don't change base weights or take feedback
    const dir=weightFb[e.name];
    if(dir==="down"){ state.weights[e.name]=Math.max(e.w.step, base-e.w.step); changes.push({name:e.name,from:base,to:state.weights[e.name],dir}); }
    else if(dir==="up"){ state.weights[e.name]=base+e.w.step; changes.push({name:e.name,from:base,to:state.weights[e.name],dir}); }
    else state.weights[e.name]=base;
  });
  const entry={session:done+1,day,date:new Date().toISOString(),difficulty:picked,notes:$("notes").value.trim()};
  if(list.length) entry.weights=used;
  // Generate the coach's note from this session's feedback.
  const pain=/\b(hurt|hurts|pain|painful|sharp|tweak|tweaked|strain|strained|pull(ed)?|ache|aching|joint)\b/i.test(entry.notes||"");
  state.coachNote={ session:entry.session, html:buildCoachHTML({day,difficulty:entry.difficulty,changes,pain}) };
  state.completed.push(entry);
  // Recommend a recovery day after a maximal or painful session.
  state.recoveryDue = (entry.difficulty>=9 || pain);
  state.recoveryReason = pain ? "pain" : (entry.difficulty>=9 ? "hard" : null);
  // Update the deload cycle (reads completed incl. this session).
  updateDeloadAfterSession();
  resetInputs(); render(); await save();
  const cn=$("coach-note");
  if(cn && !cn.hidden) cn.scrollIntoView({behavior:"smooth",block:"center"});
  else window.scrollTo({top:0,behavior:"smooth"});
};
$("creatine-btn").onclick=async()=>{
  const tk=todayKey(); state.supps[tk]=state.supps[tk]||{};
  if(state.supps[tk].creatine){delete state.supps[tk].creatine;}
  else{state.supps[tk].creatine=CREATINE_G;}
  cleanupDay(tk); renderSupps(); await save();
};
$("protein-btn").onclick=async()=>{
  const tk=todayKey(); state.supps[tk]=state.supps[tk]||{};
  if(state.supps[tk].protein!=null){delete state.supps[tk].protein;}
  else{state.supps[tk].protein=SHAKE_G;}
  cleanupDay(tk); renderSupps(); await save();
};
$("undo").onclick=async()=>{if(!state.completed.length)return;state.completed.pop();render();await save();};
$("reset").onclick=async()=>{
  if(!confirm("Clear your entire log (workouts + supplements)? This can't be undone."))return;
  // Clear the log; keep profile/settings (bodyweight, weights, goal inputs, reminder setup).
  state={completed:[],supps:{},plan:"murph-phase1",bodyweight:state.bodyweight||null,weights:state.weights||{},
    murphDate:state.murphDate||null,daysPerWeek:state.daysPerWeek||null,reminderPrefs:state.reminderPrefs||null,fcmTokens:state.fcmTokens||[]};
  normalizeState();
  resetInputs();render();$("copy-panel").classList.remove("show");await save();
};
$("copy").onclick=async()=>{
  let txt="Murph Tracker — "+nameFor((user&&user.email||"").toLowerCase())+"'s session log:\n";
  if(state.bodyweight>0){ const rg=proteinRange(); txt+="Bodyweight: "+state.bodyweight+" lb · protein target ~"+proteinGoal()+" g/day (range "+rg[0]+"–"+rg[1]+")\n"; }
  if(state.completed.length){
    state.completed.forEach(c=>{
      let line="#"+c.session+" Day "+c.day+" ("+PHASE1[c.day].nm+") — "+fmtDate(c.date)+" — difficulty "+c.difficulty+"/10";
      if(c.weights) line+=" — weights: "+Object.entries(c.weights).map(([n,w])=>n+" "+w+"lb").join(", ");
      if(c.notes) line+=" — "+c.notes;
      txt+=line+"\n";
    });
  }else{txt+="(none yet)\n";}
  if(state.weights && Object.keys(state.weights).length){
    txt+="\nCurrent recommended weights:\n";
    Object.entries(state.weights).forEach(([n,w])=>{txt+=n+" — "+w+" lb\n";});
  }
  const days=Object.keys(state.supps).sort();
  if(days.length){
    txt+="\nSupplements:\n";
    days.forEach(k=>{const s=state.supps[k];txt+=fmtDate(k)+" — creatine "+(s.creatine?s.creatine+"g":"—")+" — shake "+(s.protein!=null?"✓ ("+s.protein+"g)":"—")+"\n";});
  }
  $("copy-text").value=txt; $("copy-panel").classList.add("show");
  try{await navigator.clipboard.writeText(txt);$("cmsg").textContent="Copied to clipboard.";}
  catch(e){$("cmsg").textContent="Select the text below and copy it.";$("copy-text").focus();$("copy-text").select();}
};

/* ---------------- Navigation (hamburger drawer + views) ---------------- */
const VIEWS=["workout","supps","history","progress","inputs"];
function openDrawer(){ $("drawer").classList.add("open"); $("drawer-backdrop").classList.add("show"); }
function closeDrawer(){ $("drawer").classList.remove("open"); $("drawer-backdrop").classList.remove("show"); }
function showView(v){
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

/* ---------------- Reminders (push notifications) ---------------- */
const DAY_LABELS=["S","M","T","W","T","F","S"];
const DAY_NAMES=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function setRemStatus(msg,type){ const el=$("rem-status"); if(!el)return; el.textContent=msg||""; el.className="rem-status"+(type?" "+type:""); }
function updateDaySummary(){
  const el=$("rem-days-summary"); if(!el) return;
  const sel=[...$("rem-days").querySelectorAll(".rem-day.sel")].map(b=>+b.dataset.d).sort((a,b)=>a-b);
  if(sel.length===7){ el.textContent="On: every day"; }
  else if(sel.length){ el.textContent="On: "+sel.map(i=>DAY_NAMES[i]).join(" · "); }
  else{ el.textContent="No days selected — pick at least one."; }
}
/* ---------------- Inputs page: goal (target date · days/week · weight) ---------------- */
function dpwSelected(){ const el=$("dpw-pills"); if(!el) return null; const b=el.querySelector(".rem-day.sel"); return b?+b.dataset.d:null; }
// Live pace read-out from whatever is currently in the inputs (saved or not).
function updatePaceReadout(){
  const cap=$("pace-readout"); if(!cap) return;
  const md=parseYMD($("murph-date-in").value), dpw=dpwSelected();
  const info=paceInfo(md, dpw, state.completed?state.completed.length:0);
  if(!info){ cap.className="supp-caption"; cap.innerHTML="Pick a target date and weekly cadence to see if you're on track."; return; }
  if(info.onPace){
    cap.className="supp-caption hit";
    cap.innerHTML="At <b>"+dpw+" day"+(dpw>1?"s":"")+"/week</b> you'll be Murph-ready by "+fmtDate(iso(md))+" — <b>on track</b> (~"+info.weeksPerPhase+" weeks per phase).";
  }else{
    const over=info.weeksNeeded-Math.floor(info.weeksUntil);
    cap.className="supp-caption";
    cap.innerHTML="At "+dpw+" day"+(dpw>1?"s":"")+"/week that's ~<b>"+over+" week"+(over!==1?"s":"")+" past</b> "+fmtDate(iso(md))+". Train ~<b>"+info.suggestedDpw+"/week</b>, or move the date.";
  }
}
function renderInputs(){
  const el=$("dpw-pills"); if(!el) return;
  $("goal-intro").hidden = !onboardingIncomplete();
  const di=$("murph-date-in"); if(document.activeElement!==di) di.value=state.murphDate||"";
  const wi=$("weight-in"); if(document.activeElement!==wi) wi.value=state.bodyweight>0?state.bodyweight:"";
  const sel=state.daysPerWeek;
  el.innerHTML=[1,2,3,4,5,6,7].map(n=>'<button type="button" class="rem-day'+(sel===n?" sel":"")+'" data-d="'+n+'">'+n+'</button>').join("");
  el.querySelectorAll(".rem-day").forEach(b=>{ b.onclick=()=>{
    el.querySelectorAll(".rem-day").forEach(x=>x.classList.remove("sel"));
    b.classList.add("sel"); updatePaceReadout();
  }; });
  updatePaceReadout();
}
function renderReminders(){
  const btn=$("rem-toggle"); if(!btn) return;
  const p=state.reminderPrefs||{}; const on=!!p.enabled;
  btn.textContent = on ? "Reminders are on ✓" : "Turn on reminders";
  btn.classList.toggle("on", on);
  $("rem-prefs").hidden = !on;
  if(on){
    const days=p.days||[];
    $("rem-days").innerHTML=DAY_LABELS.map((d,i)=>'<button type="button" class="rem-day'+(days.includes(i)?" sel":"")+'" data-d="'+i+'">'+d+'</button>').join("");
    $("rem-days").querySelectorAll(".rem-day").forEach(b=>{ b.onclick=()=>{ b.classList.toggle("sel"); updateDaySummary(); }; });
    $("rem-time").value=p.time||"07:00";
    updateDaySummary();
  }
  if(DEV && !$("rem-status").textContent){
    setRemStatus("Preview mode: you can set the schedule here, but reminders only actually send from the live app.","");
  }
}
async function enableReminders(){
  const p=state.reminderPrefs;
  if(DEV){ p.enabled=true; await save(); renderReminders(); setRemStatus("Preview: turned on locally — set your days/time below. Real delivery only happens on the live app.","ok"); return; }
  const btn=$("rem-toggle"); btn.disabled=true; btn.textContent="Setting up…"; setRemStatus("");
  try{
    if(!(await messagingSupported())){
      setRemStatus("This browser can't receive push notifications yet. On iPhone: add the app to your Home Screen (Share → Add to Home Screen), open it from that icon, then try again.","err"); return;
    }
    const perm=await Notification.requestPermission();
    if(perm!=="granted"){ setRemStatus("Notifications are turned off for this app. Allow them in settings, then try again.","err"); return; }
    const fcmReg=await navigator.serviceWorker.register("./firebase-messaging-sw.js",{scope:"./push/"});
    const token=await getToken(getMessaging(fbApp),{vapidKey:VAPID_KEY,serviceWorkerRegistration:fcmReg});
    if(!token){ setRemStatus("Couldn't finish setting up — please try again.","err"); return; }
    if(!state.fcmTokens) state.fcmTokens=[];
    if(!state.fcmTokens.includes(token)) state.fcmTokens.push(token);
    p.enabled=true; p.tz=Intl.DateTimeFormat().resolvedOptions().timeZone||p.tz||"America/New_York";
    await save();
    renderReminders(); setRemStatus("Reminders are on ✓ Pick your days and time below.","ok");
  }catch(e){ setRemStatus("Something went wrong: "+(e.code||e.message||e),"err"); }
  finally{ btn.disabled=false; renderReminders(); }
}
$("rem-toggle").onclick=async()=>{
  const p=state.reminderPrefs;
  if(p.enabled){ p.enabled=false; await save(); renderReminders(); setRemStatus("Reminders are off.",""); return; }
  enableReminders();
};
$("rem-save").onclick=async()=>{
  const p=state.reminderPrefs;
  p.days=[...$("rem-days").querySelectorAll(".rem-day.sel")].map(b=>+b.dataset.d);
  p.time=$("rem-time").value||"07:00";
  p.tz=Intl.DateTimeFormat().resolvedOptions().timeZone||p.tz||"America/New_York";
  await save();
  const m=$("rem-savemsg"); m.textContent="Saved ✓"; setTimeout(()=>{m.textContent="";},2000);
};
// Live-preview the pace read-out as the date/weight fields change (pills handle their own).
$("murph-date-in").oninput=updatePaceReadout;
$("goal-save").onclick=async()=>{
  const d=$("murph-date-in").value; state.murphDate = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  state.daysPerWeek = dpwSelected();
  const w=parseInt($("weight-in").value,10); state.bodyweight = (!isNaN(w)&&w>0) ? w : null;
  await save();
  render();   // refresh countdown, protein target, pace read-out
  if(!onboardingIncomplete()) showView("workout");   // onboarding done — send them to train
};

/* ---------------- Boot ---------------- */
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
