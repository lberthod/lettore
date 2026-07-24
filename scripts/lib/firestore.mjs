// Connexion Firestore via le SDK Admin (côté serveur : Mac, VPS, cron).
//
// Authentification : Application Default Credentials.
//   1. Console Firebase > Paramètres > Comptes de service > Générer une clé privée
//   2. export GOOGLE_APPLICATION_CREDENTIALS=/chemin/vers/serviceAccount.json
//
// Le SDK Admin contourne les security rules — il est réservé aux scripts.

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const PROJECT_ID = 'leggendo-dbb84'

let db = null

export function getDb() {
  if (!db) {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error(
        'GOOGLE_APPLICATION_CREDENTIALS non défini — voir scripts/README.md'
      )
    }
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
    db = getFirestore()
  }
  return db
}

export { FieldValue }

// Écrit un texte en brouillon dans la collection `texts`.
export async function saveDraft(textData, { premium = true } = {}) {
  const db = getDb()
  await db.doc(`texts/${textData.id}`).set(
    {
      ...textData,
      premium,
      status: 'draft',
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
}

// Reconstruit le doc meta/index à partir des textes publiés.
export async function rebuildIndex(makeEntry) {
  const db = getDb()
  const snap = await db
    .collection('texts')
    .where('status', '==', 'published')
    .get()
  const entries = snap.docs.map((d) => makeEntry(d.data()))
  await db.doc('meta/index').set({
    entries,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return entries.length
}
