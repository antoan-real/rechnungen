// Firebase-Anbindung. Die Konfiguration ist öffentlich; geschützt werden die Daten durch firestore.rules.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, setDoc, deleteDoc, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDm9twcSEd9-yH0lW-CZ27dB2HvpKMI3Os",
  authDomain: "rechnungsbuch.firebaseapp.com",
  projectId: "rechnungsbuch",
  storageBucket: "rechnungsbuch.firebasestorage.app",
  messagingSenderId: "413089384960",
  appId: "1:413089384960:web:d68753be865facd0a7a6e5"
};

// Öffentlicher Web-Push-Schlüssel (Firebase → Projekteinstellungen → Cloud Messaging → Web-Push-Zertifikate)
export const VAPID_KEY = "BKw-YZNxEKKmz0L1k4br5e_DUIDqATtKO7V1c_jpHQp2fwFNfTZVsQ4u4ffDh1K7FwQxUDXko5ZfDHBAP6bO3bk";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Offline-Cache: Daten sind auch ohne Netz da, Änderungen werden später synchronisiert
let db;
try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { db = initializeFirestore(app, {}); }

export {
  app, auth, db, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut,
  collection, doc, onSnapshot, setDoc, deleteDoc, query, where
};
