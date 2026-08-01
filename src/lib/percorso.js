// Parcours pédagogique : à partir de la progression (journal d'activité,
// révisions dues, niveau mesuré), décider LA prochaine action recommandée.
//
// Module volontairement pur : il reçoit l'objet `progress` (et le catalogue de
// textes s'il est disponible) en paramètre, ne touche ni au DOM ni aux
// singletons de progress.js — il est donc testable sans navigateur, et
// n'embarque pas l'index des textes (127 kB) dans le bundle d'entrée : c'est
// à l'appelant de le charger à la demande (voir HomeView).
//
// Les règles sont simples et transparentes, par ordre de priorité :
//   1. ≥ 5 révisions dues (mots favoris + cartes d'erreur) → réviser
//   2. aucune lecture/écoute aujourd'hui → lire un texte (adapté au niveau)
//   3. écoute jamais/peu pratiquée cette semaine (< 2) → écouter un texte
//   4. Premium IA et aucune écriture cette semaine → écrire
//   5. Premium IA et aucun dialogue cette semaine → dialoguer
//   6. sinon → continuer à lire

const DAY = 24 * 60 * 60 * 1000

// Seuils des règles — exportés pour que les tests et l'interface racontent
// la même histoire que le code.
export const REVIEW_THRESHOLD = 5
export const ASCOLTO_WEEKLY_TARGET = 2

// Minuit local du jour de `now` : « aujourd'hui » suit le fuseau de
// l'utilisateur, comme le streak de progress.js.
function startOfDay(now) {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function activitySince(progress, since, skills) {
  return (progress.activity || []).filter(
    (a) => a.ts >= since && (!skills || skills.includes(a.skill))
  )
}

// Éléments de répétition espacée arrivés à échéance. Même définition que
// dueFavorites/dueErrorCards de progress.js, mais sur l'objet reçu en
// paramètre (pureté oblige).
export function dueReviewCount(progress, now = Date.now()) {
  const due = (list) => (list || []).filter((x) => (x.due || 0) <= now).length
  return due(progress.favorites) + due(progress.errorCards)
}

// Valeur la plus fréquente ; à égalité, la plus récente gagne (même logique
// que measuredLevel de progress.js, réimplémentée ici sur l'objet paramètre).
function modeOf(values) {
  if (!values || !values.length) return null
  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1)
  let best = null
  let bestCount = 0
  for (let i = values.length - 1; i >= 0; i--) {
    const c = counts.get(values[i])
    if (c > bestCount) {
      best = values[i]
      bestCount = c
    }
  }
  return best
}

// Niveau cible pour recommander un texte : d'abord le niveau CECR mesuré
// (mode des 5 dernières estimations d'écriture), sinon le niveau le plus
// fréquent parmi les textes déjà lus.
export function targetLevel(progress, texts = []) {
  const measured = modeOf((progress.skills?.scrittura?.levels || []).slice(-5))
  if (measured) return measured
  const read = new Set(progress.readTexts || [])
  const readLevels = texts.filter((t) => read.has(t.id)).map((t) => t.level)
  return modeOf(readLevels)
}

// Un texte du catalogue jamais lu, au niveau cible si possible, sinon
// n'importe quel texte non lu. `null` quand le catalogue n'est pas chargé
// ou que tout a été lu.
export function recommendText(progress, texts = []) {
  const read = new Set(progress.readTexts || [])
  const unread = texts.filter((t) => !read.has(t.id))
  if (!unread.length) return null
  const level = targetLevel(progress, texts)
  return unread.find((t) => t.level === level) || unread[0]
}

// LA prochaine action recommandée : { id, title, reason, to, cta }.
// `to` est une « location » vue-router ({ name, params?, query? }).
export function nextStep(progress, { hasPremiumIA = false, texts = [], now = Date.now() } = {}) {
  // 1. Révisions dues (mots favoris + cartes d'erreur)
  const due = dueReviewCount(progress, now)
  if (due >= REVIEW_THRESHOLD) {
    return {
      id: 'ripasso',
      title: `Réviser (${due} éléments)`,
      reason: `${due} mots et erreurs t'attendent`,
      to: { name: 'words' },
      cta: 'Réviser',
    }
  }

  const today = startOfDay(now)
  const weekAgo = now - 7 * DAY
  const suggestion = recommendText(progress, texts)

  // 2. Aucune lecture ni écoute aujourd'hui
  if (!activitySince(progress, today, ['lettura', 'ascolto']).length) {
    if (suggestion) {
      return {
        id: 'lettura',
        title: 'Lire un texte',
        reason: `« ${suggestion.title} » (${suggestion.level}) est à ton niveau et tu ne l'as pas encore lu`,
        to: { name: 'reader', params: { id: suggestion.id } },
        cta: 'Lire',
      }
    }
    return {
      id: 'lettura',
      title: 'Lire un texte',
      reason: "Tu n'as pas encore lu aujourd'hui — dix minutes suffisent",
      to: { name: 'library' },
      cta: 'Choisir un texte',
    }
  }

  // 3. Écoute jamais ou peu pratiquée cette semaine
  if (activitySince(progress, weekAgo, ['ascolto']).length < ASCOLTO_WEEKLY_TARGET) {
    return {
      id: 'ascolto',
      title: 'Écouter un texte',
      reason: "L'écoute est ta compétence la moins travaillée cette semaine",
      to: suggestion
        ? { name: 'reader', params: { id: suggestion.id }, query: { mode: 'ascolto' } }
        : { name: 'library' },
      cta: 'Écouter',
    }
  }

  // 4. Premium IA : aucune production écrite cette semaine
  if (hasPremiumIA && !activitySince(progress, weekAgo, ['scrittura']).length) {
    return {
      id: 'scrittura',
      title: 'Écrire quelques phrases',
      reason: "Aucune production écrite cette semaine — quelques phrases corrigées suffisent",
      to: { name: 'write' },
      cta: 'Écrire',
    }
  }

  // 5. Premium IA : aucune session de dialogue cette semaine
  if (hasPremiumIA && !activitySince(progress, weekAgo, ['dialogo']).length) {
    return {
      id: 'dialogo',
      title: 'Faire un dialogue',
      reason: 'Aucun dialogue cette semaine — entraîne ta conversation',
      to: { name: 'dialogue' },
      cta: 'Dialoguer',
    }
  }

  // 6. Par défaut : continuer à lire
  return {
    id: 'continua',
    title: 'Continuer à lire',
    reason: 'Tout est à jour — un texte de plus consolide le reste',
    to: { name: 'library' },
    cta: 'Continuer',
  }
}

// ---------------------------------------------------------------------------
// Session quotidienne composée (voir IntegartioNOptimsaitonPedago.MD §6)
// ---------------------------------------------------------------------------
//
// `nextStep` reste la recommandation « une seule action » historique (utilisée
// tant que le catalogue/les préférences ne sont pas chargés, ou comme repli).
// `composeSession` l'étend : à partir des mêmes signaux (révisions dues,
// dernière pratique par compétence, scores récents, niveau mesuré, objectif
// personnel, durée choisie, Premium IA), elle construit jusqu'à 3 étapes qui
// tiennent dans le temps disponible, au lieu d'une étape unique.

// Étape « révision » : jamais plus de ce nombre d'éléments d'un coup, même
// si beaucoup plus sont en retard — une session reste finissable.
export const REVIEW_STEP_CAP = 10

// Compétence journal ↔ type d'étape de session composée (voir logActivity :
// 'review' n'est pas un skill à part, il couvre les révisions de mots ET de
// cartes d'erreur, journalisées sous 'vocabolario' par WordsView).
export const STEP_SKILL = {
  review: 'vocabolario',
  lettura: 'lettura',
  ascolto: 'ascolto',
  write: 'scrittura',
  dialogo: 'dialogo',
  pronuncia: 'pronuncia',
}

// Étapes qui coûtent un appel IA (correction, dialogue) : jamais deux dans
// une session courte.
export const COSTLY_AI_TYPES = ['write', 'dialogo']
const SHORT_SESSION_MAX = 10

export const RECEPTION_TYPES = ['lettura', 'ascolto']
export const PRODUCTION_TYPES = ['write', 'dialogo', 'pronuncia']

// Estimation de durée par type d'étape — grossière mais transparente, en
// minutes. `count` module la durée de révision (davantage d'éléments = plus
// long, jamais moins d'une minute).
function estimateMinutes(type, { count } = {}) {
  if (type === 'review') return Math.max(1, Math.ceil((count || 5) / 2.5))
  if (type === 'lettura' || type === 'ascolto') return 5
  if (type === 'dialogo') return 4
  return 3 // write, pronuncia
}

// Ordre de pertinence des types d'étape selon l'objectif personnel — sert à
// ne pas recommander une compétence juste parce que son compteur est bas si
// elle n'appartient pas à l'objectif (règle 6.3). 'review' n'y figure pas :
// les révisions dues restent prioritaires quel que soit l'objectif.
const GOAL_ACTIVITIES = {
  conversation: ['dialogo', 'pronuncia', 'ascolto', 'lettura'],
  travel: ['ascolto', 'dialogo', 'lettura', 'pronuncia'],
  exam: ['write', 'lettura', 'ascolto', 'pronuncia'],
  reading: ['lettura', 'ascolto', 'pronuncia'],
  general: ['lettura', 'ascolto', 'write', 'dialogo', 'pronuncia'],
}

function modeOfType(type) {
  if (RECEPTION_TYPES.includes(type)) return 'reception'
  if (PRODUCTION_TYPES.includes(type)) return 'production'
  return null
}

// Types d'étape déjà pratiqués la veille (jour calendaire local) — pour
// éviter de reproduire exactement la même composition de session deux jours
// de suite (règle 6.3). Dérivé du journal d'activité existant : pas besoin
// d'un nouveau champ de progression.
function yesterdaySignature(progress, now) {
  const today = startOfDay(now)
  const yesterdayStart = today - DAY
  const types = new Set()
  for (const a of progress.activity || []) {
    if (a.ts < yesterdayStart || a.ts >= today) continue
    const type = Object.keys(STEP_SKILL).find((t) => STEP_SKILL[t] === a.skill)
    if (type) types.add(type)
  }
  return types
}

// Construit une session composée : { duration, objective, steps }. `steps`
// contient au plus 3 étapes, chacune { type, estimatedMinutes, ...détails }.
export function composeSession(
  progress,
  { hasPremiumIA = false, texts = [], now = Date.now(), duration } = {}
) {
  const prefs = progress.learningPreferences || {}
  const totalDuration = duration || prefs.dailyMinutes || 10
  const avoided = new Set(prefs.avoidedActivities || [])
  const preferred = new Set(prefs.preferredActivities || [])
  const goal = prefs.goal || 'general'
  const allowedByGoal = GOAL_ACTIVITIES[goal] || GOAL_ACTIVITIES.general
  const yesterday = yesterdaySignature(progress, now)

  const steps = []
  const usedTypes = new Set()
  let costlyAiCount = 0
  const maxCostlyAi = totalDuration <= SHORT_SESSION_MAX ? 1 : 2
  // Budget de minutes restant : chaque étape ajoutée le consomme, pour que
  // la somme des estimatedMinutes ne dépasse jamais la durée annoncée
  // (sinon une session « 5 minutes » peut afficher 12 minutes d'étapes).
  let remaining = totalDuration

  // 1. Révisions très en retard, en premier mais plafonnées — à la fois en
  // nombre (REVIEW_STEP_CAP) et en durée (ne consomme pas plus que le
  // budget total, pour laisser une chance aux étapes suivantes).
  const due = dueReviewCount(progress, now)
  if (due > 0) {
    const maxByBudget = Math.max(1, Math.floor(remaining * 2.5))
    const count = Math.min(due, REVIEW_STEP_CAP, maxByBudget)
    const minutes = estimateMinutes('review', { count })
    steps.push({
      type: 'review',
      estimatedMinutes: minutes,
      count,
      to: { name: 'words' },
    })
    usedTypes.add('review')
    remaining -= minutes
  }

  // Candidats restants, dans l'ordre de pertinence de l'objectif — filtrés
  // par disponibilité (Premium IA) et non déjà utilisés.
  function candidateTypes() {
    return allowedByGoal.filter((type) => {
      if (usedTypes.has(type)) return false
      if (COSTLY_AI_TYPES.includes(type) && !hasPremiumIA) return false
      if (COSTLY_AI_TYPES.includes(type) && costlyAiCount >= maxCostlyAi) return false
      return true
    })
  }

  // Score : compétence jamais/peu pratiquée récemment = priorité, avec un
  // bonus discret pour les activités préférées et une pénalité pour les
  // activités évitées (proposées avec modération, jamais supprimées).
  function scoreType(type) {
    const skill = STEP_SKILL[type]
    const lastTs = progress.skills?.[skill]?.lastTs || 0
    let score = now - lastTs // plus c'est ancien, plus le score est haut
    if (preferred.has(type)) score += 3 * DAY
    if (avoided.has(type)) score -= 5 * DAY
    return score
  }

  function pickNext({ preferMode, maxMinutes } = {}) {
    let pool = candidateTypes()
    if (!pool.length) return null
    if (preferMode) {
      const sameMode = pool.filter((t) => modeOfType(t) === preferMode)
      if (sameMode.length) pool = sameMode
    }
    if (maxMinutes != null) {
      const fitting = pool.filter((t) => estimateMinutes(t) <= maxMinutes)
      if (!fitting.length) return null
      pool = fitting
    }
    pool = [...pool].sort((a, b) => scoreType(b) - scoreType(a))
    return pool[0]
  }

  const suggestion = recommendText(progress, texts)

  function buildStep(type) {
    if (type === 'lettura' || type === 'ascolto') {
      const to = suggestion
        ? { name: 'reader', params: { id: suggestion.id }, query: type === 'ascolto' ? { mode: 'ascolto' } : undefined }
        : { name: 'library' }
      return { type, estimatedMinutes: estimateMinutes(type), textId: suggestion?.id || null, to }
    }
    if (type === 'write') {
      return { type, estimatedMinutes: estimateMinutes(type), promptId: null, to: { name: 'write' } }
    }
    if (type === 'dialogo') {
      return { type, estimatedMinutes: estimateMinutes(type), to: { name: 'dialogue' } }
    }
    if (type === 'pronuncia') {
      // Pas de route dédiée : la répétition guidée (PronunciationDrill) vit
      // dans le lecteur, phrase par phrase — on renvoie donc vers un texte,
      // comme pour la lecture.
      const to = suggestion ? { name: 'reader', params: { id: suggestion.id } } : { name: 'library' }
      return { type, estimatedMinutes: estimateMinutes(type), textId: suggestion?.id || null, to }
    }
    return { type, estimatedMinutes: estimateMinutes(type) }
  }

  // 2. Deux étapes de plus au maximum (3 au total), en alternant réception
  // et production quand la durée le permet — et sans dépasser le budget de
  // minutes restant, sinon la durée annoncée ne veut plus rien dire.
  while (steps.length < 3 && remaining > 0) {
    const lastMode = steps.length ? modeOfType(steps[steps.length - 1].type) : null
    const wantMode = lastMode === 'reception' ? 'production' : lastMode === 'production' ? 'reception' : null
    let type = pickNext({ preferMode: wantMode, maxMinutes: remaining })
    if (!type && wantMode) type = pickNext({ maxMinutes: remaining })
    if (!type) break
    const minutes = estimateMinutes(type)
    if (COSTLY_AI_TYPES.includes(type)) costlyAiCount += 1
    usedTypes.add(type)
    steps.push(buildStep(type))
    remaining -= minutes
  }

  // Filet de sécurité : une session très courte (ou sans révision due) ne
  // doit pas rester vide juste parce que la seule activité pertinente
  // dépasse légèrement le budget — une étape un peu longue vaut mieux
  // qu'aucune proposition.
  if (!steps.length) {
    const type = pickNext({})
    if (type) {
      const minutes = estimateMinutes(type)
      if (COSTLY_AI_TYPES.includes(type)) costlyAiCount += 1
      usedTypes.add(type)
      steps.push(buildStep(type))
      remaining -= minutes
    }
  }

  // Règle 6.3 : ne pas reproduire exactement la même composition qu'hier.
  // Si la signature des types coïncide, on remplace la dernière étape (la
  // moins prioritaire) par le candidat suivant disponible, s'il y en a un.
  if (steps.length > 1) {
    const signature = new Set(steps.map((s) => s.type))
    const sameAsYesterday =
      signature.size === yesterday.size && [...signature].every((t) => yesterday.has(t))
    if (sameAsYesterday) {
      const lastStep = steps[steps.length - 1]
      const lastType = lastStep.type
      usedTypes.delete(lastType)
      if (COSTLY_AI_TYPES.includes(lastType)) costlyAiCount -= 1
      // Le budget libéré par l'étape retirée redevient disponible pour
      // l'alternative — le remplacement ne doit pas, lui non plus, dépasser
      // la durée annoncée.
      const freedBudget = remaining + lastStep.estimatedMinutes
      const alt = pickNext({ maxMinutes: freedBudget })
      if (alt) {
        if (COSTLY_AI_TYPES.includes(alt)) costlyAiCount += 1
        const altStep = buildStep(alt)
        steps[steps.length - 1] = altStep
        remaining = freedBudget - altStep.estimatedMinutes
      } else {
        usedTypes.add(lastType)
        if (COSTLY_AI_TYPES.includes(lastType)) costlyAiCount += 1
      }
    }
  }

  return {
    duration: totalDuration,
    objective: sessionObjective(goal, steps),
    steps,
  }
}

const GOAL_OBJECTIVES = {
  conversation: 'Parler avec plus d’aisance',
  travel: 'Comprendre et réutiliser le vocabulaire du voyage',
  exam: "Consolider l'écrit en vue d'un examen",
  reading: 'Élargir la compréhension de lecture',
  general: 'Progresser un peu partout, sans se disperser',
}

function sessionObjective(goal, steps) {
  if (!steps.length) return 'Rien à faire de plus aujourd’hui — tout est à jour'
  return GOAL_OBJECTIVES[goal] || GOAL_OBJECTIVES.general
}

// Étape en cours d'une session composée : la première dont la compétence
// correspondante n'a pas encore été journalisée depuis `sinceTs` (le début
// de la journée locale, en pratique — voir lib/dailySession.js). Dérivé du
// journal d'activité existant, pas d'un compteur de progression séparé à
// maintenir : terminer l'étape ailleurs dans l'app (lecture, écriture…)
// suffit à faire avancer la session en revenant sur « Il tuo percorso ».
export function currentStepIndex(session, progress, sinceTs = 0) {
  const steps = session?.steps || []
  for (let i = 0; i < steps.length; i++) {
    const skill = STEP_SKILL[steps[i].type]
    const done = (progress.activity || []).some((a) => a.ts >= sinceTs && a.skill === skill)
    if (!done) return i
  }
  return steps.length
}

// Compteurs d'activité des 7 derniers jours, par compétence — pour les
// petites jauges hebdomadaires du profil.
export const SKILLS = ['lettura', 'ascolto', 'vocabolario', 'scrittura', 'dialogo', 'pronuncia']

export function weekSummary(progress, now = Date.now()) {
  const weekAgo = now - 7 * DAY
  const summary = { total: 0 }
  for (const s of SKILLS) summary[s] = 0
  for (const a of progress.activity || []) {
    if (a.ts < weekAgo || a.ts > now) continue
    if (summary[a.skill] === undefined) continue
    summary[a.skill] += 1
    summary.total += 1
  }
  return summary
}

// « il y a N jours » à partir d'un timestamp — en jours CALENDAIRES locaux
// (hier à 23 h reste « hier », même s'il y a moins de 24 h).
export function daysAgo(ts, now = Date.now()) {
  if (!ts) return null
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(ts)) / DAY))
}

export function daysAgoLabel(ts, now = Date.now()) {
  const days = daysAgo(ts, now)
  if (days === null) return 'jamais'
  if (days === 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  return `il y a ${days} jours`
}
