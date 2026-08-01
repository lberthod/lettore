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
