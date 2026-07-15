import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { GoogleAuthProvider, getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

export const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
export let db;
try{ db = initializeFirestore(fbApp, { localCache: persistentLocalCache({}) }); }
catch(e){ db = getFirestore(fbApp); }
export const provider=new GoogleAuthProvider();
provider.setCustomParameters({ prompt:"select_account" });
