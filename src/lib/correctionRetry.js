// Sélection et vérification pour la seconde tentative après feedback
// (IntegartioNOptimsaitonPedago.MD, section 5). Logique pure et testable —
// le composant CorrectionRetry.vue ne fait que l'UI et la persistance SRS.

import { comparePhrases } from './textSimilarity.js'

// Ordre de priorité pédagogique (section 5.3) : compréhension > grammaire
// récurrente > lexique qui change le sens > orthographe > amélioration
// idiomatique > préférence stylistique. La taxonomie serveur actuelle
// (grammatica / lessico / registro / ortografia, + pronuncia en local) ne
// distingue pas encore la compréhension ni le style — on fait correspondre
// chaque type connu au rang le plus proche, et un type inconnu prend un rang
// intermédiaire plutôt que d'être ignoré.
const TYPE_RANK = {
  comprensione: 0, // pas renvoyé aujourd'hui par le serveur, prêt si ça change
  grammatica: 1,
  lessico: 2,
  ortografia: 3,
  registro: 4, // amélioration idiomatique / registre
  stile: 5,
}

function rankOf(type) {
  return type in TYPE_RANK ? TYPE_RANK[type] : 3.5
}

export const MAX_RETRY_ERRORS = 2

// Sélectionne 1 à `max` erreurs prioritaires parmi la correction complète.
// À rang de priorité égal, un type qui revient plusieurs fois (erreur
// grammaticale récurrente) passe devant une occurrence isolée.
export function selectPriorityErrors(errors, { max = MAX_RETRY_ERRORS } = {}) {
  const list = Array.isArray(errors)
    ? errors.filter((e) => e && e.original && e.correction)
    : []
  if (!list.length) return []

  const countByType = new Map()
  for (const e of list) countByType.set(e.type, (countByType.get(e.type) || 0) + 1)

  return [...list]
    .sort((a, b) => {
      const rankDiff = rankOf(a.type) - rankOf(b.type)
      if (rankDiff !== 0) return rankDiff
      return (countByType.get(b.type) || 0) - (countByType.get(a.type) || 0)
    })
    .slice(0, max)
}

// Seuil de succès local de la reformulation face à la correction attendue —
// même mécanique que la prononciation (comparaison de tokens), plutôt que
// d'exiger une égalité stricte de chaînes (ponctuation, casse…).
export const RETRY_SUCCESS_THRESHOLD = 85

export function checkRewrite(attempt, correction) {
  const { score } = comparePhrases(correction, attempt)
  return { score, success: score >= RETRY_SUCCESS_THRESHOLD }
}

// Indice progressif : la première moitié (arrondie au-dessus) des mots de la
// correction attendue, jamais la phrase entière — l'apprenant doit encore
// compléter lui-même.
export function hintFor(correction) {
  const words = String(correction || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  const half = Math.max(1, Math.ceil(words.length / 2))
  return `${words.slice(0, half).join(' ')} …`
}

// ---------------------------------------------------------------------------
// Réussite différée / transfert (Sprint 1.2, outpedagogy.md §15.1)
// ---------------------------------------------------------------------------
//
// Deux signaux distincts existent maintenant pour une même erreur corrigée :
//
// 1. « Reprise immédiate » (ci-dessus, checkRewrite/CorrectionRetry.vue) :
//    reformulation demandée dans la foulée de la correction, dans la MÊME
//    session, sur la MÊME phrase. Mesurée par retryCount/retrySuccess
//    (journalisés par WriteView.vue/DialogueView.vue sur l'événement
//    scrittura/dialogo) et agrégée par lib/metrics.js#retrySuccessRate.
//
// 2. « Réussite différée » (nouveau) : une carte d'erreur SRS
//    (progress.js#errorCards, alimentée par addErrorCard juste après la
//    correction — c'est déjà le journal générique réutilisé, pas un nouveau
//    système) redevient due et est révisée avec succès dans
//    lib/errorExercises.js (WordsView.vue), PLUSIEURS JOURS après la
//    correction initiale (`card.addedTs`) — donc dans une session séparée,
//    hors du contexte d'écriture d'origine. Ce n'est pas un « nouveau
//    contexte » au sens d'une phrase totalement inédite (les exercices
//    d'errorExercises.js retravaillent la phrase de la carte), mais c'est un
//    contexte d'évaluation différent (exercice isolé, pas la production
//    libre) et surtout un DÉLAI réel, ce qui suffit à distinguer ce signal
//    d'une simple reprise immédiate.
//
// Une carte d'erreur est due dès sa création (box 0, due 0) : sans seuil de
// délai, une révision faite juste après la correction (par exemple si
// l'apprenant visite /words dans la foulée) serait comptée comme un
// transfert alors que ce n'est qu'une reprise immédiate déguisée. D'où ce
// seuil, extrait en fonction pure pour rester testable sans dépendre de
// progress.js (réactif) — voir progress.js#reviewErrorCard, qui journalise
// l'événement `ripasso_errori` via logActivity() seulement quand
// isDelayedReview() est vrai.
export const DELAYED_REVIEW_MIN_DAYS = 2
const DAY_MS = 24 * 60 * 60 * 1000

export function isDelayedReview(correctedAt, now = Date.now()) {
  if (!correctedAt) return false
  return (now - correctedAt) / DAY_MS >= DELAYED_REVIEW_MIN_DAYS
}
