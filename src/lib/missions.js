// Missions courtes (IntegartioNOptimsaitonPedago.MD §11.2) : quelques
// objectifs concrets, dérivés d'événements déjà journalisés — jamais de
// points par clic, de classement ni de récompense aléatoire (§11.3). Une
// mission est simplement « faite » ou « pas encore faite » aujourd'hui ;
// rater une journée ne coûte rien.

const DAY = 24 * 60 * 60 * 1000

function startOfDay(now) {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// Chaque mission reconnaît un événement du journal d'activité déjà produit
// ailleurs dans l'app (ReaderView, WriteView/DialogueView via CorrectionRetry,
// WordsView) — aucun nouveau champ de tracking dédié aux missions.
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

// État du jour pour chaque mission : { id, label, done }. Se recalcule
// entièrement à chaque appel (rien à persister) et repart naturellement à
// zéro chaque jour calendaire local — pas de série à casser (§11.3).
export function missionsToday(progress, now = Date.now()) {
  const today = startOfDay(now)
  const tomorrow = today + DAY
  const todaysActivity = (progress?.activity || []).filter(
    (a) => a.ts >= today && a.ts < tomorrow
  )
  return MISSIONS.map((m) => ({
    id: m.id,
    label: m.label,
    done: todaysActivity.some((a) => m.match(a)),
  }))
}
