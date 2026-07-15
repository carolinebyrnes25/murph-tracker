import { NAMES } from "./config.js";

export const $=id=>document.getElementById(id);
export function diffColor(n){
  if(n<=3)return"#6E8B3E"; if(n<=5)return"#8a9a3a";
  if(n<=7)return"#C97A2C"; return"#BF4A2B";
}
export function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
export function todayKey(){return iso(new Date());}
export function fmtDate(isoStr){
  let d;
  if(/^\d{4}-\d{2}-\d{2}$/.test(isoStr)){const p=isoStr.split("-");d=new Date(+p[0],+p[1]-1,+p[2]);}
  else{d=new Date(isoStr);}
  return d.toLocaleDateString(undefined,{month:"short",day:"numeric"});
}
export function shortMD(key){const p=key.split("-");return parseInt(p[1])+"/"+parseInt(p[2]);}
export function nameFor(email){ return NAMES[email] || (email? email.split("@")[0] : "Athlete"); }
// Parse a "YYYY-MM-DD" input value into a local Date (matches fmtDate's parsing).
export function parseYMD(s){ if(!/^\d{4}-\d{2}-\d{2}$/.test(s||""))return null; const p=s.split("-"); return new Date(+p[0],+p[1]-1,+p[2]); }
/* ---- Coach's note: a trainer-style summary generated from the logged feedback ---- */
export function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
export function shortName(n){ return n.replace(/\s*\(.*?\)\s*$/,"").replace(/\s+or\s+.*$/,"").trim(); }
export function joinNames(arr){
  const ns=arr.map(x=>shortName(x.name));
  if(ns.length<=1) return ns[0]||"";
  if(ns.length===2) return ns[0]+" and "+ns[1];
  return ns.slice(0,-1).join(", ")+", and "+ns[ns.length-1];
}
// Accepts "m:ss"/"mm:ss", and also bare digits from the numeric keypad ("830" -> 8:30).
export function parseMile(s){
  s=String(s).trim();
  const m=s.match(/^(\d{1,2}):([0-5]\d)$/);
  if(m) return (+m[1])*60+(+m[2]);
  const d=s.replace(/\D/g,"");
  if(/^\d{3,4}$/.test(d)){ const sec=+d.slice(-2), min=+d.slice(0,-2); if(sec<60) return min*60+sec; }
  return null;
}
// Numeric keypad has no colon, so insert it as they type: "830" displays as "8:30".
export function formatMileField(v){ const d=String(v).replace(/\D/g,"").slice(0,4); return d.length>2 ? d.slice(0,-2)+":"+d.slice(-2) : d; }
export function fmtMile(sec){ if(sec==null) return "—"; const m=Math.floor(sec/60), s=Math.round(sec%60); return m+":"+String(s).padStart(2,"0"); }
