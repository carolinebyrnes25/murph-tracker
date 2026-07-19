import { $, diffColor, fmtDate } from "./util.js";
import { PHASE1 } from "./plan.js";
import { murphDate, myName, normalizeState, proteinGoal, proteinRange, renderAll, save, setState, state } from "./store.js";
import { resetInputs } from "./workout.js";

// Expanded view of one logged session: the workout as prescribed that day (with the weight
// actually used per lift) plus the feedback entered. Weights are the only per-session record of
// what he lifted; the rest of the prescription comes from the plan for that day.
export function histDetail(c){
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
export function renderHist(){
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
$("undo").onclick=async()=>{if(!state.completed.length)return;state.completed.pop();renderAll();await save();};
$("reset").onclick=async()=>{
  if(!confirm("Clear your entire log (workouts + supplements)? This can't be undone."))return;
  // Clear the log; keep profile/settings (bodyweight, weights, goal inputs, reminder setup).
  setState({completed:[],supps:{},plan:"murph-phase1",bodyweight:state.bodyweight||null,weights:state.weights||{},
    name:state.name||null,gender:state.gender||null,murphDate:state.murphDate||null,daysPerWeek:state.daysPerWeek||null,reminderPrefs:state.reminderPrefs||null,fcmTokens:state.fcmTokens||[],lastReminder:state.lastReminder||null,lastReminderSeen:state.lastReminderSeen||null});
  normalizeState();
  resetInputs();renderAll();$("copy-panel").classList.remove("show");await save();
};
$("copy").onclick=async()=>{
  let txt="Murph Tracker — "+myName()+"'s session log:\n";
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
