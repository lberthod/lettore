// Client minimal pour un endpoint chat completions compatible OpenAI
// (DeepSeek en production). Même famille de variables d'environnement que
// leggendo-server/llm.mjs (noms GLM_* conservés par compatibilité) :
//
//   GLM_API_KEY   (obligatoire)
//   GLM_BASE_URL  (défaut : https://api.deepseek.com/chat/completions)
//   GLM_MODEL     (défaut : deepseek-v4-flash)
//
// Basé sur fetch natif (Node ≥ 18), aucune dépendance npm — les scripts de
// backfill doivent tourner sur un serveur sans node_modules.

export const GLM_API_KEY = process.env.GLM_API_KEY || ''
export const GLM_MODEL = process.env.GLM_MODEL || 'deepseek-v4-flash'
export const GLM_BASE_URL = process.env.GLM_BASE_URL || 'https://api.deepseek.com/chat/completions'
const TIMEOUT_MS = Number(process.env.GLM_TIMEOUT_MS || 120_000)
const MAX_ATTEMPTS = 3

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Message d'erreur clair si la clé manque — à appeler avant tout appel réseau
// (le dry-run des scripts ne doit pas exiger la clé).
export function requireApiKey() {
  if (!GLM_API_KEY) {
    console.error(
      'GLM_API_KEY manquante. Exporte la clé API DeepSeek : export GLM_API_KEY=sk-…\n' +
        '(GLM_BASE_URL et GLM_MODEL sont optionnelles, défauts : ' +
        `${GLM_BASE_URL} / ${GLM_MODEL})`
    )
    process.exit(1)
  }
}

// Extrait le premier objet JSON valide de la réponse (au cas où le modèle
// entoure sa sortie de texte ou de ```json ... ```).
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Réponse sans JSON exploitable : ${text.slice(0, 200)}…`)
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch (err) {
    throw new Error(`JSON invalide dans la réponse (${err.message}) : ${candidate.slice(start, start + 200)}…`)
  }
}

// Appel chat completions : system + user, response_format json_object,
// 3 tentatives avec backoff. Renvoie l'objet JSON parsé ; `onUsage(usage)`
// est appelé avec les tokens consommés après chaque réponse réussie.
// `thinking` (optionnel) : passer 'disabled' pour couper le mode réflexion de
// DeepSeek (actif par défaut) — voir leggendo-server/llm.mjs pour le même
// paramètre. Sur une tâche de classification/explication courte (repérer un
// registre de langue, justifier une réponse de quiz en 1 phrase), testé sur
// leggendo-server/correct.mjs (tâche équivalente) : mêmes résultats, -81 %
// de tokens de sortie. Non re-testé isolément ici (scripts de backfill,
// exécutés ponctuellement, pas un coût récurrent), mais appliqué par
// analogie directe.
export async function callLLM({ system, prompt, maxTokens = 8000, onUsage, thinking }) {
  if (!GLM_API_KEY) {
    throw new Error('GLM_API_KEY manquante (export GLM_API_KEY=...).')
  }

  let lastError
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(GLM_BASE_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: GLM_MODEL,
          max_tokens: maxTokens,
          temperature: 0.7,
          response_format: { type: 'json_object' },
          ...(thinking ? { thinking: { type: thinking } } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        }),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`API ${res.status} : ${body.slice(0, 300)}`)
      }

      const data = await res.json()
      const u = data.usage
      if (u) onUsage?.(u)
      const choice = data.choices?.[0]
      if (!choice) {
        throw new Error(`Réponse inattendue : ${JSON.stringify(data).slice(0, 300)}`)
      }
      if (choice.finish_reason === 'length') {
        throw new Error(`Sortie tronquée (max_tokens=${maxTokens} atteint).`)
      }
      return extractJson(choice.message?.content ?? '')
    } catch (err) {
      lastError = err
      if (attempt < MAX_ATTEMPTS) {
        const wait = attempt * 10_000
        console.warn(`  ⚠ ${err.message} — nouvel essai dans ${wait / 1000}s…`)
        await sleep(wait)
      }
    }
  }
  throw lastError
}
