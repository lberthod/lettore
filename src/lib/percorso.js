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
