// Synchronise la progression (textes lus, mots favoris, préférences) avec
// Firestore quand l'utilisateur est connecté, pour ne pas la perdre en
// changeant d'appareil. localStorage (voir progress.js) reste la copie
// hors-ligne : à la connexion on fusionne local et distant sans jamais rien
// écraser, puis chaque changement local est répercuté (avec un court délai
// pour grouper les écritures rapprochées, ex. plusieurs mots favorisés d'affilée).

import { watch } from 'vue'
import { progress } from '../progress.js'
import { currentUser } from './auth.js'
import { firebaseReady, getFirebaseApp } from './firebase.js'

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

// Un mot connu des deux côtés garde la boîte de répétition la plus avancée
// (celle qui reflète le plus de révisions réussies), au lieu d'écraser.
function mergeFavorites(local, remote) {
  const byWord = new Map(remote.map((f) => [f.word, f]))
  for (const f of local) {
    const existing = byWord.get(f.word)
    if (!existing || (f.box || 0) > (existing.box || 0)) byWord.set(f.word, f)
  }
  return [...byWord.values()]
}

async function pullAndMerge(uid, db, fs) {
  const { doc, getDoc } = fs
  const snap = await getDoc(doc(db, 'users', uid))
  const remote = snap.exists() ? snap.data().progress : null
  if (!remote) return
  progress.readTexts = [
    ...new Set([...progress.readTexts, ...(remote.readTexts || [])]),
  ]
  progress.favorites = mergeFavorites(progress.favorites, remote.favorites || [])
  progress.knownWords = [
    ...new Set([...progress.knownWords, ...(remote.knownWords || [])]),
  ]
  if (!progress.hintDismissed && remote.hintDismissed) {
    progress.hintDismissed = true
  }
}

function pushLocal(uid, db, fs) {
  const { doc, setDoc } = fs
  return setDoc(
    doc(db, 'users', uid),
    {
      progress: {
        readTexts: progress.readTexts,
        favorites: progress.favorites,
        knownWords: progress.knownWords,
        ttsRate: progress.ttsRate,
        hintDismissed: progress.hintDismissed,
      },
    },
    { merge: true }
  ).catch(() => {
    // Hors ligne ou Firestore indisponible : la copie locale reste à jour,
    // on réessaiera au prochain changement (ou à la reconnexion).
  })
}

let started = false

// À appeler une fois au démarrage de l'application.
export function initProgressSync() {
  if (started || !firebaseReady) return
  started = true

  let stopLocalWatch = null
  let pushTimer = null

  watch(
    currentUser,
    async (user) => {
      if (stopLocalWatch) {
        stopLocalWatch()
        stopLocalWatch = null
      }
      clearTimeout(pushTimer)
      if (!user) return

      const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')])
      if (!db) return

      let merging = true
      await pullAndMerge(user.uid, db, fs).catch(() => {})
      merging = false

      stopLocalWatch = watch(
        progress,
        () => {
          if (merging) return
          clearTimeout(pushTimer)
          pushTimer = setTimeout(() => pushLocal(user.uid, db, fs), 1500)
        },
        { deep: true }
      )
    },
    { immediate: true }
  )
}
