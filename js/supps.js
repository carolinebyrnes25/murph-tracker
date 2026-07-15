import { CREATINE_G, SHAKE_G } from "./config.js";
import { $, fmtDate, iso, shortMD, todayKey } from "./util.js";
import { cleanupDay, proteinGoal, save, state } from "./store.js";

// Which day the toggles write to. null = today. Tapping a cell in the 7-day strip selects that
// day so a missed shake/dose can be filled in after the fact; only the last 7 days are offered,
// and never a future date.
let selectedDay = null;
function activeDay(){ return selectedDay || todayKey(); }
function daysAgo(k){
  const a=new Date(k+"T12:00:00"), b=new Date(todayKey()+"T12:00:00");
  return Math.round((b-a)/86400000);
}

export function renderSupps(){
  const tk=activeDay();
  const isToday=tk===todayKey();
  // a stale selection (e.g. tab left open past midnight) would fall off the strip — reset it
  if(!isToday && daysAgo(tk)>6){ selectedDay=null; return renderSupps(); }
  const t=state.supps[tk]||{};
  const n=daysAgo(tk);
  $("supp-today").innerHTML = isToday
    ? "Today · "+fmtDate(tk)
    : fmtDate(tk)+" · <b>"+(n===1?"yesterday":n+" days ago")+"</b> <button class=\"day-back\" id=\"supp-back\">back to today</button>";
  $("supp-hint").textContent = isToday
    ? "Forgot to log one? Tap any day in the strip below to fill it in."
    : "Editing an earlier day — these toggles now save to "+fmtDate(tk)+".";
  const btn=$("creatine-btn");
  if(t.creatine){btn.classList.add("on");btn.textContent="✓ Taken ("+t.creatine+"g)";}
  else{btn.classList.remove("on");btn.textContent="Tap when taken (5g)";}
  const pbtn=$("protein-btn"); const hadShake=t.protein!=null;
  if(hadShake){pbtn.classList.add("on");pbtn.textContent="✓ Shake had ("+SHAKE_G+"g)";}
  else{pbtn.classList.remove("on");pbtn.textContent="Tap when you've had a shake ("+SHAKE_G+"g)";}
  // Protein caption. The button already says "tap when you've had a shake" — don't repeat it here;
  // this line is only for the daily target and what's been logged.
  const goal=proteinGoal(); const cap=$("protein-caption");
  const when=isToday?"today":fmtDate(tk);
  cap.className="supp-caption"+(hadShake?" hit":"");
  if(hadShake){
    cap.innerHTML="Shake logged "+when+" — <b>"+SHAKE_G+" g protein</b>"+(goal?" · daily target ~"+goal+" g":"");
  }else if(goal){
    cap.innerHTML="Daily target ~<b>"+goal+" g</b> protein.";
  }else{
    cap.innerHTML="Add your weight on the <b>Inputs</b> page to get a daily protein target.";
  }
  const strip=$("supp-strip");const cells=[];const now=new Date();
  for(let i=6;i>=0;i--){const d=new Date(now);d.setDate(now.getDate()-i);const k=iso(d);const s=state.supps[k]||{};
    const hit=s.creatine||s.protein!=null;
    const pShake=s.protein!=null;
    const sel=k===tk?' sel':'';
    cells.push('<div class="supp-day'+sel+'" data-k="'+k+'" role="button" tabindex="0" title="'+fmtDate(k)+'"><div class="dot'+(hit?' hit':'')+'"><span class="c">'+(s.creatine?'C✓':'·')+'</span><span class="p"'+(pShake?' style="color:var(--olive-2);font-weight:600"':'')+'>'+(pShake?'🥤':'')+'</span></div><div class="lbl">'+shortMD(k)+'</div></div>');
  }
  strip.innerHTML=cells.join("");
  const pick=k=>{ selectedDay = (k===todayKey()) ? null : k; renderSupps(); };
  strip.querySelectorAll(".supp-day").forEach(cell=>{
    cell.onclick=()=>pick(cell.dataset.k);
    cell.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); pick(cell.dataset.k); } };
  });
  const back=$("supp-back");
  if(back) back.onclick=()=>{ selectedDay=null; renderSupps(); };
}
$("creatine-btn").onclick=async()=>{
  const tk=activeDay(); state.supps[tk]=state.supps[tk]||{};
  if(state.supps[tk].creatine){delete state.supps[tk].creatine;}
  else{state.supps[tk].creatine=CREATINE_G;}
  cleanupDay(tk); renderSupps(); await save();
};
$("protein-btn").onclick=async()=>{
  const tk=activeDay(); state.supps[tk]=state.supps[tk]||{};
  if(state.supps[tk].protein!=null){delete state.supps[tk].protein;}
  else{state.supps[tk].protein=SHAKE_G;}
  cleanupDay(tk); renderSupps(); await save();
};
