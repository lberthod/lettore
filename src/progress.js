// Progression locale : textes lus, mots favoris, préférences.
// Tout est stocké dans localStorage, isolé par compte (voir switchNamespace
// ci-dessous) — deux comptes utilisés sur le même navigateur ne partagent
// jamais leur progression.

import { reactive, ref, watch } from 'vue'
import { currentUser } from './lib/auth.js'
import { isDelayedReview } from './lib/correctionRetry.js'

// Clé historique (avant l'isolation par UID), conservée comme espace des
// visiteurs non connectés.
const BASE_KEY = 'lettore.progress'

function keyFor(uid) {
  return uid ? `${BASE_KEY}.${uid}` : BASE_KEY
}

function load(uid) {
  try {
    return JSON.parse(localStorage.getItem(keyFor(uid))) || {}
  } catch {
    return {}
  }
}

// Répétition espacée (boîtes de Leitner) : intervalle avant la prochaine
// révision selon la boîte du mot (0 = nouveau … 5 = bien connu).
const DAY = 24 * 60 * 60 * 1000
const INTERVALS = [0, 1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY]
export const MAX_BOX = INTERVALS.length - 1

// Journal d'activité : plafond du nombre d'événements conservés (les plus
// récents gagnent). Assez pour alimenter les agrégats (fenêtres de 10-20)
// et un historique affichable, sans faire gonfler localStorage/Firestore.
export const ACTIVITY_CAP = 500

// Cartes d'erreur SRS : plafond au-delà duquel on éjecte d'abord les cartes
// les mieux maîtrisées (boîte la plus haute) et les plus anciennes.
export const ERROR_CARDS_CAP = 200

// Préférences neutres pour un profil qui n'en a pas encore choisi — exportées
// pour que lib/progressSync.js puisse distinguer « valeur par défaut, jamais
// touchée » d'un vrai choix utilisateur lors de la fusion multi-appareils.
export const DEFAULT_LEARNING_PREFERENCES = {
  goal: 'general',
  dailyMinutes: 10,
  reminderEnabled: false,
  preferredActivities: [],
  avoidedActivities: [],
}

function normalize(saved) {
  return {
    readTexts: saved.readTexts || [], // ids des textes terminés (quiz réussi)
    // Migration : les favoris enregistrés avant la répétition espacée
    // reçoivent une boîte 0 et sont immédiatement révisables.
    favorites: (saved.favorites || []).map((f) => ({ box: 0, due: 0, ...f })),
    knownWords: saved.knownWords || [], // mots déjà maîtrisés (mode vocabulaire)
    vocabTexts: saved.vocabTexts || [], // ids des textes ajoutés au mode vocabulaire
    ttsRate: saved.ttsRate || 0.9,
    hintDismissed: saved.hintDismissed || false,
    // Migration : les profils créés avant les séries quotidiennes reçoivent
    // un streak vierge (même approche que les favoris pré-répétition espacée).
    streak: {
      current: saved.streak?.current || 0,
      longest: saved.streak?.longest || 0,
      lastActiveDate: saved.streak?.lastActiveDate || null,
      // Migration : jours de repos (§11.1) — horodatages des jours de repos
      // déjà utilisés, pour espacer ce « joker » dans le temps.
      restDaysUsed: Array.isArray(saved.streak?.restDaysUsed) ? saved.streak.restDaysUsed : [],
    },
    // Migration : les profils créés avant le parcours pédagogique reçoivent
    // un journal, des agrégats et un paquet de cartes d'erreur vides.
    activity: Array.isArray(saved.activity) ? saved.activity : [],
    skills: saved.skills && typeof saved.skills === 'object' ? saved.skills : {},
    errorCards: Array.isArray(saved.errorCards) ? saved.errorCards : [],
    // Migration : journal des sessions composées du jour (démarrées/
    // terminées), voir recordSessionStarted/recordSessionCompleted —
    // uniquement de quoi mesurer l'achèvement de session (§15.1), pas un
    // nouveau système de tracking.
    sessionLog: Array.isArray(saved.sessionLog) ? saved.sessionLog : [],
    // Migration : les profils créés avant la session quotidienne composée
    // (voir lib/percorso.js) reçoivent des préférences par défaut neutres —
    // aucune activité évitée ni préférée, objectif général, 10 min/jour.
    learningPreferences: {
      goal: saved.learningPreferences?.goal || DEFAULT_LEARNING_PREFERENCES.goal,
      dailyMinutes: saved.learningPreferences?.dailyMinutes || DEFAULT_LEARNING_PREFERENCES.dailyMinutes,
      reminderEnabled: saved.learningPreferences?.reminderEnabled || DEFAULT_LEARNING_PREFERENCES.reminderEnabled,
      preferredActivities: Array.isArray(saved.learningPreferences?.preferredActivities)
        ? saved.learningPreferences.preferredActivities
        : [],
      avoidedActivities: Array.isArray(saved.learningPreferences?.avoidedActivities)
        ? saved.learningPreferences.avoidedActivities
        : [],
    },
  }
}

// Met à jour les préférences d'apprentissage (fusion partielle — n'écrase
// que les clés fournies). Les activités évitées ne sont jamais supprimées
// des choix possibles ailleurs dans l'app, seulement proposées avec
// modération par lib/percorso.js.
export function setLearningPreferences(patch) {
  Object.assign(progress.learningPreferences, patch)
}

// Première connexion d'un compte qui n'a pas encore son propre espace :
// reprend la progression anonyme de ce navigateur (clé historique) une seule
// fois, au lieu de la perdre — puis la retire pour qu'un autre compte utilisé
// ensuite sur ce même navigateur ne l'hérite pas à son tour.
function stateFor(uid) {
  const key = keyFor(uid)
  if (uid && localStorage.getItem(key) === null) {
    const legacy = localStorage.getItem(BASE_KEY)
    if (legacy !== null) {
      localStorage.setItem(key, legacy)
      localStorage.removeItem(BASE_KEY)
    }
  }
  const saved = load(uid)
  // Lu avant `normalize`, qui ajoute toujours une valeur par défaut, et remis à
  // jour ici pour chaque compte : la réponse dépend de l'espace localStorage
  // actif, pas de celui présent au chargement de la page.
  hasLocalTtsRate.value = 'ttsRate' in saved
  return normalize(saved)
}

// Permet à progressSync de savoir si l'utilisateur a déjà choisi une
// vitesse audio localement, avant d'appliquer une valeur distante.
export const hasLocalTtsRate = ref(false)

let activeUid = currentUser.value?.uid || null
const initialState = stateFor(activeUid)

export const progress = reactive(initialState)

let persistEnabled = true

function persist() {
  if (!persistEnabled) return
  try {
    localStorage.setItem(keyFor(activeUid), JSON.stringify(progress))
  } catch {
    // stockage plein ou indisponible : on continue sans persister
  }
}

watch(progress, persist, { deep: true })

// Connexion/déconnexion : vide l'état réactif puis recharge l'espace du bon
// compte — jamais de fusion automatique entre deux comptes.
watch(
  () => currentUser.value?.uid || null,
  (uid) => {
    if (uid === activeUid) return
    persistEnabled = false
    activeUid = uid
    Object.assign(progress, stateFor(uid))
    persistEnabled = true
  }
)

export function isRead(id) {
  return progress.readTexts.includes(id)
}

export function markRead(id) {
  if (!isRead(id)) progress.readTexts.push(id)
}

export function isFavorite(word) {
  return progress.favorites.some((f) => f.word === word)
}

export function isKnown(word) {
  return progress.knownWords.includes(word.toLowerCase())
}

export function markKnown(word) {
  const w = word.toLowerCase()
  if (!isKnown(w)) progress.knownWords.push(w)
}

export function unmarkKnown(word) {
  const i = progress.knownWords.indexOf(word.toLowerCase())
  if (i >= 0) progress.knownWords.splice(i, 1)
}

export function isInVocabMode(id) {
  return progress.vocabTexts.includes(id)
}

export function toggleVocabText(id) {
  const i = progress.vocabTexts.indexOf(id)
  if (i >= 0) progress.vocabTexts.splice(i, 1)
  else progress.vocabTexts.push(id)
}

export function toggleFavorite(entry) {
  const i = progress.favorites.findIndex((f) => f.word === entry.word)
  if (i >= 0) progress.favorites.splice(i, 1)
  else progress.favorites.push({ ...entry, box: 0, due: 0 })
}

// Mots dont la révision est arrivée à échéance
export function dueFavorites() {
  const now = Date.now()
  return progress.favorites.filter((f) => (f.due || 0) <= now)
}

// Date calendaire LOCALE au format 'YYYY-MM-DD'. Surtout pas un timestamp ni
// toISOString() (UTC) : un utilisateur actif à 23h50 puis 00h10 doit compter
// deux jours selon SON fuseau, pas celui de Greenwich.
function localDay(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Série quotidienne : à appeler après chaque activité qui « compte » (quiz
// réussi, session de révision). Aujourd'hui déjà compté → no-op ; hier actif →
// la série continue ; sinon → elle repart à 1. La persistance passe par le
// watcher deep existant sur `progress`.
export function touchStreak() {
  const now = new Date()
  const today = localDay(now)
  const s = progress.streak
  if (s.lastActiveDate === today) return
  const yesterday = localDay(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  )
  s.current = s.lastActiveDate === yesterday ? s.current + 1 : 1
  s.longest = Math.max(s.longest || 0, s.current)
  s.lastActiveDate = today
}

// Jour de repos (IntegartioNOptimsaitonPedago.MD §11.1) : « possibilité d'un
// jour de repos sans perdre tout le sens du parcours ». N'incrémente jamais
// `current` (pas de fausse progression pour une journée sans pratique) —
// évite seulement la remise à 1 du lendemain. Utilisable au plus une fois
// tous les `REST_DAY_COOLDOWN`, et seulement pour éviter la coupure d'UNE
// journée manquée (pas pour rattraper plusieurs jours d'inactivité).
export const REST_DAY_COOLDOWN = 6 * DAY

export function canUseRestDay(now = Date.now()) {
  const s = progress.streak
  if (!s.current) return false // rien à préserver
  const today = localDay(new Date(now))
  if (s.lastActiveDate === today) return false // déjà actif aujourd'hui
  const yesterday = localDay(new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate() - 1))
  if (s.lastActiveDate !== yesterday) return false // plus d'une journée d'écart : trop tard
  return !(s.restDaysUsed || []).some((ts) => now - ts < REST_DAY_COOLDOWN)
}

export function useRestDay(now = Date.now()) {
  if (!canUseRestDay(now)) return false
  const s = progress.streak
  s.lastActiveDate = localDay(new Date(now))
  s.restDaysUsed = [...(s.restDaysUsed || []), now].slice(-20)
  return true
}

// Résultat d'une révision : réussite → boîte suivante (intervalle plus long),
// échec → retour à la boîte 0 (revu dès la prochaine session).
export function reviewWord(word, success) {
  const f = progress.favorites.find((x) => x.word === word)
  if (!f) return
  f.box = success ? Math.min((f.box || 0) + 1, MAX_BOX) : 0
  f.due = Date.now() + INTERVALS[f.box]
}

// ---------------------------------------------------------------------------
// Journal d'activité + agrégats par compétence
// ---------------------------------------------------------------------------

// Moyenne des ratios score/total (ou du score seul s'il n'y a pas de total)
// sur les `windowSize` derniers événements d'une compétence qui portent un
// score. Recalculée depuis le journal à chaque log : simple et toujours juste.
function rollingAvgScore(skill, windowSize = 20) {
  const scored = progress.activity.filter(
    (a) => a.skill === skill && typeof a.score === 'number'
  )
  const recent = scored.slice(-windowSize)
  if (!recent.length) return null
  const sum = recent.reduce(
    (acc, a) => acc + (a.total ? a.score / a.total : a.score),
    0
  )
  return sum / recent.length
}

// Identifiant stable d'événement : permet à la fusion multi-appareils de
// dédupliquer sans dépendre du timestamp (deux événements sur deux appareils
// peuvent partager le même ts). crypto.randomUUID n'existe pas partout
// (contextes non sécurisés, anciens navigateurs) d'où le repli manuel.
function newEventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// Enregistre un événement d'apprentissage. `entry` = { skill, ...données
// libres (textId, score, total, attempts, mode, level, errorCount, sessionId…) } ;
// `ts` et `eventId` sont ajoutés automatiquement, `sessionId` reste `null`
// quand l'événement n'appartient pas à une session composée. Met à jour les
// agrégats `progress.skills` et la série quotidienne : une activité loggée =
// une journée active (les vues n'ont plus à appeler touchStreak elles-mêmes).
export function logActivity(entry) {
  if (!entry || !entry.skill) return null
  const event = {
    sessionId: null,
    ...entry,
    ts: Date.now(),
    eventId: newEventId(),
  }
  progress.activity.push(event)
  if (progress.activity.length > ACTIVITY_CAP) {
    progress.activity.splice(0, progress.activity.length - ACTIVITY_CAP)
  }

  const skills = progress.skills
  if (!skills[event.skill]) skills[event.skill] = { count: 0, lastTs: 0 }
  const s = skills[event.skill]
  s.count = (s.count || 0) + 1
  s.lastTs = event.ts

  // Agrégats spécifiques — volontairement minimaux et recalculables.
  if (event.skill === 'lettura') {
    const avg = rollingAvgScore('lettura')
    if (avg !== null) s.avgScore = avg
  } else if (event.skill === 'pronuncia') {
    const avg = rollingAvgScore('pronuncia')
    if (avg !== null) s.avgScore = avg
  } else if (event.skill === 'scrittura') {
    if (event.level) {
      s.levels = [...(s.levels || []), event.level].slice(-10)
    }
    const errors =
      typeof event.errorCount === 'number'
        ? event.errorCount
        : Array.isArray(event.errors)
          ? event.errors.length
          : 0
    s.errorCount = (s.errorCount || 0) + errors
  } else if (event.skill === 'dialogo') {
    // Un événement loggé = une session de dialogue terminée.
    s.sessions = (s.sessions || 0) + 1
  }

  touchStreak()
  return event
}

// ---------------------------------------------------------------------------
// Cartes d'erreur (répétition espacée des erreurs de production)
// ---------------------------------------------------------------------------

// Hash court et stable (djb2, base 36) de original+correction : la même
// erreur re-signalée sur n'importe quel appareil produit le même id, ce qui
// permet la déduplication locale ET la fusion multi-appareils par id.
export function errorCardId(original, correction) {
  const s = `${original || ''} ${correction || ''}`
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

// Ajoute une carte d'erreur (boîte 0, révisable immédiatement). Déduplique
// par id : refaire la même erreur ne crée pas de doublon (la carte existante,
// avec sa boîte, reste — elle redeviendra due naturellement). Au-delà du
// plafond, on éjecte d'abord les cartes les mieux maîtrisées (boîte la plus
// haute) et, à boîte égale, les plus anciennes : on ne sacrifie jamais une
// erreur encore fragile pour en garder une déjà sue.
//
// Champs facultatifs (IntegartioNOptimsaitonPedago.MD §8.1) : `sourceId`
// (identifiant du texte/dialogue d'origine), `contextBefore`/`contextAfter`
// (phrases voisines, pour se souvenir du contexte plusieurs jours après) et
// `contrastExample` (formulation contrastive, utile pour l'exercice « choisir
// entre deux formulations », voir lib/errorExercises.js). Les anciennes
// cartes sans ces champs restent valides — l'UI dégrade proprement sur ''.
export function addErrorCard({
  original,
  correction,
  explanation,
  type,
  source,
  sourceId,
  contextBefore,
  contextAfter,
  contrastExample,
}) {
  const id = errorCardId(original, correction)
  const existing = progress.errorCards.find((c) => c.id === id)
  if (existing) {
    // Erreur récurrente (§15.1) : on note le nouvel horodatage plutôt que de
    // dupliquer la carte — `history` sert seulement à mesurer l'écart entre
    // deux occurrences, plafonné pour ne pas alourdir le document.
    existing.history = [...(existing.history || [existing.addedTs]), Date.now()].slice(-8)
    return existing
  }
  const card = {
    id,
    original,
    correction,
    explanation: explanation || '',
    type: type || 'grammatica',
    source: source || 'scrivi',
    sourceId: sourceId || null,
    contextBefore: contextBefore || '',
    contextAfter: contextAfter || '',
    contrastExample: contrastExample || '',
    box: 0,
    due: 0,
    addedTs: Date.now(),
    history: [Date.now()],
  }
  progress.errorCards.push(card)
  while (progress.errorCards.length > ERROR_CARDS_CAP) {
    let evict = 0
    for (let i = 1; i < progress.errorCards.length; i++) {
      const a = progress.errorCards[i]
      const b = progress.errorCards[evict]
      if (
        (a.box || 0) > (b.box || 0) ||
        ((a.box || 0) === (b.box || 0) && (a.addedTs || 0) < (b.addedTs || 0))
      ) {
        evict = i
      }
    }
    progress.errorCards.splice(evict, 1)
  }
  return card
}

// Cartes d'erreur dont la révision est arrivée à échéance
export function dueErrorCards() {
  const now = Date.now()
  return progress.errorCards.filter((c) => (c.due || 0) <= now)
}

// Échéance courte pour la réponse « difficile » (§8.3) : la carte reste dans
// la même boîte (la difficulté n'est pas oubliée, la maîtrise n'est pas
// encore acquise), mais revient plus vite qu'un intervalle Leitner normal.
export const DIFFICULT_RETRY_INTERVAL = 4 * 60 * 60 * 1000 // 4 heures

// Leitner à trois réponses (IntegartioNOptimsaitonPedago.MD §8.3), qui étend
// le binaire d'origine sans le casser : `success` reste utilisable tel quel
// (true → boîte suivante, comme « su » ; false → boîte 0, comme « oublié »),
// ou `outcome` peut valoir explicitement 'oublie' | 'difficile' | 'su'.
// 'difficile' est un troisième cas, pas un alias de false : même boîte,
// échéance courte.
export function reviewErrorCard(id, outcome) {
  const c = progress.errorCards.find((x) => x.id === id)
  if (!c) return
  if (outcome === 'difficile') {
    c.due = Date.now() + DIFFICULT_RETRY_INTERVAL
    return
  }
  const success = outcome === true || outcome === 'su'
  const now = Date.now()
  // Réussite différée (Sprint 1.2, outpedagogy.md §15.1) : distincte de la
  // reprise immédiate (CorrectionRetry.vue, retryCount/retrySuccess). On ne
  // journalise QUE les révisions qui ont lieu au moins
  // lib/correctionRetry.js#DELAYED_REVIEW_MIN_DAYS jours après la correction
  // initiale (`c.addedTs`, posé par addErrorCard) — sinon une reprise faite
  // dans la foulée via /words compterait à tort comme un transfert. Événement
  // journalisé dans le journal générique existant (logActivity), pas de
  // nouvelle collection ni de nouveau champ redondant sur la carte.
  if (isDelayedReview(c.addedTs, now)) {
    logActivity({
      skill: 'ripasso_errori',
      errorType: c.type,
      cardId: c.id,
      source: c.source || null,
      sourceId: c.sourceId || null,
      success,
      daysSinceCorrection: (now - c.addedTs) / DAY,
    })
  }
  c.box = success ? Math.min((c.box || 0) + 1, MAX_BOX) : 0
  c.due = now + INTERVALS[c.box]
}

export function removeErrorCard(id) {
  const i = progress.errorCards.findIndex((c) => c.id === id)
  if (i >= 0) progress.errorCards.splice(i, 1)
}

// ---------------------------------------------------------------------------
// Niveau mesuré
// ---------------------------------------------------------------------------

// Valeur la plus fréquente d'un tableau ; à égalité, la plus récente gagne.
function modeOf(values) {
  if (!values || !values.length) return null
  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1)
  let best = null
  let bestCount = 0
  // Parcours du plus récent au plus ancien : à égalité, le plus récent gagne.
  for (let i = values.length - 1; i >= 0; i--) {
    const c = counts.get(values[i])
    if (c > bestCount) {
      best = values[i]
      bestCount = c
    }
  }
  return best
}

// Niveau CECR effectivement MESURÉ (par les estimations du mode écriture),
// pas un niveau déclaré ni deviné. `global` égale `scrittura` tant que
// l'écriture est la seule compétence évaluée en niveau — le nom est honnête :
// pas de fausse précision multi-compétences.
export function measuredLevel() {
  const levels = progress.skills.scrittura?.levels || []
  const scrittura = modeOf(levels.slice(-5))
  return { scrittura, global: scrittura }
}

// ---------------------------------------------------------------------------
// Journal des sessions composées (achèvement de session, §15.1)
// ---------------------------------------------------------------------------
//
// Une entrée par jour calendaire local où une session composée (voir
// lib/percorso.js#composeSession, appelée depuis HomeView) a démarré.
// `recordSessionStarted` est idempotente pour un même jour ; `startedTs` sert
// à borner les fenêtres de metrics.js#sessionCompletionRate.
export const SESSION_LOG_CAP = 90

export function recordSessionStarted(now = Date.now()) {
  const today = localDay(new Date(now))
  if (progress.sessionLog.some((e) => e.date === today)) return
  progress.sessionLog.push({ date: today, startedTs: now, completed: false, completedTs: null })
  if (progress.sessionLog.length > SESSION_LOG_CAP) {
    progress.sessionLog.splice(0, progress.sessionLog.length - SESSION_LOG_CAP)
  }
}

export function recordSessionCompleted(now = Date.now()) {
  const today = localDay(new Date(now))
  let entry = progress.sessionLog.find((e) => e.date === today)
  if (!entry) {
    entry = { date: today, startedTs: now, completed: false, completedTs: null }
    progress.sessionLog.push(entry)
  }
  entry.completed = true
  entry.completedTs = now
}
