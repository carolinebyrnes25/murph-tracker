/* Workout-reminder sender. Runs on a schedule from GitHub Actions.
   Reads each user's reminderPrefs + fcmTokens from Firestore and sends an FCM
   push to anyone whose chosen day + time matches this run (in their timezone). */
const admin = require('firebase-admin');
const { DateTime } = require('luxon');

// Strip a possible UTF-8 BOM / stray whitespace the secret may carry, then parse.
const svcRaw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').replace(/^﻿/, '').trim();
const svc = JSON.parse(svcRaw);
admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();
const messaging = admin.messaging();

const SITE = 'https://carolinebyrnes25.github.io/murph-tracker/';
const WINDOW = 30; // minutes; must match the cron cadence

(async () => {
  console.log('Run at ' + DateTime.now().setZone('America/New_York').toFormat("ccc yyyy-LL-dd HH:mm") + ' ET');
  const snap = await db.collection('users').get();
  const targets = []; // { uid, token }
  console.log(`Scanning ${snap.size} user profile(s).`);

  for (const docSnap of snap.docs) {
    const u = docSnap.data();
    const p = u.reminderPrefs;
    const tokens = Array.isArray(u.fcmTokens) ? u.fcmTokens : [];
    // Diagnostic summary (no email/token values, just config) to debug reminder delivery.
    if (p || tokens.length) {
      console.log(`profile ${docSnap.id.slice(0,6)}… enabled=${!!(p && p.enabled)} days=${p && p.days ? JSON.stringify(p.days) : '-'} time=${p ? p.time : '-'} tz=${p ? p.tz : '-'} tokens=${tokens.length}`);
    }
    if (!p || !p.enabled || tokens.length === 0) continue;

    const tz = p.tz || 'America/New_York';
    const now = DateTime.now().setZone(tz);
    const jsDay = now.weekday % 7; // luxon Mon=1..Sun=7  ->  0=Sun..6=Sat
    const days = Array.isArray(p.days) ? p.days : [];
    if (!days.includes(jsDay)) continue;

    const [ph, pm] = String(p.time || '07:00').split(':').map(Number);
    const userMin = ph * 60 + pm;
    const nowMin = now.hour * 60 + now.minute;
    const slot = Math.floor(nowMin / WINDOW) * WINDOW; // floor to the cron window
    if (userMin < slot || userMin >= slot + WINDOW) continue;

    for (const t of tokens) targets.push({ uid: docSnap.id, token: t });
  }

  if (targets.length === 0) { console.log('No reminders due this run.'); return; }
  console.log(`Reminders due: ${targets.length} token(s).`);

  const deadByUid = {};
  for (const { uid, token } of targets) {
    try {
      await messaging.send({
        token,
        notification: { title: 'Murph Tracker', body: "Time to train 💪 — log today's workout." },
        webpush: { fcmOptions: { link: SITE } }
      });
    } catch (e) {
      const code = (e.errorInfo && e.errorInfo.code) || e.code || String(e);
      console.log(`send failed (${code}) for ${token.slice(0, 12)}…`);
      if (/not-registered|invalid-argument|invalid-registration-token/.test(code)) {
        (deadByUid[uid] = deadByUid[uid] || []).push(token);
      }
    }
  }

  // Prune tokens the push service rejected as dead.
  for (const uid of Object.keys(deadByUid)) {
    await db.collection('users').doc(uid).update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...deadByUid[uid])
    });
    console.log(`Pruned ${deadByUid[uid].length} dead token(s) for ${uid}.`);
  }
  console.log('Done.');
})().catch((e) => { console.error(e); process.exit(1); });
