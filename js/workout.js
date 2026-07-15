import { PHASE1_SESSIONS } from "./config.js";
import { $, diffColor, fmtDate, iso, joinNames, pick, shortName } from "./util.js";
import { ORDER, PHASE1, weightedForDay } from "./plan.js";
import { actualPace, deloadActive, dlWeight, exWeight, murphDate, myName, planPos, renderAll, save, state, updateAccelAfterSession, updateDeloadAfterSession } from "./store.js";

export let picked=null;
export let weightFb={};   // transient per-session weight feedback: exerciseName -> "down"|"good"|"up"
export function buildCoachHTML(c){
  const dayName = PHASE1[c.day] ? PHASE1[c.day].nm : ("Day "+c.day);
  const nm=myName().replace(/</g,"&lt;");   // name is rendered via innerHTML below
  const opener = pick([
    "Nice work, "+nm+" — that's another one in the books. 💪",
    "Great job showing up and getting it done, "+nm+". 🙌",
    "Logged and done, "+nm+" — that consistency is the whole game.",
    "Strong work today, "+nm+". This is how it gets built, one session at a time. 🔥"
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
  // Earned a jump forward — say so, and say why, so it never looks like a lost session.
  const jump = c.jumped
    ? '<div class="coach-jump">⏩ <b>That\'s three easy sessions in a row — you\'re ahead of the plan.</b> '+
      'I\'ve moved you forward a session, so you\'ll reach the harder phases sooner and your finish date pulls in. '+
      'Your workout numbers keep climbing as usual.</div>'
    : '';
  return '<button class="coach-x" aria-label="Dismiss">×</button>'+
    '<div class="coach-kicker">Coach\'s note · '+dayName+'</div>'+
    '<p class="coach-open">'+opener+'</p>'+
    '<p>'+read+'</p>'+
    adj.map(a=>'<p>'+a+'</p>').join("")+
    jump+
    rec+
    '<p class="coach-close">'+closer+'</p>';
}
export function renderCoachNote(){
  const el=$("coach-note"); if(!el) return;
  const c=state.coachNote;
  if(!c || c.session!==state.completed.length){ el.hidden=true; el.innerHTML=""; return; }
  el.hidden=false; el.innerHTML=c.html;
  const x=el.querySelector(".coach-x");
  if(x) x.onclick=async()=>{ state.coachNote=null; el.hidden=true; el.innerHTML=""; await save(); };
}
/* ---- Recovery-day recommendation (real state, not just advice) ---- */
export function renderRecovery(){
  const el=$("recovery-card"); if(!el) return;
  if(!state.recoveryDue){ el.hidden=true; return; }
  el.hidden=false;
  const day=ORDER[planPos()%4];
  const reason = state.recoveryReason==="pain"
    ? "You flagged something that hurt last session."
    : "Your last session was near-maximal.";
  $("rec-msg").innerHTML = reason+" A <b>recovery day</b> before Day "+day+" ("+PHASE1[day].nm+") is the smart call — a short walk or easy stretch, water, protein, and a good night's sleep. That's when the gains actually happen.";
}
$("rec-rest").onclick=async()=>{
  state.recoveryDue=false; state.recoveryReason=null;
  if(!state.restDays) state.restDays=0; state.restDays++;
  renderAll(); await save();
  window.scrollTo({top:0,behavior:"smooth"});
};
$("rec-proceed").onclick=async()=>{
  state.recoveryDue=false; state.recoveryReason=null;
  renderAll(); await save();
  const nx=document.querySelector('#view-workout .next'); if(nx) nx.scrollIntoView({behavior:"smooth",block:"start"});
};
/* ---------------- Rendering ---------------- */
export function buildDiff(){
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
export function renderBanner(){
  const slot=$("banner-slot"); slot.innerHTML="";
  if(deloadActive()){
    slot.innerHTML+='<div class="banner"><span class="ic">🔄</span><span><b>Deload week · session '+(5-state.deload.left)+' of 4.</b> Planned recovery after a hard stretch — go ~15% lighter, drop a set, keep it easy. You\'ll come back stronger.</span></div>';
  }
  if(planPos()>=PHASE1_SESSIONS){
    slot.innerHTML+='<div class="banner done"><span class="ic">🏁</span><span><b>Phase 1 complete — nice work.</b> You can keep logging here in the meantime.</span></div>';
  }
}
export function renderNext(){
  const done=planPos();
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
export function renderWeights(){
  const day=ORDER[planPos()%4];
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
export function renderProgress(){
  const done=planPos();
  const session=Math.min(done+1,PHASE1_SESSIONS);
  const week=Math.min(Math.floor(done/4)+1,4);
  const day=ORDER[done%4];
  $("title").textContent=done>=PHASE1_SESSIONS?"Phase 1 done":"Next up · Day "+day;
  $("prog-left").innerHTML="Session <b>"+session+"</b> of "+PHASE1_SESSIONS+" · Week <b>"+week+"</b>";
  $("prog-right").textContent=Math.round(Math.min(done,PHASE1_SESSIONS)/PHASE1_SESSIONS*100)+"%";
  setTimeout(()=>{$("bar").style.width=Math.min(done,PHASE1_SESSIONS)/PHASE1_SESSIONS*100+"%";},50);
  renderPaceLine();
}
// Target date + whether the REAL training rate is keeping up with the promised one.
export function renderPaceLine(){
  const el=$("pace-line"); if(!el) return;
  const p=actualPace();
  if(!p){ el.hidden=true; return; }            // no target date / cadence set yet
  el.hidden=false;
  const md=murphDate(), target=md?fmtDate(iso(md)):"";
  const rate=v=>(Math.round(v*10)/10);
  if(p.status==="done"){
    el.className="pace-line on";
    el.innerHTML="🏁 <b>Program complete.</b> Target was "+target+".";
  }else if(p.status==="none"){
    el.className="pace-line";
    el.innerHTML="🎯 Target <b>"+target+"</b> · log your first session to start tracking your pace.";
  }else if(p.status==="early"){
    el.className="pace-line";
    el.innerHTML="🎯 Target <b>"+target+"</b> · aiming for "+p.dpw+"×/week. Pace check unlocks after "+
      p.daysLeft+" more day"+(p.daysLeft===1?"":"s")+" of history.";
  }else if(p.status==="on"){
    el.className="pace-line on";
    const jumps=p.credit ? " You've earned <b>"+p.credit+"</b> jump"+(p.credit===1?"":"s")+" forward for easy sessions." : "";
    el.innerHTML="✅ <b>On track for "+target+"</b> · you're training <b>"+rate(p.rate)+"×/week</b> vs the "+p.dpw+" you planned."+jumps;
    // Running far enough ahead that the target date itself is worth pulling in.
    if(p.suggestDate){
      el.innerHTML+='<div class="pace-ahead">🚀 At this rate you\'d be Murph-ready around <b>'+fmtDate(p.suggestDate)+
        '</b> — about '+p.aheadWeeks+' weeks early. <button class="pace-move" id="pace-move">Move my target to '+fmtDate(p.suggestDate)+'</button></div>';
      const btn=$("pace-move");
      if(btn) btn.onclick=async()=>{ state.murphDate=p.suggestDate; await save(); renderAll(); };
    }
  }else{
    el.className="pace-line behind";
    const late=Math.max(1,p.weeksLate);
    el.innerHTML="⚠️ <b>Behind by ~"+late+" week"+(late===1?"":"s")+".</b> At <b>"+rate(p.rate)+"×/week</b> (you planned "+p.dpw+
      ") you'd finish "+fmtDate(iso(p.finish))+", not "+target+". Training "+p.needRate+"×/week gets you there.";
  }
}
export function resetInputs(){
  picked=null;
  weightFb={};
  [...$("diff").children].forEach(c=>{c.classList.remove("sel");c.style.background="";});
  $("notes").value="";
  $("complete").disabled=true;
}
/* ---------------- Handlers ---------------- */
$("complete").onclick=async()=>{
  if(!picked){$("miss").textContent="Pick a difficulty first.";return;}
  // Which workout he's doing follows the PLAN position (credits included); the entry is numbered by
  // how many he has actually done — renderCoachNote matches on that, and the history log should
  // count real workouts, not plan slots.
  const done=planPos();
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
  const entry={session:state.completed.length+1,day,date:new Date().toISOString(),difficulty:picked,notes:$("notes").value.trim()};
  if(list.length) entry.weights=used;
  // Generate the coach's note from this session's feedback.
  const pain=/\b(hurt|hurts|pain|painful|sharp|tweak|tweaked|strain|strained|pull(ed)?|ache|aching|joint)\b/i.test(entry.notes||"");
  state.completed.push(entry);
  // Recommend a recovery day after a maximal or painful session.
  state.recoveryDue = (entry.difficulty>=9 || pain);
  state.recoveryReason = pain ? "pain" : (entry.difficulty>=9 ? "hard" : null);
  // Update the deload cycle (reads completed incl. this session).
  updateDeloadAfterSession();
  // Then the mirror: a run of easy sessions jumps him forward. Deload runs first so a deload that
  // just started blocks a jump in the same breath.
  const jumped=updateAccelAfterSession(pain);
  state.coachNote={ session:entry.session, html:buildCoachHTML({day,difficulty:entry.difficulty,changes,pain,jumped}) };
  resetInputs(); renderAll(); await save();
  const cn=$("coach-note");
  if(cn && !cn.hidden) cn.scrollIntoView({behavior:"smooth",block:"center"});
  else window.scrollTo({top:0,behavior:"smooth"});
};
