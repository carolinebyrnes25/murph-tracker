import { state } from "./store.js";

// --- generic SVG chart builders (single-series, app palette) ---
export function svgLine(el, pts, opts){
  opts=opts||{};
  if(!pts.length){ el.innerHTML='<p class="chart-empty">'+(opts.empty||"Nothing logged yet.")+'</p>'; return; }
  // One point can't make a line, but it IS the user's data — show the actual value rather than a
  // generic "log more" message. Every metric showing that message looked like a broken chart.
  if(pts.length===1){
    const fmt1=opts.fmt||(v=>Math.round(v));
    el.innerHTML='<div class="one-pt"><div class="one-pt-v">'+fmt1(pts[0].y)+(opts.unit||'')+'</div>'+
      '<div class="one-pt-l">'+pts[0].label+' · first result</div>'+
      '<div class="one-pt-n">'+(opts.oneMore||"Log another to see a trend line.")+'</div></div>';
    return;
  }
  // L/B leave room for the axis titles; without them a reader has to guess what's being measured.
  const W=520,H=214,L=56,R=14,T=14,B=44;
  const ys=pts.map(p=>p.y);
  let lo=opts.yMin!=null?opts.yMin:Math.min(...ys), hi=opts.yMax!=null?opts.yMax:Math.max(...ys);
  if(lo===hi){lo-=1;hi+=1;} else if(opts.yMin==null&&opts.yMax==null){const pad=(hi-lo)*0.15;lo-=pad;hi+=pad;}
  const x=i=>L+(W-L-R)*(i/(pts.length-1));
  const y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo));
  const line="M"+pts.map((p,i)=>x(i).toFixed(1)+","+y(p.y).toFixed(1)).join(" L");
  const area="M"+x(0).toFixed(1)+","+(H-B)+" L"+pts.map((p,i)=>x(i).toFixed(1)+","+y(p.y).toFixed(1)).join(" L")+" L"+x(pts.length-1).toFixed(1)+","+(H-B)+" Z";
  const fmt=opts.fmt||(v=>Math.round(v));
  const dots=pts.map((p,i)=>'<circle cx="'+x(i).toFixed(1)+'" cy="'+y(p.y).toFixed(1)+'" r="3" fill="var(--accent)"><title>'+p.label+': '+fmt(p.y)+(opts.unit||'')+'</title></circle>').join("");
  let avg="";
  if(opts.avg!=null){ const ay=y(opts.avg); avg='<line x1="'+L+'" y1="'+ay.toFixed(1)+'" x2="'+(W-R)+'" y2="'+ay.toFixed(1)+'" class="avgline"/><text x="'+(W-R)+'" y="'+(ay-4).toFixed(1)+'" text-anchor="end" class="ax">avg '+fmt(opts.avg)+'</text>'; }
  const midY=T+(H-T-B)/2, midX=L+(W-L-R)/2;
  const yTitle=opts.yLabel ? '<text transform="rotate(-90 14 '+midY.toFixed(1)+')" x="14" y="'+midY.toFixed(1)+'" text-anchor="middle" class="axt">'+opts.yLabel+'</text>' : '';
  const xTitle=opts.xLabel ? '<text x="'+midX.toFixed(1)+'" y="'+(H-2)+'" text-anchor="middle" class="axt">'+opts.xLabel+'</text>' : '';
  el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" class="wchart" role="img">'+
    '<line x1="'+L+'" y1="'+(H-B)+'" x2="'+(W-R)+'" y2="'+(H-B)+'" class="grid"/>'+
    '<line x1="'+L+'" y1="'+T+'" x2="'+L+'" y2="'+(H-B)+'" class="grid"/>'+
    '<path d="'+area+'" class="warea"/><path d="'+line+'" class="wline"/>'+avg+dots+
    '<text x="'+(L-6)+'" y="'+(T+4)+'" text-anchor="end" class="ax">'+fmt(hi)+'</text>'+
    '<text x="'+(L-6)+'" y="'+(H-B)+'" text-anchor="end" class="ax">'+fmt(lo)+'</text>'+
    '<text x="'+L+'" y="'+(H-B+14)+'" text-anchor="start" class="ax">'+pts[0].label+'</text>'+
    '<text x="'+(W-R)+'" y="'+(H-B+14)+'" text-anchor="end" class="ax">'+pts[pts.length-1].label+'</text>'+
    yTitle+xTitle+
  '</svg>';
}
export function svgBars(el, data, opts){
  opts=opts||{};
  if(!data.length){ el.innerHTML='<p class="chart-empty">No sessions logged yet.</p>'; return; }
  const W=520,H=196,L=46,R=12,T=16,B=44;
  const hi=Math.max(1, ...data.map(d=>d.value));
  const n=data.length, slot=(W-L-R)/n, bw=slot*0.6;
  const y=v=>T+(H-T-B)*(1-v/hi);
  const bars=data.map((d,i)=>{
    const cx=L+slot*i+slot/2, x=cx-bw/2, yy=y(d.value), h=(H-B)-yy;
    const val=d.value>0?'<text x="'+cx.toFixed(1)+'" y="'+(yy-5).toFixed(1)+'" text-anchor="middle" class="barval">'+d.value+'</text>':'';
    return '<rect x="'+x.toFixed(1)+'" y="'+yy.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(0,h).toFixed(1)+'" rx="4" class="cbar"><title>Week of '+d.label+': '+d.value+' session'+(d.value===1?'':'s')+'</title></rect>'+val+
      '<text x="'+cx.toFixed(1)+'" y="'+(H-B+14)+'" text-anchor="middle" class="ax">'+d.label+'</text>';
  }).join("");
  const midY=T+(H-T-B)/2, midX=L+(W-L-R)/2;
  const yTitle=opts.yLabel ? '<text transform="rotate(-90 14 '+midY.toFixed(1)+')" x="14" y="'+midY.toFixed(1)+'" text-anchor="middle" class="axt">'+opts.yLabel+'</text>' : '';
  const xTitle=opts.xLabel ? '<text x="'+midX.toFixed(1)+'" y="'+(H-2)+'" text-anchor="middle" class="axt">'+opts.xLabel+'</text>' : '';
  // y ticks: 0 and the max, so the bar heights are readable as a count
  const ticks='<text x="'+(L-6)+'" y="'+(T+4)+'" text-anchor="end" class="ax">'+hi+'</text>'+
              '<text x="'+(L-6)+'" y="'+(H-B)+'" text-anchor="end" class="ax">0</text>';
  el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" class="wchart" role="img">'+
    '<line x1="'+L+'" y1="'+(H-B)+'" x2="'+(W-R)+'" y2="'+(H-B)+'" class="grid"/>'+
    '<line x1="'+L+'" y1="'+T+'" x2="'+L+'" y2="'+(H-B)+'" class="grid"/>'+
    bars+ticks+yTitle+xTitle+'</svg>';
}
// --- data helpers ---
// Monday-start weeks: (getDay()+6)%7 is days-since-Monday (Sun=6, Mon=0 … Sat=5), so subtracting it lands on Monday.
export function weekStart(d){ const x=new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate()-((x.getDay()+6)%7)); return x; } // Monday
export function weeklyCounts(maxN){
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
