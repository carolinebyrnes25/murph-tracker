// ---- Plan data ----
// Murph = 1-mi run · 100 pull-ups · 200 push-ups · 300 squats · 1-mi run (+ vest), ratio 1:2:3.
//
// Phase 1 is a fixed foundation block. Phases 2-4 are GENERATED from the athlete's latest
// benchmark test, because the right dose of "do some pull-ups" depends entirely on whether he can
// do 1 or 40. Every prescription and its `totals` are computed from the same numbers below, so the
// two can never drift apart — `totals` is what drives milestone auto-checks, and a totals value
// that didn't match the actual prescription would tick milestones for work he never did.
//
// `totals` counts REAL Murph movements only: assisted pull-ups, incline push-ups, weighted squats
// and jog/walk intervals build toward Murph but are not Murph reps, so they score 0.
import { MURPH_TARGETS } from "./config.js";

/* ---------------- Phase 1 · Foundation (fixed) ----------------
   Scaled movements only — no unassisted pull-ups, no floor push-ups, no continuous mile. That is
   deliberate for a true beginner, and it is why nothing here trips a milestone. */
export const PHASE1 = {
  A:{nm:"Pull + Run base",tag:"Pulling pattern · easy running",totals:{pullups:0,pushups:0,squats:0,mile:0},ex:[
    {name:"Dead hang",dose:"3 × 15–20s",what:"Hang from a pull-up bar, arms straight, feet off the floor."},
    {name:"Inverted row (barbell/TRX)",dose:"3 × 8–10",what:"Lie under a bar and pull your chest up to it, body straight.",note:"More upright = easier · more horizontal = harder"},
    {name:"Lat pulldown or assisted pull-up",dose:"3 × 8–10",what:"Machine version of a pull-up — same muscles, at a weight you pick.",w:{def:100,step:10,per:"total"}},
    {name:"Incline push-ups",dose:"3 × 8–12",what:"Push-ups with your hands up on a bench or bar — easier than the floor."},
    {name:"Run / walk",dose:"15 min",what:"Easy jogging broken up with walking to build your running base.",note:"Jog 1 min / walk 2 min"}]},
  B:{nm:"Squat + Intervals",tag:"Legs · interval running",totals:{pullups:0,pushups:0,squats:45,mile:0},ex:[
    {name:"Goblet squat",dose:"3 × 10",what:"Squat while holding one dumbbell against your chest.",w:{def:25,step:5,per:"total"}},
    {name:"Bodyweight squats",dose:"3 × 15",what:"Plain air squats, no weight — the exact squat Murph asks for.",note:"Hip crease below the knee"},
    {name:"Walking lunges",dose:"2 × 10 / leg",what:"Step forward into a lunge, alternating legs as you walk."},
    {name:"DB Romanian deadlift",dose:"2 × 10",what:"Hinge at the hips, sliding dumbbells down your legs — hamstrings and back.",w:{def:30,step:5,per:"each"}},
    {name:"Run / walk intervals",dose:"12–15 min",what:"Short jog/walk repeats to build running fitness.",note:"Jog 1 min / walk 1–2 min"},
    {name:"Plank",dose:"3 × 20–30s",what:"Hold a straight body on forearms and toes — core work."}]},
  C:{nm:"Push + Pull",tag:"Pressing · more pulling volume",totals:{pullups:0,pushups:0,squats:0,mile:0},ex:[
    {name:"DB bench press (or incline push-ups)",dose:"3 × 8–10",what:"Lying on a bench, press dumbbells up off your chest.",w:{def:30,step:5,per:"each"}},
    {name:"Band-assisted pull-ups",dose:"3 × 5–8",what:"Pull-ups with a band under your feet carrying some of your weight.",note:"A band that lets you do clean reps"},
    {name:"Inverted row (barbell/TRX)",dose:"3 × 10",what:"Lie under a bar and pull your chest up to it, body straight."},
    {name:"Incline / knee push-ups",dose:"3 × clean",what:"Push-ups made easier — hands raised, or knees on the floor.",note:"Leave 2 in the tank"},
    {name:"Overhead DB press",dose:"2 × 10",what:"Press dumbbells from your shoulders straight overhead.",w:{def:20,step:5,per:"each"}}]},
  D:{nm:"Mixed conditioning",tag:"A first taste of Murph",totals:{pullups:0,pushups:0,squats:50,mile:0},ex:[
    {name:"Easy jog",dose:"5 min",what:"Gentle warm-up jog to loosen up."},
    {name:"Circuit — unhurried",dose:"5 rounds",what:"Murph's three moves in miniature — repeat the round, no rush.",note:"2 assisted pull-ups · 5 incline push-ups · 10 squats"},
    {name:"Continuous jog",dose:"0.5 → 0.75 mi",what:"Keep jogging without stopping for as long as you can.",note:"Walk when needed; nudge the distance up"}]}
};
export const ORDER=["A","B","C","D"];

/* ---------------- Core finisher (every session) ----------------
   A 3-minute abs block tacked onto the end of every workout — extra core work on top of the
   prescription, never replacing any of it. It builds toward a stronger midline (and a six-pack)
   without touching Murph `totals`: abs aren't a Murph movement, so this scores 0 and never trips a
   milestone. No `w` field, so it also stays out of the weight-feedback UI. */
export const ABS_FINISHER={name:"Abs finisher",dose:"3 min",
  what:"Three straight minutes of core to close out the session — plank, hollow holds, leg raises, bicycle crunches. Mix them however you like; keep moving the whole time.",
  note:"Every session, on top of the work above — this is what builds the six-pack by race day."};

/* ---------------- Capability gates ----------------
   Phase advancement is earned by TESTED capability, never by sessions counted. Someone who has
   logged 40 foundation sessions but still can't do a pull-up is not ready for Murph rounds, and
   the old session-count model would have marched him there anyway. */
export const PHASE_GATES = [
  // phase 2 — can perform one real rep of each movement and run a continuous mile
  {phase:2, name:"Build",  need:{pullups:1,  pushups:10,  squats:50,  mile:1}},
  // phase 3 — a third of Murph in each movement
  {phase:3, name:"Prep",   need:{pullups:33, pushups:66,  squats:100, mile:1}},
  // phase 4 — half of Murph in each movement
  {phase:4, name:"Peak",   need:{pullups:50, pushups:100, squats:150, mile:1}}
];
export const PHASE_NAMES = {1:"Foundation", 2:"Build", 3:"Prep", 4:"Peak"};

// Latest benchmark as a plain capability object. mile:1 means a mile has actually been run.
export function capability(benchmarks){
  const list=(benchmarks||[]).slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  const c={pullups:0,pushups:0,squats:0,mile:0};
  // take the BEST result ever for each movement, not just the latest — capability doesn't vanish
  // because the most recent test skipped a movement.
  list.forEach(b=>{
    if(b.pullups>c.pullups) c.pullups=b.pullups;
    if(b.pushups>c.pushups) c.pushups=b.pushups;
    if(b.squats>c.squats)   c.squats=b.squats;
    if(b.mileSec!=null)     c.mile=1;
  });
  return c;
}
export function phaseFor(benchmarks){
  const c=capability(benchmarks);
  let ph=1;
  PHASE_GATES.forEach(g=>{ if(Object.keys(g.need).every(k=>c[k]>=g.need[k])) ph=g.phase; });
  return ph;
}
// What's still missing to reach the next phase — so the app can say why he's held back.
export function nextGate(benchmarks){
  const ph=phaseFor(benchmarks), g=PHASE_GATES.find(x=>x.phase===ph+1);
  if(!g) return null;
  const c=capability(benchmarks);
  const missing=Object.keys(g.need).filter(k=>c[k]<g.need[k])
    .map(k=>({k, have:c[k], need:g.need[k]}));
  return {phase:g.phase, name:g.name, missing};
}
// Readiness for Murph itself: fraction of each target actually demonstrated in a test.
export function readiness(benchmarks){
  const c=capability(benchmarks);
  const parts={
    pullups:Math.min(1, c.pullups/MURPH_TARGETS.pullups),
    pushups:Math.min(1, c.pushups/MURPH_TARGETS.pushups),
    squats: Math.min(1, c.squats /MURPH_TARGETS.squats),
    mile:   c.mile?1:0
  };
  // The weakest link decides — Murph is not an average, you have to do all of it.
  const pct=Math.min(...Object.values(parts));
  return {parts, pct, weakest:Object.keys(parts).reduce((a,b)=>parts[a]<=parts[b]?a:b)};
}

/* ---------------- Phases 2-4 · generated from the benchmark ---------------- */
const atLeast=(v,n)=>Math.max(n, Math.round(v));
// Working set size: a fraction of tested max, so volume is hard but repeatable rather than maximal.
const work=(max,frac,min)=>Math.max(min||1, Math.round(max*frac));

function runLine(){ return {name:"Continuous run",dose:"1 mile",what:"Run a full mile without stopping — Murph opens and closes with this."}; }

// Phase 2 · Build — first real reps, sets well inside his max so volume can accumulate.
function phase2(c){
  const pu=work(c.pullups,0.4), pp=work(c.pushups,0.4), sq=work(c.squats,0.4,10);
  const D={
    A:{nm:"Pull volume + run",tag:"Real pull-ups · a full mile",ex:[
        runLine(),
        {name:"Pull-ups",dose:"5 × "+pu,what:"Unassisted, from a dead hang. Rest as long as you need between sets.",note:pu<3?"Singles are fine — add a negative (slow lower) after each":""},
        {name:"Inverted row",dose:"3 × 10",what:"Lie under a bar and pull your chest up to it — extra pulling volume."},
        {name:"Push-ups",dose:"4 × "+pp,what:"On the floor, chest to the deck."}],
       totals:{pullups:5*pu, pushups:4*pp, squats:0, mile:1}},
    B:{nm:"Squat volume + intervals",tag:"Air-squat volume",ex:[
        {name:"Air squats",dose:"5 × "+sq,what:"Plain air squats — hip crease below the knee, exactly as Murph counts them."},
        {name:"Walking lunges",dose:"3 × 12 / leg",what:"Step forward into a lunge, alternating as you walk."},
        {name:"Run intervals",dose:"4 × 400m",what:"Hard-ish 400s with a walk back — builds the engine for the two miles."}],
       totals:{pullups:0, pushups:0, squats:5*sq, mile:0}},
    C:{nm:"Push volume + pull",tag:"Pressing · more pulling",ex:[
        {name:"Push-ups",dose:"6 × "+pp,what:"On the floor. Stop each set 1-2 reps short of failure."},
        {name:"Pull-ups",dose:"4 × "+pu,what:"Unassisted. Quality over speed."},
        {name:"DB bench press",dose:"3 × 8–10",what:"Lying on a bench, press dumbbells up off your chest.",w:{def:30,step:5,per:"each"}},
        {name:"Overhead DB press",dose:"2 × 10",what:"Press dumbbells from your shoulders straight overhead.",w:{def:20,step:5,per:"each"}}],
       totals:{pullups:4*pu, pushups:6*pp, squats:0, mile:0}},
    D:{nm:"Murph rounds · quarter",tag:"The real thing, scaled",ex:[
        runLine(),
        {name:"Rounds of 5 / 10 / 15",dose:"5 rounds",what:"5 pull-ups · 10 push-ups · 15 air squats. Murph's exact partition, a quarter of the volume.",note:"Break the reps up however you like — assisted pull-ups only if you must"},
        runLine()],
       totals:{pullups:25, pushups:50, squats:75, mile:2}}
  };
  return D;
}
// Phase 3 · Prep — Murph's partition at half volume, then more.
function phase3(c){
  const pp=work(c.pushups,0.5), sq=work(c.squats,0.5,20), pu=work(c.pullups,0.5);
  return {
    A:{nm:"Murph rounds · half",tag:"10 rounds of 5/10/15",ex:[
        runLine(),
        {name:"Rounds of 5 / 10 / 15",dose:"10 rounds",what:"5 pull-ups · 10 push-ups · 15 air squats — half of Murph's total volume.",note:"Partition the reps; keep moving"},
        runLine()],
       totals:{pullups:50, pushups:100, squats:150, mile:2}},
    B:{nm:"Squat + run engine",tag:"Volume + pace",ex:[
        {name:"Air squats",dose:"6 × "+sq,what:"Unbroken sets, below parallel."},
        {name:"Run",dose:"1.5 miles",what:"Continuous, steady — you need to run two miles tired.",note:"Comfortable pace; finish strong"}],
       totals:{pullups:0, pushups:0, squats:6*sq, mile:1}},
    C:{nm:"Pull + push volume",tag:"The two limiters",ex:[
        {name:"Pull-ups",dose:"8 × "+pu,what:"Unassisted. These are the limiter in Murph — earn them here."},
        {name:"Push-ups",dose:"8 × "+pp,what:"On the floor, chest to the deck."},
        {name:"Inverted row",dose:"3 × 12",what:"Extra pulling volume once the pull-ups are done."}],
       totals:{pullups:8*pu, pushups:8*pp, squats:0, mile:0}},
    D:{nm:"Two-mile day",tag:"Run both ends",ex:[
        runLine(),
        {name:"Rounds of 5 / 10 / 15",dose:"5 rounds",what:"A quarter of Murph, sandwiched between the runs.",note:"The point is running the second mile tired"},
        runLine()],
       totals:{pullups:25, pushups:50, squats:75, mile:2}}
  };
}
// Phase 4 · Peak — full Murph, then the vest.
function phase4(c, vest){
  const pu=work(c.pullups,0.5), pp=work(c.pushups,0.5);
  return {
    A:{nm:"Murph · full",tag:"The whole thing",ex:[
        runLine(),
        {name:"Rounds of 5 / 10 / 15",dose:"20 rounds",what:"100 pull-ups · 200 push-ups · 300 air squats — the full Murph partition.",note:"Partition how you like; keep the runs honest"},
        runLine()],
       totals:{pullups:100, pushups:200, squats:300, mile:2}},
    B:{nm:"Recovery + technique",tag:"Move, don't grind",ex:[
        {name:"Easy run",dose:"1 mile",what:"Conversational pace — flush the legs out."},
        {name:"Air squats",dose:"4 × 25",what:"Smooth and unbroken."},
        {name:"Pull-ups",dose:"4 × "+pu,what:"Crisp reps, well short of failure."}],
       totals:{pullups:4*pu, pushups:0, squats:100, mile:1}},
    C:{nm:"Vest work",tag:vest+"-lb vest",ex:[
        {name:"Vest run",dose:"1 mile",what:"Wear the "+vest+"-lb vest. It changes everything — practise it."},
        {name:"Rounds of 5 / 10 / 15 (vest)",dose:"10 rounds",what:"Half Murph wearing the vest.",note:"Drop the vest rather than fail reps"}],
       totals:{pullups:50, pushups:100, squats:150, mile:1}},
    D:{nm:"Murph · vest",tag:"Race rehearsal",ex:[
        {name:"Vest run",dose:"1 mile",what:"Wearing the "+vest+"-lb vest."},
        {name:"Rounds of 5 / 10 / 15 (vest)",dose:"20 rounds",what:"Full Murph in the vest — the actual event."},
        {name:"Vest run",dose:"1 mile",what:"Wearing the vest. This is the one that hurts."}],
       totals:{pullups:100, pushups:200, squats:300, mile:2}}
  };
}

// The workout for a plan position, given tested capability. `vest` comes from the athlete's profile.
export function workoutFor(pos, benchmarks, vest){
  const ph=phaseFor(benchmarks);
  const c=capability(benchmarks);
  const days = ph===1 ? PHASE1 : ph===2 ? phase2(c) : ph===3 ? phase3(c) : phase4(c, vest||20);
  const day=ORDER[pos%4];
  const w=days[day];
  // Append the 3-min abs finisher to every day. New array (not a mutation of the shared PHASE1
  // const), and `totals` is left untouched so milestone auto-checks are unaffected.
  return {...w, ex:[...w.ex, ABS_FINISHER], day, phase:ph, phaseName:PHASE_NAMES[ph]};
}
export function weightedForDay(day, benchmarks, vest){
  return (workoutFor(ORDER.indexOf(day), benchmarks, vest).ex||[]).filter(e=>e.w);
}
// How to read a weighted lift's number: "each hand" for two-dumbbell lifts, "total" for a
// single implement (goblet squat) or a machine stack (lat pulldown). Shown next to the weight.
export function loadBasis(e){ return (e.w && e.w.per==="each") ? "each hand" : "total"; }
/* ===================== Progress dashboard ===================== */
export const WEIGHTED_LIFTS=["Lat pulldown or assisted pull-up","Goblet squat","DB Romanian deadlift","DB bench press (or incline push-ups)","Overhead DB press"];
