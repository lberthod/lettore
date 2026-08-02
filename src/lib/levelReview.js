// Relecture du positionnement CECR après quelques activités authentiques
// (Sprint 3.1, phasetravail.md §3.1 / outpedagogy.md §10.6) : le niveau
// « conseillé pour commencer » à l'issue du test/jeu de positionnement n'est
// qu'une estimation de départ — une fois l'utilisateur retourné à une
// pratique réelle (lecture, écoute, écriture, dialogue, prononciation), on
// compare ce niveau conseillé au niveau réellement observé et on le signale
// discrètement s'il a bougé.
//
// Deux couches, comme lib/writingDraft.js :
//   - persistance légère (localStorage, isolée par compte) pour mémoriser LE
//     dernier positionnement (niveau conseillé + horodatage + origine) ;
//   - une fonction pure `reviewPositioning`, testable sans navigateur, qui ne
//     fait QUE comparer — jamais d'accès direct à Firestore/localStorage ni
//     de nouveau système de tracking : elle réutilise le journal d'activité
//     déjà tenu par progress.js et le niveau déjà mesuré par ailleurs
//     (measuredLevel()/skillTrend() côté appelant).

import { currentUser } from './auth.js'

const BASE_KEY = 'lettore.levelPositioning'

function keyFor(uid) {
  return uid ? `${BASE_KEY}.${uid}` : BASE_KEY
}

// Compétences dont la pratique compte comme « activité authentique » après
// le positionnement — le positionnement lui-même (mode 'qcm'/'scala-cecr')
// n'est volontairement pas dans cette liste : refaire le test ne fait pas
// avancer la relecture, seule une vraie pratique le fait.
export const AUTHENTIC_SKILLS = ['lettura', 'ascolto', 'scrittura', 'dialogo', 'pronuncia']

// Nombre d'activités authentiques requises avant de proposer une relecture
// (§3.1 : « après 3 activités authentiques »).
export const REVIEW_AFTER_ACTIVITIES = 3

export function saveLevelPositioning({ level, confidence, source, uid, now = Date.now() } = {}) {
  if (!level) return
  const resolvedUid = uid !== undefined ? uid : currentUser.value?.uid || null
  try {
    localStorage.setItem(
      keyFor(resolvedUid),
      JSON.stringify({ level, confidence: confidence || null, source: source || 'qcm', ts: now })
    )
  } catch {
    // stockage indisponible : la relecture restera simplement indisponible
  }
}

export function loadLevelPositioning(uid) {
  const resolvedUid = uid !== undefined ? uid : currentUser.value?.uid || null
  try {
    return JSON.parse(localStorage.getItem(keyFor(resolvedUid))) || null
  } catch {
    return null
  }
}

export function clearLevelPositioning(uid) {
  const resolvedUid = uid !== undefined ? uid : currentUser.value?.uid || null
  try {
    localStorage.removeItem(keyFor(resolvedUid))
  } catch {
    // rien à faire
  }
}

// Nombre d'activités authentiques journalisées depuis l'horodatage du
// positionnement — pur, dérivé de progress.activity (aucun nouveau champ de
// tracking dédié).
export function activitiesSincePositioning(progress, positioning) {
  if (!positioning?.ts) return 0
  return (progress?.activity || []).filter(
    (a) => a.ts > positioning.ts && AUTHENTIC_SKILLS.includes(a.skill)
  ).length
}

// Relecture pure : compare le niveau conseillé au départ (`positioning.level`)
// au niveau réellement observé (`observedLevel`, fourni par l'appelant —
// typiquement measuredLevel().scrittura de progress.js) une fois au moins
// `REVIEW_AFTER_ACTIVITIES` activités authentiques journalisées depuis le
// positionnement. Ne modifie rien, ne persiste rien : c'est à l'appelant
// (ProfileView.vue) de décider d'afficher la note.
export function reviewPositioning(progress, positioning, { observedLevel, now = Date.now() } = {}) {
  if (!positioning?.level) {
    return { ready: false, reason: 'no-positioning' }
  }
  const activitiesSince = activitiesSincePositioning(progress, positioning)
  if (activitiesSince < REVIEW_AFTER_ACTIVITIES) {
    return {
      ready: false,
      reason: 'not-enough-activity',
      activitiesSince,
      needed: REVIEW_AFTER_ACTIVITIES,
    }
  }
  if (!observedLevel) {
    return {
      ready: false,
      reason: 'no-observed-level',
      activitiesSince,
      needed: REVIEW_AFTER_ACTIVITIES,
    }
  }

  const adjusted = observedLevel !== positioning.level
  return {
    ready: true,
    activitiesSince,
    recommendedLevel: positioning.level,
    observedLevel,
    adjusted,
    note: adjusted
      ? `Depuis le positionnement, ton niveau observé en pratique (${observedLevel}) diffère du niveau conseillé au départ (${positioning.level}).`
      : `Ton niveau observé en pratique (${observedLevel}) confirme le niveau conseillé au départ (${positioning.level}).`,
  }
}
