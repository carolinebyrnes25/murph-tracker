import { DEV, PHASE1_SESSIONS } from "./config.js";
import { auth } from "./firebase.js";
import { $, diffColor, fmtDate, iso, joinNames, pick, shortName } from "./util.js";
import { loadBasis, ORDER, PHASE1, workoutFor } from "./plan.js";
import { actualPace, deloadActive, dlWeight, exWeight, murphDate, myName, planPos, renderAll, save, state, updateAccelAfterSession, updateDeloadAfterSession, vestWeight } from "./store.js";

// The workout for the current plan position, generated from tested capability.
function todaysWorkout(){ return workoutFor(planPos(), state.benchmarks, vestWeight()); }

export let picked=null;
export let weightFb={};   // transient per-session weight feedback: exerciseName -> "down"|"good"|"up"
export function buildCoachHTML(c){
  const dayName = c.nm || (PHASE1[c.day] ? PHASE1[c.day].nm : ("Day "+c.day));
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
// ---- AI coach note ----
// A protected Gemini proxy (Cloud Function) holds the API key server-side and only serves
// allow-listed, signed-in accounts — same setup as the baby-answers / byrnes-finance apps.
const AI_FN_URL="https://us-central1-murph-tracker-c94db.cloudfunctions.net/askAI";
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
// Wrap the AI's plain-text reply into the same card shell buildCoachHTML uses, so the
// dismiss button + kicker keep working. Text is escaped — model output is never trusted as HTML.
function buildAICoachCard(dayName, text){
  const paras=String(text).trim().split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
  const body=(paras.length?paras:[String(text)]).map(p=>'<p>'+esc(p).replace(/\n/g,"<br>")+'</p>').join("");
  return '<button class="coach-x" aria-label="Dismiss">×</button>'+
    '<div class="coach-kicker">Coach\'s note · '+esc(dayName)+'</div>'+body;
}
// Best-effort upgrade: rewrite the note so it actually responds to what the athlete typed.
// If anything fails (offline, dev, not allow-listed, proxy error) the instant rule-based
// note that's already on screen simply stands.
export async function enhanceCoachNote(session, ctx){
  if(DEV) return;                                    // dev mode runs offline of Firebase/AI
  const u=auth&&auth.currentUser; if(!u) return;
  const system=[
    "You are an encouraging, knowledgeable strength & conditioning coach writing a short post-workout note to "+ctx.name+", who is training for the Murph workout (1-mile run, then 100 pull-ups, 200 push-ups, 300 squats, then a 1-mile run).",
    "Write 2-3 short paragraphs, warm and direct, in plain text only — no markdown, no bullet lists, at most one emoji. Address "+ctx.name+" by name once.",
    "MOST IMPORTANT: read their written feedback and respond to the SPECIFICS of what they actually did. If they did more volume than prescribed, or a harder variation than prescribed (for example unassisted pull-ups instead of assisted, or full floor push-ups instead of incline), explicitly acknowledge that they went above and beyond, and tell them you'll make the next sessions harder to match.",
    "The current plan position is Phase "+ctx.phase+(ctx.phaseName?" ("+ctx.phaseName+")":"")+". Phase 1 (Foundation) deliberately uses SCALED movements — assisted or band pull-ups, incline push-ups, jog/walk intervals. If the athlete reports comfortably doing the UNSCALED harder versions (real unassisted pull-ups, floor push-ups, continuous running) or clearly found the session easy, tell them they may have outgrown the scaling and should log a Benchmark test in the app — passing it advances them to the next phase, which unlocks harder workouts. Only bring up the benchmark test when their feedback genuinely signals they're ready.",
    "Treat the difficulty rating as ONE signal, not the whole story — their written notes matter more. Never contradict what they wrote.",
    (ctx.pain?"They flagged something that hurt — gently suggest easing off that movement and watching for sharp or joint pain, without being alarmist.":""),
    (ctx.jumped?"They earned a jump forward in the plan for a run of easy sessions — congratulate them on it.":""),
    "End on an encouraging note. Never invent facts you weren't given."
  ].filter(Boolean).join("\n");
  const userMsg=[
    "Day: "+ctx.dayName+(ctx.tag?" — "+ctx.tag:""),
    "Prescribed today:\n- "+(ctx.prescribed.length?ctx.prescribed.join("\n- "):"(as listed)"),
    "Difficulty they rated it: "+ctx.difficulty+"/10",
    (ctx.changes.length?"Weight adjustments for next time:\n- "+ctx.changes.join("\n- "):""),
    "Their written feedback: "+(ctx.notes?('"'+ctx.notes+'"'):"(none entered)")
  ].filter(Boolean).join("\n\n");
  try{
    const token=await u.getIdToken();
    const r=await fetch(AI_FN_URL,{method:"POST",
      headers:{"content-type":"application/json","Authorization":"Bearer "+token},
      body:JSON.stringify({system, messages:[{role:"user", content:userMsg}]})});
    const j=await r.json().catch(()=>null);
    if(!r.ok || !j || !j.text || !j.text.trim()) return;      // keep the rule-based note
    if(!state.coachNote || state.coachNote.session!==session) return;  // a newer session was logged
    state.coachNote.html=buildAICoachCard(ctx.dayName, j.text.trim());
    state.coachNote.ai=true;
    renderCoachNote(); await save();
  }catch(e){ /* offline or blocked — the instant note stands */ }
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
  const w0=todaysWorkout(); const day=w0.day;
  const reason = state.recoveryReason==="pain"
    ? "You flagged something that hurt last session."
    : "Your last session was near-maximal.";
  $("rec-msg").innerHTML = reason+" A <b>recovery day</b> before Day "+day+" ("+w0.nm+") is the smart call — a short walk or easy stretch, water, protein, and a good night's sleep. That's when the gains actually happen.";
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
  const w=todaysWorkout();
  const day=w.day;
  const dl=deloadActive();
  let rows=w.ex.map(e=>{
    const dose=e.w ? (e.dose+' · '+dlWeight(e)+' lb '+loadBasis(e)+(dl?' <span class="deload-tag">deload</span>':'')) : e.dose;
    return '<div class="ex"><div class="row"><span class="name">'+e.name+'</span><span class="dose">'+dose+'</span></div>'+(e.what?'<div class="what">'+e.what+'</div>':'')+(e.note?'<div class="note">'+e.note+'</div>':'')+'</div>';
  }).join("");
  $("next-card").className="next fade-in";
  $("next-card").innerHTML='<div class="next-head"><div class="letter">'+day+'</div><div class="t"><div class="nm">'+w.nm+'</div><div class="tag">'+w.tag+'</div></div></div><div class="ex-list">'+rows+'</div>';
}
// Weight-feedback controls in the "Log this session" area for the current day's weighted lifts.
export function renderWeights(){
  const w=todaysWorkout();
  const day=w.day;
  const list=(w.ex||[]).filter(e=>e.w);
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
    html+='<div class="wt-row"><div class="wt-head"><span class="wt-name">'+e.name+'</span><span class="wt-cur">'+cur+' lb '+loadBasis(e)+' · today</span></div>'+
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
  const w0=todaysWorkout(); const day=w0.day;
  // Record the weight used per lift this session, and apply "too heavy/light" feedback to next time's recommendation.
  const list=(w0.ex||[]).filter(e=>e.w); const used={};
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
  // Freeze what this session actually prescribed. Phases 2-4 are generated from the CURRENT
  // benchmark, so without this a later test would retroactively rewrite history — and milestones
  // would tick themselves for work he never did.
  entry.totals={...w0.totals}; entry.phase=w0.phase; entry.nm=w0.nm;
  // Generate the coach's note from this session's feedback.
  // NB: no "pull"/"pulled" here — this app is full of pull-ups, pulldowns and "pull volume",
  // so those words are exercise names, not pain reports. A pulled muscle still trips "strain(ed)".
  const pain=/\b(hurt|hurts|pain|painful|sharp|tweak|tweaked|strain|strained|ache|aching|joint)\b/i.test(entry.notes||"");
  state.completed.push(entry);
  // Recommend a recovery day after a maximal or painful session.
  state.recoveryDue = (entry.difficulty>=9 || pain);
  state.recoveryReason = pain ? "pain" : (entry.difficulty>=9 ? "hard" : null);
  // Update the deload cycle (reads completed incl. this session).
  updateDeloadAfterSession();
  // Then the mirror: a run of easy sessions jumps him forward. Deload runs first so a deload that
  // just started blocks a jump in the same breath.
  const jumped=updateAccelAfterSession(pain);
  // Instant, deterministic note — shows immediately and stays as the fallback if the AI
  // note never lands (offline, dev mode, not allow-listed, or the proxy erroring). `aiCtx`
  // is the full picture the AI coach reads to write a note that responds to the free-text.
  const aiCtx={
    name:myName(),
    dayName:w0.nm, tag:w0.tag||"", phase:w0.phase, phaseName:w0.phaseName||"",
    difficulty:entry.difficulty,
    notes:entry.notes||"",
    prescribed:(w0.ex||[]).map(e=>e.name+" — "+e.dose),
    changes:(changes||[]).map(c=>shortName(c.name)+": "+c.from+"→"+c.to+" lb ("+c.dir+")"),
    pain, jumped
  };
  state.coachNote={ session:entry.session, html:buildCoachHTML({day,nm:w0.nm,difficulty:entry.difficulty,changes,pain,jumped}) };
  resetInputs(); renderAll(); await save();
  const cn=$("coach-note");
  if(cn && !cn.hidden) cn.scrollIntoView({behavior:"smooth",block:"center"});
  else window.scrollTo({top:0,behavior:"smooth"});
  enhanceCoachNote(entry.session, aiCtx);   // fire-and-forget upgrade to an AI-written note
};
