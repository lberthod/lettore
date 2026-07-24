// Pool partagé de textes d'actualité générés par le cron VPS
// (leggendo-server/news-cron.mjs), réservé à la formule Premium+.
// Même pattern que userTexts.js : Firestore importé à la demande, rien ne
// pèse sur le bundle tant qu'on ne s'en sert pas.

import { getFirebaseApp, firebaseReady } from './firebase.js'

let dbPromise = null

function getDb() {
  if (!firebaseReady) return Promise.resolve(null)
  if (!dbPromise) {
    dbPromise = Promise.all([getFirebaseApp(), import('firebase/firestore')]).then(
      ([app, { getFirestore }]) => getFirestore(app)
    )
  }
  return dbPromise
}

// Les plus récents d'abord. Les règles Firestore refusent la lecture si
// l'utilisateur n'a pas le rôle Premium+ (voir firestore.rules).
export async function listNewsTexts(max = 30) {
  const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')])
  if (!db) return []
  const { collection, query, orderBy, limit, getDocs } = fs
  const q = query(collection(db, 'newsTexts'), orderBy('createdAt', 'desc'), limit(max))
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data())
}

export async function loadNewsText(id) {
  try {
    const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')])
    if (!db) return null
    const { doc, getDoc } = fs
    const snap = await getDoc(doc(db, 'newsTexts', id))
    return snap.exists() ? snap.data() : null
  } catch {
    return null
  }
}
