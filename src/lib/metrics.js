// Indicateurs d'efficacité pédagogique (IntegartioNOptimsaitonPedago.MD
// §15.1) et aides à un affichage honnête du profil de compétence (§10.2/10.3).
//
// Toutes les fonctions sont PURES : elles lisent l'objet `progress` (journal
// d'activité, cartes d'erreur, série) déjà tenu à jour par progress.js et ne
// créent aucun nouveau système de tracking. Elles sont donc directement
// testables sans navigateur ni backend — voir metrics.test.js.

const DAY = 24 * 60 * 60 * 1000

function activityOf(progress) {
  return progress?.activity || []
}

// ---------------------------------------------------------------------------
// §15.1 — Seconde tentative / réussite de reprise
// ---------------------------------------------------------------------------
//
// Une « correction proposée » est un événement scrittura/dialogo qui
// contenait au moins une erreur (donc où CorrectionRetry a pu s'afficher,
// voir WriteView.vue/DialogueView.vue). Une « reprise » est comptée quand
// l'événement porte `retryCount > 0` (au moins une reformulation tentée).
export function retryRate(progress, { skills = ['scrittura', 'dialogo'] } = {}) {
  const proposed = activityOf(progress).filter(
    (a) => skills.includes(a.skill) && (a.errorCount || 0) > 0
  )
  if (!proposed.length) return null
  const retried = proposed.filter((a) => (a.retryCount || 0) > 0)
  return retried.length / proposed.length
}

// Réussite de reprise : parmi les reprises effectivement tentées, combien se
// terminent par `retrySuccess === true`.
export function retrySuccessRate(progress, { skills = ['scrittura', 'dialogo'] } = {}) {
  const retried = activityOf(progress).filter(
    (a) => skills.includes(a.skill) && (a.retryCount || 0) > 0
  )
  if (!retried.length) return null
  const success = retried.filter((a) => a.retrySuccess === true)
  return success.length / retried.length
}

// ---------------------------------------------------------------------------
// §15.1 — Erreurs récurrentes
// ---------------------------------------------------------------------------
//
// S'appuie sur `card.history` (progress.js#addErrorCard) : chaque fois
// qu'une erreur déjà connue est re-signalée, son horodatage s'ajoute à
// l'historique de la carte plutôt que de créer un doublon. Une carte
// « récurrente » est une carte revue au moins deux fois avec un écart d'au
// moins `days` jours entre deux occurrences consécutives : la règle n'est
// pas encore consolidée.
export function recurringErrorStats(progress, { shortDays = 7, longDays = 30 } = {}) {
  const cards = progress?.errorCards || []
  let withRecurrence = 0
  let after7 = 0
  let after30 = 0
  for (const card of cards) {
    const history = Array.isArray(card.history) ? card.history : []
    if (history.length < 2) continue
    withRecurrence += 1
    let maxGapDays = 0
    for (let i = 1; i < history.length; i++) {
      const gapDays = (history[i] - history[i - 1]) / DAY
      if (gapDays > maxGapDays) maxGapDays = gapDays
    }
    if (maxGapDays >= shortDays) after7 += 1
    if (maxGapDays >= longDays) after30 += 1
  }
  return {
    totalCards: cards.length,
    withRecurrence,
    recurredAfter7Days: after7,
    recurredAfter30Days: after30,
  }
}

// ---------------------------------------------------------------------------
// §15.1 — Rappel sans aide
// ---------------------------------------------------------------------------
//
// S'appuie sur `helpUsed` (WriteView.vue, §7.2/7.4) : une production terminée
// SANS aucune aide progressive utilisée est un rappel plus fort qu'une
// production aidée. Ne compte que les événements où `helpUsed` est un
// tableau (les anciens événements sans ce champ sont ignorés, pas comptés
// comme « avec aide »).
export function recallWithoutHelpRate(progress) {
  const events = activityOf(progress).filter(
    (a) => a.skill === 'scrittura' && Array.isArray(a.helpUsed)
  )
  if (!events.length) return null
  const withoutHelp = events.filter((a) => a.helpUsed.length === 0)
  return withoutHelp.length / events.length
}

// ---------------------------------------------------------------------------
// §15.1 — Transfert (mot revu retrouvé en production)
// ---------------------------------------------------------------------------
//
// S'appuie sur `reuseWordsOffered`/`reuseWordsUsed` (WriteView.vue) : quand
// une production part de mots suggérés après une révision (§9.3), on compte
// seulement combien de ces mots réapparaissent dans le texte produit — jamais
// le texte lui-même.
export function transferRate(progress) {
  const events = activityOf(progress).filter(
    (a) => a.skill === 'scrittura' && (a.reuseWordsOffered || 0) > 0
  )
  if (!events.length) return null
  const offered = events.reduce((sum, a) => sum + a.reuseWordsOffered, 0)
  const used = events.reduce((sum, a) => sum + (a.reuseWordsUsed || 0), 0)
  return offered ? used / offered : null
}

// ---------------------------------------------------------------------------
// §15.1 — Écoute autonome
// ---------------------------------------------------------------------------
//
// S'appuie sur `textRevealed` (ReaderView.vue) : quiz d'écoute réussi (score
// ≥ seuil) alors que la transcription n'a jamais été affichée avant la fin du
// quiz. Ne compte que les événements en mode ascolto où `textRevealed` est
// renseigné (booléen).
export function autonomousListeningRate(progress, { successRatio = 0.6 } = {}) {
  const events = activityOf(progress).filter(
    (a) => a.skill === 'ascolto' && typeof a.textRevealed === 'boolean'
  )
  if (!events.length) return null
  const autonomous = events.filter((a) => {
    const ratio = a.total ? a.score / a.total : a.score || 0
    return ratio >= successRatio && a.textRevealed === false
  })
  return autonomous.length / events.length
}

// ---------------------------------------------------------------------------
// §15.1 — Dépendance aux aides (lecture)
// ---------------------------------------------------------------------------
//
// S'appuie sur `translatedWordsCount` (ReaderView.vue) : nombre de mots/
// phrases traduits pendant une lecture ou une écoute. Une dépendance
// décroissante entre deux fenêtres comparables (les `windowSize` derniers
// événements vs les `windowSize` précédents) indique une autonomie
// croissante — l'inverse mérite l'attention, sans jamais l'affirmer sur peu
// de données (voir `null` si une des deux fenêtres est vide).
export function readingHelpDependency(progress, { windowSize = 10 } = {}) {
  const events = activityOf(progress).filter(
    (a) => (a.skill === 'lettura' || a.skill === 'ascolto') && typeof a.translatedWordsCount === 'number'
  )
  if (events.length < 2) return { recentAvg: null, previousAvg: null, trend: null, sampleSize: events.length }
  const recent = events.slice(-windowSize)
  const previous = events.slice(-2 * windowSize, -windowSize)
  const avg = (list) => list.reduce((sum, a) => sum + a.translatedWordsCount, 0) / list.length
  const recentAvg = avg(recent)
  if (!previous.length) return { recentAvg, previousAvg: null, trend: null, sampleSize: events.length }
  const previousAvg = avg(previous)
  const delta = recentAvg - previousAvg
  const trend = Math.abs(delta) < 0.5 ? 'stable' : delta < 0 ? 'down' : 'up'
  return { recentAvg, previousAvg, trend, sampleSize: events.length }
}

// ---------------------------------------------------------------------------
// §15.1 — Achèvement de session
// ---------------------------------------------------------------------------
//
// S'appuie sur `progress.sessionLog` (progress.js#recordSessionStarted /
// #recordSessionCompleted, appelées par HomeView à chaque session composée
// du jour) : une entrée par jour calendaire où une session a démarré.
export function sessionCompletionRate(progress, { days = 30, now = Date.now() } = {}) {
  const since = now - days * DAY
  const log = (progress?.sessionLog || []).filter((e) => e.startedTs >= since)
  if (!log.length) return null
  const completed = log.filter((e) => e.completed).length
  return { started: log.length, completed, rate: completed / log.length }
}

// ---------------------------------------------------------------------------
// §10.2/10.3 — Confiance de la mesure et tendance à 4 semaines
// ---------------------------------------------------------------------------

// Trois paliers simples et transparents plutôt qu'un score continu qui
// donnerait une fausse impression de précision (§10.2).
export function confidenceLevel(sampleSize) {
  const n = sampleSize || 0
  if (n < 3) return 'faible'
  if (n < 10) return 'moyen'
  return 'suffisant'
}

// Tendance d'une compétence sur quatre semaines (§10.3) : compare le nombre
// d'activités des deux dernières semaines à celui des deux précédentes.
// `null` tant qu'il n'y a rien à comparer sur la fenêtre précédente — pas de
// tendance inventée à partir d'une seule mesure.
export function skillTrend(progress, skill, { now = Date.now() } = {}) {
  const events = activityOf(progress).filter((a) => a.skill === skill)
  const twoWeeks = 14 * DAY
  const recent = events.filter((a) => a.ts >= now - twoWeeks && a.ts <= now)
  const previous = events.filter((a) => a.ts >= now - 2 * twoWeeks && a.ts < now - twoWeeks)
  if (!previous.length) return { recentCount: recent.length, previousCount: previous.length, direction: null }
  const direction =
    recent.length === previous.length ? 'stable' : recent.length > previous.length ? 'up' : 'down'
  return { recentCount: recent.length, previousCount: previous.length, direction }
}
