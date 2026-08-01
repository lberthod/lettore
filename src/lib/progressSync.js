// Synchronise la progression (textes lus, mots favoris, préférences) avec
// Firestore quand l'utilisateur est connecté, pour ne pas la perdre en
// changeant d'appareil. localStorage (voir progress.js) reste la copie
// hors-ligne : à la connexion on fusionne local et distant sans jamais rien
// écraser, on renvoie aussitôt le résultat de cette fusion, puis chaque
// changement local est répercuté (avec un court délai pour grouper les
// écritures rapprochées, ex. plusieurs mots favorisés d'affilée).

import { watch } from 'vue'
import { progress, hasLocalTtsRate, ACTIVITY_CAP } from '../progress.js'
import { currentUser } from './auth.js'
// Instance Firestore partagée (getDbInstance) et non `getFirestore` local :
// c'est le seul point qui appelle `initializeFirestore` avec le cache
// persistant, et il doit passer avant tout `getFirestore` sous peine de
// figer Firestore en mémoire seule (plus de relecture hors ligne).
import { firebaseReady, getDbInstance } from './firebase.js'

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

// Série quotidienne multi-appareils : le record est le max des deux côtés ;
// la série en cours et sa date viennent du côté actif le plus récemment
// (les dates 'YYYY-MM-DD' se comparent lexicographiquement). Pas d'addition
// des `current` : une même journée jouée sur deux appareils ne compte qu'une
// fois.
function mergeStreak(local, remote) {
  const l = local || {}
  const r = remote || {}
  const freshest = (r.lastActiveDate || '') > (l.lastActiveDate || '') ? r : l
  return {
    current: freshest.current || 0,
    longest: Math.max(l.longest || 0, r.longest || 0),
    lastActiveDate: freshest.lastActiveDate || null,
  }
}

// Journal d'activité multi-appareils : union dédupliquée par eventId quand il
// est présent (identifiant stable, insensible aux collisions de timestamp
// entre deux appareils), avec repli sur le timestamp pour les anciens
// événements enregistrés avant son introduction. Triée chronologiquement puis
// replafonnée aux ACTIVITY_CAP plus récents — même plafond qu'en local.
function mergeActivity(local, remote) {
  const byKey = new Map()
  for (const a of [...remote, ...local]) {
    if (!a || typeof a.ts !== 'number') continue
    const key = a.eventId || `ts:${a.ts}`
    byKey.set(key, a)
  }
  return [...byKey.values()]
    .sort((a, b) => a.ts - b.ts)
    .slice(-ACTIVITY_CAP)
}

// Cartes d'erreur : union par id (l'id est un hash stable du contenu, donc la
// même erreur signalée sur deux appareils fusionne d'elle-même). En conflit,
// même esprit que mergeFavorites : on garde la boîte la plus avancée (le plus
// de révisions réussies) et l'échéance la plus lointaine, sans écraser.
function mergeErrorCards(local, remote) {
  const byId = new Map(remote.map((c) => [c.id, c]))
  for (const c of local) {
    const existing = byId.get(c.id)
    if (!existing) {
      byId.set(c.id, c)
    } else {
      byId.set(c.id, {
        ...existing,
        ...c,
        box: Math.max(c.box || 0, existing.box || 0),
        due: Math.max(c.due || 0, existing.due || 0),
        addedTs: Math.min(c.addedTs || Infinity, existing.addedTs || Infinity),
      })
    }
  }
  return [...byId.values()]
}

// Agrégats par compétence : recalculables et non additifs (les additionner
// compterait deux fois les mêmes sessions). Choix : par compétence, on garde
// le côté au lastTs le plus récent — l'appareil actif en dernier a les
// agrégats les plus à jour, et toute imprécision se corrige au prochain
// logActivity (qui recalcule les moyennes depuis le journal fusionné).
function mergeSkills(local, remote) {
  const merged = { ...remote }
  for (const [skill, s] of Object.entries(local || {})) {
    const r = merged[skill]
    if (!r || (s.lastTs || 0) >= (r.lastTs || 0)) merged[skill] = s
  }
  return merged
}

// Laisse remonter les erreurs de lecture (hors ligne, permissions) : l'appelant
// doit savoir que la fusion n'a pas eu lieu, car pousser après une lecture
// ratée écraserait le distant (setDoc/merge remplace les tableaux entiers).
async function pullAndMerge(uid, db, fs, isStale) {
  const { doc, getDoc } = fs
  const snap = await getDoc(doc(db, 'users', uid))
  if (isStale()) return
  const remote = snap.exists() ? snap.data().progress : null
  if (!remote) return
  progress.readTexts = [
    ...new Set([...progress.readTexts, ...(remote.readTexts || [])]),
  ]
  progress.favorites = mergeFavorites(progress.favorites, remote.favorites || [])
  progress.knownWords = [
    ...new Set([...progress.knownWords, ...(remote.knownWords || [])]),
  ]
  progress.vocabTexts = [
    ...new Set([...progress.vocabTexts, ...(remote.vocabTexts || [])]),
  ]
  progress.streak = mergeStreak(progress.streak, remote.streak)
  progress.activity = mergeActivity(progress.activity, remote.activity || [])
  progress.errorCards = mergeErrorCards(
    progress.errorCards,
    remote.errorCards || []
  )
  progress.skills = mergeSkills(progress.skills, remote.skills || {})
  if (!progress.hintDismissed && remote.hintDismissed) {
    progress.hintDismissed = true
  }
  if (remote.ttsRate && !hasLocalTtsRate.value) {
    progress.ttsRate = remote.ttsRate
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
        vocabTexts: progress.vocabTexts,
        ttsRate: progress.ttsRate,
        hintDismissed: progress.hintDismissed,
        streak: progress.streak,
        activity: progress.activity,
        skills: progress.skills,
        errorCards: progress.errorCards,
      },
    },
    { merge: true }
  ).catch(() => {
    // Hors ligne ou Firestore indisponible : la copie locale reste à jour,
    // on réessaiera au prochain changement (ou à la reconnexion).
  })
}

let started = false
let watchGeneration = 0

// À appeler une fois au démarrage de l'application. Suppose que progress.js
// a déjà basculé `progress` vers l'espace localStorage du bon compte avant
// que pullAndMerge ne s'exécute (son propre watch sur currentUser, enregistré
// dès l'import de progress.js ci-dessus, se déclenche donc en premier) —
// sinon la fusion mélangerait la progression de deux comptes différents.
export function initProgressSync() {
  if (started || !firebaseReady) return
  started = true

  let stopLocalWatch = null
  let pushTimer = null

  watch(
    currentUser,
    async (user) => {
      // Incrémenté de façon synchrone à chaque changement d'utilisateur : permet
      // aux opérations async de l'appel précédent (encore en cours après un
      // changement de compte) de se reconnaître obsolètes et de s'interrompre,
      // au lieu de fusionner ou d'écrire la progression du mauvais compte.
      const myGeneration = ++watchGeneration

      if (stopLocalWatch) {
        stopLocalWatch()
        stopLocalWatch = null
      }
      clearTimeout(pushTimer)
      if (!user) return

      const [db, fs] = await Promise.all([
        getDbInstance(),
        import('firebase/firestore'),
      ])
      if (myGeneration !== watchGeneration || !db) return

      let merging = true
      let merged = true
      try {
        await pullAndMerge(user.uid, db, fs, () => myGeneration !== watchGeneration)
      } catch {
        // Lecture impossible : on garde la copie locale telle quelle et on ne
        // pousse pas, pour ne pas remplacer le distant par le seul local.
        merged = false
      }
      merging = false
      if (myGeneration !== watchGeneration) return

      stopLocalWatch = watch(
        progress,
        () => {
          if (merging || myGeneration !== watchGeneration) return
          clearTimeout(pushTimer)
          pushTimer = setTimeout(() => {
            if (myGeneration === watchGeneration) pushLocal(user.uid, db, fs)
          }, 1500)
        },
        { deep: true }
      )

      // Le résultat de la fusion n'existe pour l'instant qu'en local : sans cet
      // envoi, une progression anonyme migrée vers un nouveau compte, ou l'union
      // de deux appareils, n'atteindrait Firestore qu'à la prochaine action de
      // l'utilisateur (et serait perdue s'il ferme l'onglet avant). Le watcher
      // est déjà installé pour ne pas rater un changement pendant l'écriture.
      if (merged) pushLocal(user.uid, db, fs)
    },
    { immediate: true }
  )
}
