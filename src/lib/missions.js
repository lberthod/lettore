// Missions courtes (IntegartioNOptimsaitonPedago.MD §11.2) : quelques
// objectifs concrets, dérivés d'événements déjà journalisés — jamais de
// points par clic, de classement ni de récompense aléatoire (§11.3). Une
// mission est simplement « faite » ou « pas encore faite » aujourd'hui ;
// rater une journée ne coûte rien.
//
// Sprint 2.1 (phasetravail.md) : au lieu de proposer toujours les 3 mêmes
// missions à tout le monde, `selectMissionsForToday` priorise, parmi un pool
// élargi de missions candidates, celles qui répondent à une faiblesse
// réellement observée (aide de traduction très utilisée, compétence en
// recul, erreur qui revient) — toujours à partir de signaux déjà journalisés
// ailleurs (metrics.js), jamais d'un nouveau champ de tracking dédié aux
// missions. La règle « fait / pas encore fait » ne change pas : la
// personnalisation ne porte que sur *quelle* mission est proposée.

import { skillTrend, confidenceLevel, recurringErrorStats, readingHelpDependency } from './metrics.js'

const DAY = 24 * 60 * 60 * 1000

function startOfDay(now) {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// Chaque mission reconnaît un événement du journal d'activité déjà produit
// ailleurs dans l'app (ReaderView, WriteView/DialogueView via CorrectionRetry,
// WordsView) — aucun nouveau champ de tracking dédié aux missions.
//
// Ces 3 missions restent le socle par défaut : elles ne dépendent d'aucun
// signal de faiblesse (toujours pertinentes) et servent de repli si aucun
// signal conditionnel n'est disponible pour un utilisateur donné.
export const MISSIONS = [
  {
    id: 'ascolto_avant_transcription',
    label: 'Écoute un texte avant d’afficher la transcription.',
    match: (a) => a.skill === 'ascolto' && a.textRevealed === false,
  },
  {
    id: 'corrige_et_reecris',
    label: 'Corrige puis réécris une de tes erreurs.',
    match: (a) => (a.skill === 'scrittura' || a.skill === 'dialogo') && (a.retryCount || 0) > 0,
  },
  {
    id: 'reutilise_mots_revus',
    label: 'Réutilise des mots révisés dans un texte.',
    match: (a) => a.skill === 'scrittura' && (a.reuseWordsUsed || 0) > 0,
  },
]

const SKILL_LABELS = {
  lettura: 'lecture',
  ascolto: 'écoute',
  scrittura: 'écriture',
  dialogo: 'dialogue',
  pronuncia: 'prononciation',
  vocabolario: 'vocabulaire',
}

const CORE_SKILLS = ['lettura', 'ascolto', 'scrittura', 'dialogo', 'pronuncia', 'vocabolario']

// Compétence la plus en recul sur 4 semaines (§10.3, metrics.js#skillTrend) :
// on ne réagit qu'avec assez de recul (confidenceLevel du volume précédent
// pas « faible ») et seulement si la tendance est explicitement 'down' — pas
// de faiblesse inventée à partir de peu de données.
function weakestSkill(progress, now) {
  let worst = null
  for (const skill of CORE_SKILLS) {
    const trend = skillTrend(progress, skill, { now })
    if (trend.direction !== 'down') continue
    if (confidenceLevel(trend.previousCount) === 'faible') continue
    const delta = trend.recentCount - trend.previousCount
    if (!worst || delta < worst.delta) worst = { skill, delta }
  }
  return worst?.skill || null
}

// Pool de missions conditionnelles : chaque « builder » inspecte les signaux
// déjà journalisés et ne renvoie une mission que si le signal correspondant
// est effectivement présent. Elles sont évaluées dans cet ordre à chaque
// appel de `selectMissionsForToday` — rien n'est persisté.
const CONDITIONAL_MISSION_BUILDERS = [
  // Beaucoup de traductions cliquées récemment en lecture/écoute
  // (metrics.js#readingHelpDependency) → proposer un texte lu sans aide.
  function lecturaSenzaTraduzione(progress) {
    const dep = readingHelpDependency(progress)
    if (!dep.recentAvg || dep.recentAvg < 3) return null
    return {
      id: 'lettura_senza_traduzione',
      label: 'Lis un texte sans cliquer sur une seule traduction.',
      match: (a) => a.skill === 'lettura' && a.translatedWordsCount === 0,
    }
  },
  // Une compétence est en recul sur les 4 dernières semaines
  // (metrics.js#skillTrend) → proposer d'y pratiquer aujourd'hui.
  function pratiqueCompetenceFragile(progress, now) {
    const skill = weakestSkill(progress, now)
    if (!skill) return null
    return {
      id: `pratique_${skill}`,
      label: `Termine une activité de ${SKILL_LABELS[skill] || skill} aujourd’hui pour la reprendre en main.`,
      match: (a) => a.skill === skill,
    }
  },
  // Au moins une carte d'erreur revient plusieurs fois
  // (metrics.js#recurringErrorStats) → proposer une révision ciblée.
  function reviseErreurRecurrente(progress) {
    const stats = recurringErrorStats(progress)
    if (!stats.withRecurrence) return null
    return {
      id: 'revise_erreur_recurrente',
      label: 'Réussis un exercice de révision sur une erreur qui revient souvent.',
      match: (a) => a.skill === 'vocabolario' && (a.reviewed || 0) > 0,
    }
  },
]

function computeStatus(missionDefs, progress, now) {
  const today = startOfDay(now)
  const tomorrow = today + DAY
  const todaysActivity = (progress?.activity || []).filter(
    (a) => a.ts >= today && a.ts < tomorrow
  )
  return missionDefs.map((m) => ({
    id: m.id,
    label: m.label,
    done: todaysActivity.some((a) => m.match(a)),
  }))
}

// État du jour pour chaque mission FIXE : { id, label, done }. Se recalcule
// entièrement à chaque appel (rien à persister) et repart naturellement à
// zéro chaque jour calendaire local — pas de série à casser (§11.3).
export function missionsToday(progress, now = Date.now()) {
  return computeStatus(MISSIONS, progress, now)
}

// Sélection personnalisée (Sprint 2.1) : priorise, parmi le pool élargi, les
// missions conditionnelles dont le signal de faiblesse est présent
// aujourd'hui, puis complète avec les missions fixes jusqu'à `max`. Sans
// aucun signal disponible (utilisateur nouveau, peu de données), le résultat
// est identique à `missionsToday` — repli naturel sur les 3 missions fixes.
export function selectMissionsForToday(progress, now = Date.now(), { max = 3 } = {}) {
  const conditional = CONDITIONAL_MISSION_BUILDERS.map((build) => build(progress, now)).filter(
    Boolean
  )
  const pool = [...conditional, ...MISSIONS]
  const seen = new Set()
  const selected = []
  for (const mission of pool) {
    if (seen.has(mission.id)) continue
    seen.add(mission.id)
    selected.push(mission)
    if (selected.length >= max) break
  }
  return computeStatus(selected, progress, now)
}
