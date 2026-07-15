import { CREATINE_G, SHAKE_G } from "./config.js";
import { $, fmtDate, iso, shortMD, todayKey } from "./util.js";
import { cleanupDay, proteinGoal, save, state } from "./store.js";

export function renderSupps(){
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
