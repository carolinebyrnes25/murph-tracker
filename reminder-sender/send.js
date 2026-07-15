/* Workout-reminder sender. Runs on a schedule from GitHub Actions.
   Reads each user's reminderPrefs + program state from Firestore and sends a
   DYNAMIC push whose text reflects rest days, deloads, and weekly training load —
   sent once, on the first run at/after the user's chosen time each chosen day. */
const admin = require('firebase-admin');
const { DateTime } = require('luxon');

// Strip a possible UTF-8 BOM / stray whitespace the secret may carry, then parse.
const svcRaw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').replace(/^﻿/, '').trim();
const svc = JSON.parse(svcRaw);
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();
const messaging = admin.messaging();

const SITE = 'https://carolinebyrnes25.github.io/murph-tracker/';
const DRY = process.env.DRY_RUN === '1';
const ORDER = ['A', 'B', 'C', 'D'];
const DAYNAME = { A: 'Pull + Run base', B: 'Squat + Intervals', C: 'Push + Pull', D: 'Mixed conditioning' };

// Choose the reminder text from the user's actual program state.
function buildMessage(u, now, todayStr) {
  const completed = Array.isArray(u.completed) ? u.completed : [];
  const done = completed.length;
  const nextDay = ORDER[done % 4];
  const nextName = DAYNAME[nextDay] || ('Day ' + nextDay);
  const last = completed[done - 1];
  const trainedToday = last && last.date &&
    DateTime.fromISO(last.date).setZone(now.zoneName).toFormat('yyyy-LL-dd') === todayStr;
  const weekAgo = now.minus({ days: 7 });
  const last7 = completed.filter(c => c.date && DateTime.fromISO(c.date) >= weekAgo).length;
  const deload = !!(u.deload && u.deload.active);

  // 1) App explicitly flagged recovery (last session was maximal or hurt).
  if (u.recoveryDue) {
    return { title: 'Recovery day 🛌', body: 'Your last session was tough — take it easy today. A short walk, water, protein, and good sleep. Back at it tomorrow.' };
  }
  // 2) Already worked out today.
  if (trainedToday) {
    return { title: 'Nice work today 💪', body: 'You already trained — now recover. Food, water, and sleep are where the gains happen.' };
  }
  // 3) Already hit ~4 sessions this week (respect the 4x/week cadence even if reminders are daily).
  if (last7 >= 4) {
    return { title: 'Rest day earned 🙌', body: "You've hit 4 sessions in the last week — plenty. Take a rest day unless you're feeling fresh." };
  }
  // 4) Deload week — still train, but lighter.
  if (deload) {
    return { title: 'Deload — keep it light', body: `If you train today, go ~15% lighter and clean. Day ${nextDay} · ${nextName}.` };
  }
  // 5) Normal training nudge.
  return { title: 'Time to train 💪', body: `Day ${nextDay} · ${nextName} is up. Let's go.` };
}

(async () => {
  console.log((DRY ? '[DRY RUN] ' : '') + 'Run at ' + DateTime.now().setZone('America/New_York').toFormat('ccc yyyy-LL-dd HH:mm') + ' ET');
  const snap = await db.collection('users').get();
  console.log(`Scanning ${snap.size} user profile(s).`);
  const due = []; // { uid, tokens, message, day }

  for (const docSnap of snap.docs) {
    const u = docSnap.data();
    const p = u.reminderPrefs;
    const tokens = Array.isArray(u.fcmTokens) ? u.fcmTokens : [];
    if (p || tokens.length) {
      console.log(`profile ${docSnap.id.slice(0, 6)}… enabled=${!!(p && p.enabled)} days=${p && p.days ? JSON.stringify(p.days) : '-'} time=${p ? p.time : '-'} tz=${p ? p.tz : '-'} tokens=${tokens.length}`);
    }
    if (!p || !p.enabled || tokens.length === 0) continue;

    const tz = p.tz || 'America/New_York';
    const now = DateTime.now().setZone(tz);
    const jsDay = now.weekday % 7; // luxon Mon=1..Sun=7 -> 0=Sun..6=Sat
    const days = Array.isArray(p.days) ? p.days : [];
    if (!days.includes(jsDay)) continue;

    const [ph, pm] = String(p.time || '07:00').split(':').map(Number);
    const userMin = ph * 60 + pm;
    const nowMin = now.hour * 60 + now.minute;
    const todayStr = now.toFormat('yyyy-LL-dd');
    if (nowMin < userMin) continue;                          // their time hasn't arrived yet today
    if (!DRY && u.lastReminderSent === todayStr) continue;   // already reminded today (dry runs still preview)

    due.push({ uid: docSnap.id, tokens, message: buildMessage(u, now, todayStr), day: todayStr });
  }

  if (due.length === 0) { console.log('No reminders due this run.'); return; }
  const total = due.reduce((n, d) => n + d.tokens.length, 0);
  console.log(`Reminders due: ${total} token(s) across ${due.length} user(s).`);
  due.forEach(d => console.log(`  -> ${d.uid.slice(0, 6)}… "${d.message.title} — ${d.message.body}"`));
  if (DRY) { console.log('[DRY RUN] Not sending or marking.'); return; }

  const deadByUid = {};
  for (const d of due) {
    for (const token of d.tokens) {
      try {
        await messaging.send({
          token,
          notification: { title: d.message.title, body: d.message.body },
          webpush: { fcmOptions: { link: SITE } }
        });
      } catch (e) {
        const code = (e.errorInfo && e.errorInfo.code) || e.code || String(e);
        console.log(`send failed (${code}) for ${token.slice(0, 12)}…`);
        if (/not-registered|invalid-argument|invalid-registration-token/.test(code)) {
          (deadByUid[d.uid] = deadByUid[d.uid] || []).push(token);
        }
      }
    }
  }
  for (const uid of Object.keys(deadByUid)) {
    await db.collection('users').doc(uid).update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...deadByUid[uid]) });
    console.log(`Pruned ${deadByUid[uid].length} dead token(s) for ${uid}.`);
  }
  for (const d of due) {
    try { await db.collection('users').doc(d.uid).update({ lastReminderSent: d.day }); }
    catch (e) { console.log('mark failed for ' + d.uid.slice(0, 6)); }
  }
  console.log('Done.');
})().catch(e => { console.error(e); process.exit(1); });
