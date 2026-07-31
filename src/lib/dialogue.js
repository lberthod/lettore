// Client du dialogue simulé (Phase 7) — même API VPS que la génération et la
// correction (generation.js : API_BASE, en-têtes auth + App Check), synchrone
// (réponses courtes). Quatre routes : ouverture de session, tour suivant,
// clôture (bilan) et reprise après rechargement.

import { API_BASE, apiHeaders } from './generation.js'
import { networkErrorMessage } from './network.js'

// Alignés sur leggendo-server (validate.mjs / quota.mjs) : le compteur de la
// vue et la validation serveur racontent la même chose.
export const DIALOGUE_MAX_CHARS = 500
export const DIALOGUE_COST = 2
export const MAX_DIALOGUE_TURNS = 12

// Métadonnées d'affichage des scénarios (cartes de DialogueView). Dupliquées
// depuis leggendo-server/dialogue.mjs, qui reste la source de vérité : les
// prompts de rôle ne vivent que côté serveur, et un identifiant inconnu ici
// serait de toute façon refusé par parseDialogueRequest.
export const SCENARIOS = [
  {
    id: 'al_bar',
    icon: '☕',
    title: 'Al bar',
    description: 'Commander un caffè et faire deux mots de conversation avec le barista.',
    level: 'A1',
  },
  {
    id: 'in_stazione',
    icon: '🚆',
    title: 'In stazione',
    description: 'Acheter un billet de train au guichet : horaires, quai, changements.',
    level: 'A2',
  },
  {
    id: 'al_mercato',
    icon: '🍅',
    title: 'Al mercato',
    description: 'Faire ses courses au marché : quantités, prix, un peu de marchandage.',
    level: 'A2',
  },
  {
    id: 'dal_medico',
    icon: '🩺',
    title: 'Dal medico',
    description: 'Décrire ses symptômes au médecin et comprendre ses conseils.',
    level: 'B1',
  },
  {
    id: 'in_albergo',
    icon: '🛎️',
    title: 'In albergo',
    description: "S'enregistrer à la réception d'un hôtel et poser des questions pratiques.",
    level: 'B1',
  },
]

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1']

// Erreur porteuse du statut HTTP (pattern CorrectionError) : la vue distingue
// le quota/rôle insuffisant (429), la session terminée ou le plafond de tours
// (409, drapeau `limitReached`), la session perdue (404) et l'échec technique
// (5xx) pour adapter son message.
export class DialogueError extends Error {
  constructor(message, status, limitReached = false) {
    super(message)
    this.status = status
    this.limitReached = limitReached
  }
}

async function callDialogueApi(path, { method = 'GET', body } = {}) {
  const headers = await apiHeaders(body ? { 'Content-Type': 'application/json' } : undefined)
  if (!headers) {
    throw new DialogueError('Connectez-vous pour dialoguer.', 401)
  }
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch (err) {
    throw new DialogueError(networkErrorMessage(err) || err.message, 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new DialogueError(data.error || `Erreur ${res.status}`, res.status, Boolean(data.limitReached))
  }
  return data
}

// Ouvre une session (2 crédits) : { sessionId, reply, suggested_replies, turnsLeft }.
export function startDialogue(scenario, level) {
  return callDialogueApi('/dialogue', { method: 'POST', body: { scenario, level } })
}

// Tour suivant : { reply, suggested_replies, done, turnsLeft }.
export function sendDialogueTurn(sessionId, text) {
  return callDialogueApi(`/dialogue/${sessionId}/turn`, { method: 'POST', body: { text } })
}

// Clôture et bilan : { feedback: [{ original, better, explanation }] }.
// Idempotent côté serveur : re-clore une session close renvoie son bilan.
export function closeDialogue(sessionId) {
  return callDialogueApi(`/dialogue/${sessionId}/close`, { method: 'POST', body: {} })
}

// Reprise après rechargement : { scenario, level, status, turns,
// suggested_replies, feedback, turnsLeft }.
export function fetchDialogue(sessionId) {
  return callDialogueApi(`/dialogue/${sessionId}`)
}

// --- Session en cours persistée localement (pattern generation.js) ---
// Seul l'identifiant est stocké : l'historique fait foi côté serveur
// (GET /dialogue/:id), qui ne le remet qu'au propriétaire authentifié.
const STORAGE_KEY = 'leggendo-dialogue-session'

export function saveSessionId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Stockage indisponible (navigation privée) : pas de reprise, sans plus.
  }
}

export function loadSessionId() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null
  } catch {
    return null
  }
}

export function clearSessionId() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // rien à nettoyer
  }
}
