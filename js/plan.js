// ---- Plan data ----
// `totals` = what the day prescribes toward Murph, and it drives the milestone auto-checks.
// Only the real movement counts: band-assisted pull-ups, incline/knee push-ups and lat pulldowns
// build toward Murph but aren't Murph reps, so they score 0. Weighted squats aren't air squats.
// `mile` = continuous 1-mile runs prescribed (jog/walk intervals aren't a mile).
// Phase 1 tops out at 50 air squats and no unassisted pull-ups or push-ups — by design, nothing
// here trips a milestone. Give later phases the same `totals` and their milestones check themselves.
export const PHASE1 = {
  A:{nm:"Pull + Run base",tag:"Pulling pattern · easy running",totals:{pullups:0,pushups:0,squats:0,mile:0},ex:[
    {name:"Dead hang",dose:"3 × 15–20s",what:"Hang from a pull-up bar, arms straight, feet off the floor."},
    {name:"Inverted row (barbell/TRX)",dose:"3 × 8–10",what:"Lie under a bar and pull your chest up to it, body straight.",note:"More upright = easier · more horizontal = harder"},
    {name:"Lat pulldown or assisted pull-up",dose:"3 × 8–10",what:"Machine version of a pull-up — same muscles, at a weight you pick.",w:{def:100,step:10}},
    {name:"Incline push-ups",dose:"3 × 8–12",what:"Push-ups with your hands up on a bench or bar — easier than the floor."},
    {name:"Run / walk",dose:"15 min",what:"Easy jogging broken up with walking to build your running base.",note:"Jog 1 min / walk 2 min"}]},
  B:{nm:"Squat + Intervals",tag:"Legs · interval running",totals:{pullups:0,pushups:0,squats:45,mile:0},ex:[
    {name:"Goblet squat",dose:"3 × 10",what:"Squat while holding one dumbbell against your chest.",w:{def:25,step:5}},
    {name:"Bodyweight squats",dose:"3 × 15",what:"Plain air squats, no weight — the exact squat Murph asks for.",note:"Hip crease below the knee"},
    {name:"Walking lunges",dose:"2 × 10 / leg",what:"Step forward into a lunge, alternating legs as you walk."},
    {name:"DB Romanian deadlift",dose:"2 × 10",what:"Hinge at the hips, sliding dumbbells down your legs — hamstrings and back.",w:{def:30,step:5}},
    {name:"Run / walk intervals",dose:"12–15 min",what:"Short jog/walk repeats to build running fitness.",note:"Jog 1 min / walk 1–2 min"},
    {name:"Plank",dose:"3 × 20–30s",what:"Hold a straight body on forearms and toes — core work."}]},
  C:{nm:"Push + Pull",tag:"Pressing · more pulling volume",totals:{pullups:0,pushups:0,squats:0,mile:0},ex:[
    {name:"DB bench press (or incline push-ups)",dose:"3 × 8–10",what:"Lying on a bench, press dumbbells up off your chest.",w:{def:30,step:5}},
    {name:"Band-assisted pull-ups",dose:"3 × 5–8",what:"Pull-ups with a band under your feet carrying some of your weight.",note:"A band that lets you do clean reps"},
    {name:"Inverted row (barbell/TRX)",dose:"3 × 10",what:"Lie under a bar and pull your chest up to it, body straight."},
    {name:"Incline / knee push-ups",dose:"3 × clean",what:"Push-ups made easier — hands raised, or knees on the floor.",note:"Leave 2 in the tank"},
    {name:"Overhead DB press",dose:"2 × 10",what:"Press dumbbells from your shoulders straight overhead.",w:{def:20,step:5}}]},
  D:{nm:"Mixed conditioning",tag:"A first taste of Murph",totals:{pullups:0,pushups:0,squats:50,mile:0},ex:[
    {name:"Easy jog",dose:"5 min",what:"Gentle warm-up jog to loosen up."},
    {name:"Circuit — unhurried",dose:"5 rounds",what:"Murph's three moves in miniature — repeat the round, no rush.",note:"2 assisted pull-ups · 5 incline push-ups · 10 squats"},
    {name:"Continuous jog",dose:"0.5 → 0.75 mi",what:"Keep jogging without stopping for as long as you can.",note:"Walk when needed; nudge the distance up"}]}
};
export const ORDER=["A","B","C","D"];
export function weightedForDay(day){ return PHASE1[day].ex.filter(e=>e.w); }
/* ===================== Progress dashboard ===================== */
export const WEIGHTED_LIFTS=["Lat pulldown or assisted pull-up","Goblet squat","DB Romanian deadlift","DB bench press (or incline push-ups)","Overhead DB press"];
