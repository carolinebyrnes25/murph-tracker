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
/* ---------------- Inputs page: goal (target date · days/week · weight) ---------------- */
export function dpwSelected(){ const el=$("dpw-pills"); if(!el) return null; const b=el.querySelector(".rem-day.sel"); return b?+b.dataset.d:null; }
// Live pace read-out from whatever is currently in the inputs (saved or not).
export function updatePaceReadout(){
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
export function renderInputs(){
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
  renderAll();   // refresh countdown, protein target, pace read-out
  if(!onboardingIncomplete()) showView("workout");   // onboarding done — send them to train
};
