// ---- Firebase config (public identifiers, safe to ship) ----
export const firebaseConfig = {
  apiKey: "AIzaSyDBnuhes0kYuy2zfe8oojK9WSxg_PORqEY",
  authDomain: "murph-tracker-c94db.firebaseapp.com",
  projectId: "murph-tracker-c94db",
  storageBucket: "murph-tracker-c94db.firebasestorage.app",
  messagingSenderId: "287760042875",
  appId: "1:287760042875:web:db445367dda2c1a5a10bde"
};
// ---- Who's allowed in, and their display names ----
// Open sign-up: anyone with a Google account gets their own tracker. Privacy is enforced by the
// Firestore rules (each uid can only touch users/{their-own-uid}) — not by anything in this file.
export const HUSBAND_EMAIL = "luke.f.byrnes@gmail.com";
export const CAROLINE_EMAIL = "carolinebyrnes25@gmail.com";
export const NAMES = { [CAROLINE_EMAIL]:"Caroline", [HUSBAND_EMAIL]:"Luke" };
export const PHASE1_SESSIONS=16;
export const CREATINE_G=5;
export const SHAKE_G=48;   // one protein shake = 48 g
export const CACHE_KEY="murph:cache";      // local mirror, keyed per-uid below
export const LEGACY_KEY="murph:state";     // pre-cloud single-user data to migrate
// DEV/test mode: ANY host that isn't the real production URL runs offline of Firebase —
// no sign-in, isolated local storage, never writes to Firestore. Covers localhost, file://,
// and every preview host. ?prod=1 forces the real login (to test it); ?dev=1 forces test mode.
export const PROD_HOST="carolinebyrnes25.github.io";
export const _q=new URLSearchParams(location.search);
export const DEV = _q.get("prod")==="1" ? false
          : _q.get("dev")==="1" ? true
          : location.hostname!==PROD_HOST;
export const DEV_KEY="murph:dev";
// FCM Web Push public (VAPID) key — safe to ship. Used to register a device for reminders.
export const VAPID_KEY="BOYYZpjg9iA3zHQ08dAXpV1wzz9aGH_ytLLcSYr0mX3v_UrXmdyR21WKk9EFwo_msCKtJjVPM4H-mMoTVkGrpVY";
// The full road to Murph-ready: 4 phases × 16 sessions. Only Phase 1 is built today;
// this is the pacing horizon and can be tuned as later phases are authored.
export const PROGRAM_SESSIONS=64;
/* --- Benchmark tests (max reps + mile time vs Murph targets) --- */
export const MURPH_TARGETS={pullups:100,pushups:200,squats:300};
