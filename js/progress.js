import { MURPH_TARGETS } from "./config.js";
import { $, fmtDate, fmtMile, formatMileField, iso, parseMile, shortName, todayKey } from "./util.js";
import { PHASE1, PHASE_NAMES, WEIGHTED_LIFTS, nextGate, phaseFor, readiness } from "./plan.js";
import { murphDate, planPos, save, state, vestWeight } from "./store.js";
import { svgBars, svgLine, weekStart, weeklyCounts } from "./charts.js";

export let selectedLift=WEIGHTED_LIFTS[0];
// The road to Murph — capability checkpoints tied to the real requirements
// (1-mi run · 100 pull-ups · 200 push-ups · 300 squats · 1-mi run · 20-lb vest).
// Tiers climb by fraction of each Murph target: 1/3 → 1/2 → 2/3 → full, with Half-Murph
// sitting at the halfway tier. `need` is checked automatically against prescribed workout
// totals and benchmark tests; `big` ones are once-in-a-lifetime and stay tap-to-mark.
export const MS_TIERS=[
  {label:"Foundation",items:[
    {id:"phase1",icon:"🧱",label:"Phase 1 complete",sub:"16 sessions",
     auto:s=>planPos()>=16, autoDate:s=>(s.completed[15]||s.completed[s.completed.length-1]||{}).date},
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
// --- renderers ---
export function renderCountdownPhase(){
  if(!$("murph-countdown")) return;
  const done=planPos(), p1=Math.min(done,16), pct=Math.round(p1/16*100);
  const md=murphDate();
  if(md){
    const days=Math.max(0,Math.ceil((md-new Date())/86400000));
    $("murph-countdown").innerHTML='<div class="countdown"><div class="big">'+days+'</div><div class="sub">days to Murph · '+fmtDate(iso(md))+'</div></div>';
  }else{
    $("murph-countdown").innerHTML='<div class="countdown"><div class="big">—</div><div class="sub">set your target date on the Inputs page</div></div>';
  }
  // Phases are earned by TESTED capability, not by sessions counted — fill each segment
  // accordingly and say what's still missing to reach the next one.
  const ph=phaseFor(state.benchmarks), gate=nextGate(state.benchmarks);
  let segs=""; for(let i=1;i<=4;i++){
    const w = i<ph ? 100 : i===ph ? (i===1?pct:35) : 0;
    segs+='<div class="phase-seg">'+(w?'<div class="fill" style="width:'+w+'%"></div>':'')+'</div>';
  }
  const LBL={pullups:"pull-ups",pushups:"push-ups",squats:"air squats",mile:"a 1-mile run"};
  let cap="Phase "+ph+" · "+PHASE_NAMES[ph];
  if(gate && gate.missing.length){
    cap += " — to unlock "+gate.name+", test: "+gate.missing.map(m=>
      m.k==="mile" ? "a 1-mile run" : (m.need+" "+(m.need===1?LBL[m.k].replace(/s$/,""):LBL[m.k])+" (best so far "+m.have+")")
    ).join(" · ")+".";
  } else if(!gate){ cap += " — final phase. Murph itself is on the menu."; }
  $("phase-bar").innerHTML='<div class="phase-seg-row">'+segs+'</div><div class="phase-labels"><span>Foundation</span><span>Build</span><span>Prep</span><span>Peak</span></div><div class="phase-caption">'+cap+'</div>';
}
// What a logged session prescribed toward Murph. Unknown days score zero rather than guessing.
export function dayTotals(entry){
  // Sessions logged from Phase 2+ carry the totals they were actually prescribed (frozen at log
  // time). Fall back to the Phase 1 table for sessions logged before entry.totals existed.
  if(entry && entry.totals) return entry.totals;
  const d=PHASE1[entry&&entry.day];
  return (d&&d.totals)||{pullups:0,pushups:0,squats:0,mile:0};
}
// A benchmark test is evidence too: a tested max of 100 pull-ups earns the 100 pull-up milestone.
// A recorded mile time means he ran a mile that day; a test can't show two.
export function benchTotals(b){
  return {pullups:b.pullups||0, pushups:b.pushups||0, squats:b.squats||0, mile:b.mileSec!=null?1:0};
}
export function meetsNeed(totals,need){ return Object.keys(need).every(k=>(totals[k]||0)>=need[k]); }
export const MS_ALL = MS_TIERS.reduce((a,t)=>a.concat(t.items),[]);
export function msById(id){ return MS_ALL.find(m=>m.id===id); }
// What the data says, ignoring any manual override: earliest date earned, or null.
export function msDerived(m){
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
export function msEarned(m){
  const ov=(state.milestones||{})[m.id];
  if(ov===false) return null;
  if(typeof ov==="string") return ov;
  return msDerived(m);
}
// True when the override disagrees with the data — worth flagging in the UI so a hand-ticked
// milestone is never mistaken for one Luke actually earned.
export function msOverridden(m){
  const ov=(state.milestones||{})[m.id];
  if(ov===undefined) return false;
  if(ov===false) return !!msDerived(m);
  return !m.big && !msDerived(m);
}
// Toggling only stores an override when it contradicts the data — so re-ticking something the
// data already supports drops the override and lets it track the data again.
export function msToggle(id){
  const m=msById(id); if(!m) return;
  if(!state.milestones) state.milestones={};
  const derived=msDerived(m);
  if(msEarned(m)){
    if(derived) state.milestones[id]=false; else delete state.milestones[id];
  }else{
    if(derived) delete state.milestones[id]; else state.milestones[id]=todayKey();
  }
}
export function renderMilestones(){
  const el=$("milestones"); if(!el) return;
  const vi=$("vest-inline"); if(vi) vi.textContent=vestWeight();   // vest load follows gender
  el.innerHTML=MS_TIERS.map(tier=>{
    const cards=tier.items.map(m=>{
      const date=msEarned(m), done=!!date, ov=msOverridden(m);
      const label=m.id==="murphvest" ? "Murph — "+vestWeight()+"-lb vest" : m.label;
      const sub = ov ? (done?'marked by hand':'cleared by hand')
                     : (done&&typeof date==="string" ? fmtDate(date) : m.sub);
      return '<div class="ms-card'+(done?' done':'')+' tap'+(ov?' ov':'')+(m.tgt?' tgt':'')+(m.big?' big':'')+'"'+
        ' role="button" tabindex="0" aria-pressed="'+(done?'true':'false')+'" data-id="'+m.id+'">'+
        '<div class="ms-check">'+(done?'✓':'')+'</div>'+
        '<div class="ms-body"><div class="ms-label">'+m.icon+' '+label+'</div>'+
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
export function renderConsistency(){
  if(!$("consistency-stats")) return;
  const counts={}; state.completed.forEach(c=>{ const t=weekStart(c.date).getTime(); counts[t]=(counts[t]||0)+1; });
  const best=Math.max(0,...Object.values(counts)), thisWk=counts[weekStart(new Date()).getTime()]||0;
  $("consistency-stats").innerHTML='<div class="stat-row">'+
    '<div class="stat"><div class="n">'+state.completed.length+'</div><div class="l">Total sessions</div></div>'+
    '<div class="stat"><div class="n">'+thisWk+'</div><div class="l">This week</div></div>'+
    '<div class="stat"><div class="n">'+best+'</div><div class="l">Best week</div></div></div>';
  svgBars($("weekly-chart"), weeklyCounts(8), {yLabel:"Sessions logged", xLabel:"Week beginning (Sunday)"});
}
export function renderDifficultyChart(){
  const el=$("difficulty-chart"); if(!el) return;
  const pts=state.completed.map(c=>({label:'#'+c.session,y:c.difficulty}));
  const avg=pts.length?pts.reduce((s,p)=>s+p.y,0)/pts.length:null;
  svgLine(el, pts, {yMin:1,yMax:10,avg,fmt:v=>Math.round(v*10)/10,
    yLabel:"Difficulty you rated (1–10)", xLabel:"Session",
    empty:"Log a couple more sessions to see your effort trend.",
    oneMore:"Log another session to see your effort trend."});
}
export function renderStrengthChart(){
  const ctr=$("strength-controls"); if(!ctr) return;
  ctr.innerHTML=WEIGHTED_LIFTS.map(n=>'<button data-l="'+n.replace(/"/g,'')+'" class="'+(n===selectedLift?'sel':'')+'">'+shortName(n)+'</button>').join("");
  ctr.querySelectorAll("button").forEach(b=>{ b.onclick=()=>{ selectedLift=b.getAttribute("data-l"); renderStrengthChart(); }; });
  const pts=state.completed.filter(c=>c.weights&&c.weights[selectedLift]!=null).map(c=>({label:fmtDate(c.date),y:c.weights[selectedLift]}));
  svgLine($("strength-chart"), pts, {unit:" lb",fmt:v=>Math.round(v),
    yLabel:"Working weight (lb)", xLabel:"Session date",
    empty:"No "+shortName(selectedLift)+" logged yet.",
    oneMore:"Log another session with this lift to see the trend."});
}
export const BENCH_METRICS=[
  {id:"pullups",label:"Pull-ups"},
  {id:"pushups",label:"Push-ups"},
  {id:"squats",label:"Squats"},
  {id:"mileSec",label:"1-mile",time:true}
];
export let benchMetric="pullups";
export function renderBenchmarks(){
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
  const lbl=met.label.toLowerCase();
  svgLine($("bench-chart"), pts, met.time
    ? {fmt:fmtMile, unit:"", yLabel:"1-mile time (mm:ss)", xLabel:"Test date",
       empty:"No mile time logged yet.",
       oneMore:"Log another mile time to see your pace trend — this line should fall over time."}
    : {fmt:v=>Math.round(v), yLabel:"Max "+lbl+" in one test", xLabel:"Test date",
       empty:"No "+lbl+" logged yet.",
       oneMore:"Log another test to see your "+lbl+" trend — this line should climb over time."});
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
export function renderProgressDash(){
  renderCountdownPhase();renderBenchmarks();renderMilestones();renderConsistency();renderDifficultyChart();renderStrengthChart();
}
