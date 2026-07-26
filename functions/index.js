/**
 * Murph Tracker — AI coach-note proxy (self-contained; holds the Gemini key server-side).
 *
 * The app generates its post-workout "Coach's note" by calling this instead of hitting
 * Gemini from the browser, so:
 *   - the API key lives here (a Cloud Functions secret), never in the public GitHub Pages site;
 *   - only signed-in, allow-listed accounts can use it, so the paid endpoint can't be abused;
 *   - the app is on GitHub Pages (a different origin), so we enable CORS for it.
 *
 * The app builds the coaching `system` prompt + the session summary (`messages`) in the
 * browser and sends them here; this function is just the protected key-holder + model call.
 * Same shape as the baby-answers / byrnes-finance Ask-AI proxies.
 *
 * One-time setup (see the reminder-sender for how FIREBASE_SERVICE_ACCOUNT is already used):
 *   - firebase functions:secrets:set AI_API_KEY   (paste your Google AI / Gemini API key)
 *   - firebase deploy --only functions            (the deploy workflow does this on push)
 *   - Firebase console -> Authentication -> Settings -> Authorized domains already lists the site.
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();

const AI_API_KEY = defineSecret('AI_API_KEY');
// gemini-flash-latest auto-resolves to the current stable Gemini Flash, so we don't have to
// track version numbers as Google releases new ones. Hardcoded (not a deploy-time param) so the
// non-interactive CI deploy has nothing to prompt for.
const AI_MODEL = 'gemini-flash-latest';

// Who may use the AI coach (Google sign-in emails). Everyone else still gets the app's
// instant rule-based note — they just don't reach the paid endpoint.
const ALLOW = [
  'carolinebyrnes25@gmail.com',
  'luke.f.byrnes@gmail.com',
  'diana.luck.22@gmail.com',
  'lloyd.w.luck@gmail.com',
];

// The site allowed to call this endpoint (CORS).
const APP_ORIGIN = 'https://carolinebyrnes25.github.io';

// Output-token ceiling for the note. The note is 2-3 short paragraphs; thinkingBudget:0
// (below) hands the whole budget to the visible answer, so this is comfortable headroom.
const MAX_TOKENS = 1024;

exports.askAI = onRequest(
  { secrets: [AI_API_KEY], region: 'us-central1', maxInstances: 3, cors: [APP_ORIGIN] },
  async (req, res) => {
    try {
      if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

      // auth: signed-in + allow-listed
      const bearer = (req.get('Authorization') || '').match(/^Bearer (.+)$/);
      if (!bearer) { res.status(401).json({ error: 'Please sign in.' }); return; }
      let decoded;
      try { decoded = await admin.auth().verifyIdToken(bearer[1]); }
      catch (e) { res.status(401).json({ error: 'Session expired — sign in again.' }); return; }
      const email = (decoded.email || '').toLowerCase();
      if (ALLOW.indexOf(email) === -1) { res.status(403).json({ error: 'This account is not on the allow-list.' }); return; }

      const body = req.body || {};
      const system = String(body.system || '').slice(0, 20000);
      let messages = Array.isArray(body.messages) ? body.messages.slice(-4) : [];
      messages = messages
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));
      if (!messages.length) { res.status(400).json({ error: 'No prompt.' }); return; }

      const key = AI_API_KEY.value();
      if (!key) { res.status(500).json({ error: 'AI_API_KEY secret is not set.' }); return; }

      const text = await callGemini(AI_MODEL, key, system, messages);
      res.json({ text: text });
    } catch (e) {
      res.status(502).json({ error: (e && e.message) || 'Proxy error.' });
    }
  }
);

async function callGemini(model, key, system, messages) {
  // Gemini uses roles "user" / "model" (not "assistant") and a separate system_instruction.
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '') }],
  }));
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: contents,
      // thinkingBudget:0 disables Flash's internal reasoning so the full token budget goes to
      // the visible note (a short reply; thinking would otherwise starve it). Ignored by
      // non-thinking models.
      generationConfig: { maxOutputTokens: MAX_TOKENS, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j && j.error && (j.error.message || j.error)) || 'Gemini ' + r.status);
  const cand = j.candidates && j.candidates[0];
  return ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || '').join('');
}
