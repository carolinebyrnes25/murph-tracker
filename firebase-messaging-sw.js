/* Firebase Cloud Messaging service worker — shows workout-reminder notifications
   when the app is closed/backgrounded. Registered on demand at scope ./push/ so it
   doesn't clash with the caching service worker (sw.js). */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDBnuhes0kYuy2zfe8oojK9WSxg_PORqEY",
  authDomain: "murph-tracker-c94db.firebaseapp.com",
  projectId: "murph-tracker-c94db",
  storageBucket: "murph-tracker-c94db.firebasestorage.app",
  messagingSenderId: "287760042875",
  appId: "1:287760042875:web:db445367dda2c1a5a10bde"
});

const messaging = firebase.messaging();

// The sender delivers data-only messages, so the payload arrives under `data`.
// (Falls back to `notification` for any legacy message.) We always show a
// notification here — iOS revokes a subscription that receives silent pushes.
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || payload.notification || {};
  self.registration.showNotification(d.title || "Murph Tracker", {
    body: d.body || "Time to train 💪",
    tag: "murph-reminder",
    data: { url: d.url || "../" }
  });
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow((e.notification.data && e.notification.data.url) || "../"));
});
