import { getMessaging, getToken, isSupported as messagingSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import { DEV, VAPID_KEY } from "./config.js";
import { fbApp } from "./firebase.js";
import { $, fmtDate, iso, parseYMD } from "./util.js";
import { showView } from "./nav.js";
import { murphDate, onboardingIncomplete, paceInfo, renderAll, save, state } from "./store.js";

/* ---------------- Reminders (push notifications) ---------------- */
export const DAY_LABELS=["S","M","T","W","T","F","S"];
export const DAY_NAMES=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export function setRemStatus(msg,type){ const el=$("rem-status"); if(!el)return; el.textContent=msg||""; el.className="rem-status"+(type?" "+type:""); }
export function updateDaySummary(){
  const el=$("rem-days-summary"); if(!el) return;
  const sel=[...$("rem-days").querySelectorAll(".rem-day.sel")].map(b=>+b.dataset.d).sort((a,b)=>a-b);
  if(sel.length===7){ el.textContent="On: every day"; }
  else if(sel.length){ el.textContent="On: "+sel.map(i=>DAY_NAMES[i]).join(" · "); }
  else{ el.textContent="No days selected — pick at least one."; }
}
/* ---------------- Inputs page: profile (name · gender) + goal (date · days/week · weight) ---------------- */
export function dpwSelected(){ const el=$("dpw-pills"); if(!el) return null; const b=el.querySelector(".rem-day.sel"); return b?+b.dataset.d:null; }
export function genderSelected(){ const el=$("gender-pills"); if(!el) return null; const b=el.querySelector(".rem-day.sel"); return b?b.dataset.g:null; }
// Reflect the vest load implied by the currently-selected gender (previews before save).
export function updateVestHint(){
  const el=$("vest-hint"); if(!el) return;
  const g=genderSelected();
  el.textContent = g ? ("Your final Murph uses a "+(g==="f"?14:20)+"-lb vest.") : "";
}
// Live pace read-out from whatever is currently in the inputs (saved or not).
export function updatePaceReadout(){
  const cap=$("pace-readout"); if(!cap) return;
  const md=parseYMD($("murph-date-in").value), dpw=dpwSelected();
  const info=paceInfo(md, dpw, state.completed?state.completed.length:0);
  if(!info){ cap.className="supp-caption"; cap.innerHTML="Pick a target date and weekly cadence to see if you're on track."; return; }
  if(info.onPace){
    const target=fmtDate(iso(md));
    if(info.slackWeeks>=3){
      // The date is LATER than this cadence needs — the program finishes with weeks to spare.
      // Surface that up front (so "I'm doing exactly 4×/week yet the date keeps moving up" never
      // comes as a surprise later) and let them reconcile it here rather than on the workout screen.
      const finishStr=fmtDate(iso(info.finish));
      const lower = info.suggestedDpw<dpw
        ? " Keep it as a cushion, or train ~<b>"+info.suggestedDpw+"/week</b> to land on "+target+"."
        : " Keep it as a cushion, or bring the date in.";
      cap.className="supp-caption";
      cap.innerHTML="At <b>"+dpw+" day"+(dpw>1?"s":"")+"/week</b> you'll be Murph-ready around <b>"+finishStr+
        "</b> — about <b>"+info.slackWeeks+" week"+(info.slackWeeks!==1?"s":"")+"</b> before "+target+"."+lower+
        '<button type="button" class="pace-move" id="pace-set-finish">Move target to '+finishStr+'</button>';
      const btn=$("pace-set-finish");
      if(btn) btn.onclick=()=>{ $("murph-date-in").value=iso(info.finish); updatePaceReadout(); };
    }else{
      cap.className="supp-caption hit";
      cap.innerHTML="At <b>"+dpw+" day"+(dpw>1?"s":"")+"/week</b> you'll be Murph-ready by "+target+" — <b>on track</b> (~"+info.weeksPerPhase+" weeks per phase).";
    }
  }else{
    const over=info.weeksNeeded-Math.floor(info.weeksUntil);
    cap.className="supp-caption";
    cap.innerHTML="At "+dpw+" day"+(dpw>1?"s":"")+"/week that's ~<b>"+over+" week"+(over!==1?"s":"")+" past</b> "+fmtDate(iso(md))+". Train ~<b>"+info.suggestedDpw+"/week</b>, or move the date.";
  }
}
// Spell out what the weight is actually for: it sets the daily protein target (0.8 g/lb,
// range 0.7–1.0). Reads the field live so the number moves as you type, before saving.
export function updateProteinHint(){
  const el=$("protein-hint"); if(!el) return;
  const w=parseInt($("weight-in").value,10);
  if(!(w>0)){ el.textContent="Your protein target is worked out from this."; return; }
  el.innerHTML="At "+w+" lb we'll aim for <b>~"+Math.round(w*0.8)+" g protein/day</b> (range "+
    Math.round(w*0.7)+"–"+Math.round(w)+" g) — shown on Daily supplements.";
}
export function renderInputs(){
  const el=$("dpw-pills"); if(!el) return;
  $("goal-intro").hidden = !onboardingIncomplete();
  const ni=$("name-in"); if(document.activeElement!==ni) ni.value=state.name||"";
  const di=$("murph-date-in"); if(document.activeElement!==di) di.value=state.murphDate||"";
  const wi=$("weight-in"); if(document.activeElement!==wi) wi.value=state.bodyweight>0?state.bodyweight:"";
  updateProteinHint();
  // gender pills
  const gEl=$("gender-pills");
  gEl.innerHTML=[["m","Male"],["f","Female"]].map(([g,lbl])=>'<button type="button" class="rem-day'+(state.gender===g?" sel":"")+'" data-g="'+g+'">'+lbl+'</button>').join("");
  gEl.querySelectorAll(".rem-day").forEach(b=>{ b.onclick=()=>{
    gEl.querySelectorAll(".rem-day").forEach(x=>x.classList.remove("sel"));
    b.classList.add("sel"); updateVestHint();
  }; });
  updateVestHint();
  // days-per-week pills
  const sel=state.daysPerWeek;
  el.innerHTML=[1,2,3,4,5,6,7].map(n=>'<button type="button" class="rem-day'+(sel===n?" sel":"")+'" data-d="'+n+'">'+n+'</button>').join("");
  el.querySelectorAll(".rem-day").forEach(b=>{ b.onclick=()=>{
    el.querySelectorAll(".rem-day").forEach(x=>x.classList.remove("sel"));
    b.classList.add("sel"); updatePaceReadout();
  }; });
  updatePaceReadout();
}
/* ---- In-app reminder fallback ----
   iOS silently drops PWA push, so the reminder the sender queued may never reach the phone.
   Surface the most recent one as a dismissible banner on the home screen when the user opens
   the app themselves — a reliable backstop that doesn't depend on push landing at all. */
function daysAgo(dayStr){ const d=parseYMD(dayStr); if(!d) return Infinity; const t=new Date(); t.setHours(0,0,0,0); return Math.round((t-d)/86400000); }
export function renderReminderCatchup(){
  const el=$("reminder-catchup"); if(!el) return;
  const r=state.lastReminder;
  // Only surface a fresh reminder (today or yesterday) the user hasn't already dismissed.
  if(!r || !r.day || state.lastReminderSeen===r.day || daysAgo(r.day)>1){ el.hidden=true; el.innerHTML=""; return; }
  const esc=s=>String(s==null?"":s).replace(/</g,"&lt;");
  el.hidden=false;
  el.innerHTML='<button class="rp-x" aria-label="Dismiss">×</button>'+
    '<div class="rp-kicker">🔔 Reminder'+(daysAgo(r.day)===1?" · yesterday":"")+'</div>'+
    '<div class="rp-title">'+esc(r.title)+'</div>'+
    '<div class="rp-body">'+esc(r.body)+'</div>';
  el.querySelector(".rp-x").onclick=async()=>{ state.lastReminderSeen=r.day; el.hidden=true; el.innerHTML=""; await save(); };
}
export function renderReminders(){
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
export async function enableReminders(){
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
// Keep this device's FCM token fresh. Web-push tokens rotate/expire (SW updates, storage
// eviction, iOS refreshing its push subscription), and a stale token silently stops delivering
// while the sender still reports success — so reminders "just stop" with no error anywhere.
// Re-mint on each app open when reminders are on, so a dead token is replaced automatically
// (no need to toggle anything). Fully silent; on any failure the existing token still stands.
export async function refreshPushToken(){
  try{
    const p=state.reminderPrefs;
    if(DEV || !p || !p.enabled) return;
    if(typeof Notification==="undefined" || Notification.permission!=="granted") return;
    if(!(await messagingSupported())) return;
    const fcmReg=await navigator.serviceWorker.register("./firebase-messaging-sw.js",{scope:"./push/"});
    const token=await getToken(getMessaging(fbApp),{vapidKey:VAPID_KEY,serviceWorkerRegistration:fcmReg});
    if(!token) return;
    if(!state.fcmTokens) state.fcmTokens=[];
    if(!state.fcmTokens.includes(token)){ state.fcmTokens.push(token); await save(); }
  }catch(e){ /* silent — a working token, if any, keeps delivering */ }
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
$("weight-in").oninput=updateProteinHint;
$("goal-save").onclick=async()=>{
  const nm=$("name-in").value.trim(); state.name = nm || null;
  state.gender = genderSelected();
  const d=$("murph-date-in").value; state.murphDate = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  state.daysPerWeek = dpwSelected();
  const w=parseInt($("weight-in").value,10); state.bodyweight = (!isNaN(w)&&w>0) ? w : null;
  // Save whatever is filled in first — a half-finished profile shouldn't be lost on reload —
  // then say what's still needed. The nav gate (setNavLocked in render) does the enforcing.
  await save();
  renderAll();   // refresh countdown, protein target, pace read-out
  const missing=[
    [!state.name,          "name-in",       "your name"],
    [!state.gender,        "gender-pills",  "gender"],
    [!state.murphDate,     "murph-date-in", "a target date"],
    [!(state.daysPerWeek>0),"dpw-pills",    "days per week"],
    [!(state.bodyweight>0),"weight-in",     "your weight"]
  ].filter(m=>m[0]);
  document.querySelectorAll("#view-inputs .needs").forEach(e=>e.classList.remove("needs"));
  const msg=$("goal-msg");
  if(missing.length){
    missing.forEach(([,id])=>{ const e=$(id); if(e) e.classList.add("needs"); });
    const names=missing.map(m=>m[2]);
    msg.className="bf-msg err";
    msg.textContent="Still needed: "+(names.length>1 ? names.slice(0,-1).join(", ")+" and "+names[names.length-1] : names[0])+".";
    $(missing[0][1]).scrollIntoView({block:"center"});
    return;
  }
  msg.className="bf-msg"; msg.textContent="";
  showView("workout");   // onboarding done — send them to train
};
