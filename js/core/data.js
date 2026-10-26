// Datenzugriff für alle Module. Alles liegt unter users/{uid}/<sammlung>/<dokument>,
// die Module geben nur den Namen der Sammlung an.
import { db, collection, doc, onSnapshot, setDoc, deleteDoc, query, where } from "../firebase.js";

let uid = null;
const errorHandlers = new Set();

export function setUser(id) { uid = id; }
export function currentUid() { return uid; }
export function onDataError(fn) { errorHandlers.add(fn); return () => errorHandlers.delete(fn); }
const report = e => errorHandlers.forEach(fn => fn(e));

const colRef = name => collection(db, "users", uid, name);
const docRef = (name, id) => doc(db, "users", uid, name, id);

/** Ganze Sammlung beobachten. opts.where = [feld, op, wert] */
export function watchCollection(name, cb, opts = {}) {
  let q = colRef(name);
  if (opts.where) q = query(q, where(...opts.where));
  return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => report(e));
}

/** Ein Dokument beobachten; cb(null) wenn es fehlt */
export function watchDoc(name, id, cb) {
  return onSnapshot(docRef(name, id), s => cb(s.exists() ? s.data() : null), e => report(e));
}

export const put = (name, id, data) => setDoc(docRef(name, id), data);
export const merge = (name, id, data) => setDoc(docRef(name, id), data, { merge: true });
export const remove = (name, id) => deleteDoc(docRef(name, id));

export const newId = prefix => prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
