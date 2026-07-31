// Client de la correction pédagogique (POST /leggendo/correct, Phase 5) —
// même API VPS que la génération (generation.js : API_BASE, en-têtes auth +
// App Check), mais synchrone : pas de job à sonder, la réponse contient
// directement { corrected, errors, level_estimate }.

import { API_BASE, apiHeaders } from './generation.js'
import { networkErrorMessage } from './network.js'

// Aligné sur leggendo-server/validate.mjs (CORRECTION_MAX_CHARS) : le
// compteur de la vue et la validation serveur racontent la même chose.
export const CORRECTION_MAX_CHARS = 2000

// Erreur porteuse du statut HTTP : la vue distingue le quota épuisé / rôle
// insuffisant (429) d'un échec technique (5xx) pour adapter son message.
export class CorrectionError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export async function correctText(text) {
  const headers = await apiHeaders({ 'Content-Type': 'application/json' })
  if (!headers) {
    throw new CorrectionError('Connectez-vous pour faire corriger un texte.', 401)
  }
  let res
  try {
    res = await fetch(`${API_BASE}/correct`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text }),
    })
  } catch (err) {
    throw new CorrectionError(networkErrorMessage(err) || err.message, 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new CorrectionError(data.error || `Erreur ${res.status}`, res.status)
  }
  return data
}

// Taxonomie (GET /leggendo/taxonomy, endpoint public) : sert de vivier de
// suggestions de sujet dans WriteView. null en cas d'échec — la suggestion
// est optionnelle, la vue dégrade sans elle.
export async function fetchTaxonomy() {
  try {
    const res = await fetch(`${API_BASE}/taxonomy`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
