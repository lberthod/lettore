// Moteur partagé du positionnement CECR (Sprint 3.1, voir phasetravail.md
// §3.1) : sélection de question anti-répétition et estimation de niveau,
// jusqu'ici dupliquées entre LevelTestView.vue (QCM adaptatif « escalier »)
// et ScalaCecrGame.vue (variante gamifiée, vies/streak). Module pur —
// aucune dépendance Vue, aucun accès DOM/localStorage — pour rester
// utilisable par les deux présentations (test sérieux et jeu) sans porter
// d'opinion sur l'une ou l'autre.

import { LEVELS, QUESTIONS_BY_LEVEL } from '../data/levelTestQuestions.js'
import { confidenceLevel } from './metrics.js'

export { LEVELS, QUESTIONS_BY_LEVEL }

// Tire une question au niveau donné, en évitant de répéter une question déjà
// posée à ce niveau PENDANT la tentative en cours. `usedByLevel` est un objet
// { [level]: Set(indices déjà posés) } fourni par l'appelant et MUTÉ ici (on
// y ajoute l'indice tiré) — comme dans les deux implémentations d'origine,
// pour rester un simple `ref({})` côté Vue sans wrapper supplémentaire.
// Quand toutes les questions du niveau ont déjà été posées dans cette
// tentative, la contrainte est relâchée (le compteur repart de zéro) plutôt
// que de bloquer le test ou le jeu.
export function pickQuestion(level, usedByLevel = {}) {
  const bank = QUESTIONS_BY_LEVEL[level] || []
  if (!bank.length) return null

  if (!(usedByLevel[level] instanceof Set)) {
    usedByLevel[level] = new Set(usedByLevel[level] || [])
  }
  const used = usedByLevel[level]

  let available = bank.map((_, i) => i).filter((i) => !used.has(i))
  if (available.length === 0) {
    used.clear()
    available = bank.map((_, i) => i)
  }

  const idx = available[Math.floor(Math.random() * available.length)]
  used.add(idx)
  const q = bank[idx]
  return { level, index: idx, q: q.q, options: q.options, correct: q.correct }
}

// Estimation de niveau à partir de l'historique des réponses ({ level,
// correct }[]) : pour chaque niveau CECR, le niveau estimé est le plus haut
// niveau où la majorité des réponses posées sont correctes (même heuristique
// que l'ancien LevelTestView.vue). `null` si aucun niveau n'atteint la
// majorité (résultat « pré-A1 »).
//
// Nouveauté (§3.1) : une confiance explicite, fondée sur la taille de
// l'échantillon — mêmes trois paliers que le reste de l'app
// (metrics.js#confidenceLevel), pas un second calcul inventé ici.
export function estimateLevel(history = []) {
  const stats = LEVELS.map((level) => {
    const attempts = history.filter((h) => h.level === level)
    return {
      level,
      attempts: attempts.length,
      correct: attempts.filter((h) => h.correct).length,
    }
  })

  let estimated = null
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    const s = stats[i]
    if (s.attempts > 0 && s.correct / s.attempts >= 0.5) {
      estimated = LEVELS[i]
      break
    }
  }

  const sampleSize = history.length
  return { estimated, stats, sampleSize, confidence: confidenceLevel(sampleSize) }
}

// ---------------------------------------------------------------------------
// Positionnement multimodal (§3.1) : QCM + auto-évaluation situationnelle +
// production facultative. Reste volontairement descriptif plutôt que de
// recalculer un niveau à partir de l'auto-évaluation/production — la seule
// mesure chiffrée reste le QCM (estimateLevel ci-dessus), les deux autres
// signaux enrichissent l'explication donnée à l'utilisateur, comme demandé
// par outpedagogy.md §10.6 (« niveau conseillé pour commencer », pas une
// certification qui prétendrait combiner trois mesures en un seul score).
// ---------------------------------------------------------------------------

// Résume les réponses d'auto-évaluation (oui/plutôt/non) en un compte simple,
// utilisé seulement pour la formulation du résultat, jamais pour changer le
// niveau estimé par le QCM.
export function summarizeSelfAssessment(answers = {}) {
  const values = Object.values(answers).filter(Boolean)
  const yes = values.filter((v) => v === 'oui').length
  const partial = values.filter((v) => v === 'plutot').length
  const no = values.filter((v) => v === 'non').length
  return { total: values.length, yes, partial, no }
}

// Phrase de résultat honnête : « niveau conseillé pour commencer », jamais
// une certification, avec l'origine des signaux utilisés (§3.1 critère de
// fini : « le résultat affiché inclut confiance + origine multimodale »).
export function describeRecommendation(estimate, { selfAssessment, hasProduction } = {}) {
  const level = estimate?.estimated || 'A1 (pré-A1)'
  const confidenceLabel = { faible: 'faible', moyen: 'moyenne', suffisant: 'suffisante' }[
    estimate?.confidence
  ] || 'faible'

  const sources = ['le questionnaire à choix multiples']
  if (selfAssessment && selfAssessment.total > 0) sources.push('ton auto-évaluation')
  if (hasProduction) sources.push('ta production écrite')

  const sourcesLabel =
    sources.length > 1
      ? `${sources.slice(0, -1).join(', ')} et ${sources[sources.length - 1]}`
      : sources[0]

  return (
    `Niveau conseillé pour commencer : ${level} (confiance ${confidenceLabel}, ` +
    `${estimate?.sampleSize || 0} question${(estimate?.sampleSize || 0) > 1 ? 's' : ''}). ` +
    `Basé sur ${sourcesLabel} — ce n'est pas une certification officielle.`
  )
}
