// Appels à l'API GLM (Zhipu AI / Z.ai), endpoint chat completions compatible
// OpenAI. Copie autonome de generator/lib/llm.mjs, configurée par variables
// d'environnement (le dossier leggendo/ part seul sur le VPS).

export const GLM_API_KEY = process.env.GLM_API_KEY || ''
export const GLM_MODEL = process.env.GLM_MODEL || 'glm-5.1'
export const GLM_BASE_URL =
  process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
// Un appel qui pend sans timeout bloque le job « running » pour toujours
// (et avec lui le verrou un-job-par-compte) : on coupe au bout de 8 minutes.
export const GLM_TIMEOUT_MS = Number(process.env.GLM_TIMEOUT_MS || 8 * 60 * 1000)
// La connectivité vers open.bigmodel.cn (Chine) est parfois coupée depuis le
// VPS : en cas d'erreur réseau, on bascule sur l'endpoint international
// (même clé, mêmes modèles) pour la tentative suivante.
export const GLM_FALLBACK_URL =
  process.env.GLM_FALLBACK_URL || 'https://api.z.ai/api/paas/v4/chat/completions'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Extrait le premier objet JSON valide d'une réponse (au cas où le modèle
// entoure sa sortie de texte ou de ```json ... ```).
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Réponse sans JSON exploitable : ${text.slice(0, 200)}…`)
  }
  return JSON.parse(candidate.slice(start, end + 1))
}

// `onUsage(usage)` est appelé après chaque réponse réussie du modèle, avec
// les tokens consommés — sert à mesurer le coût réel d'une génération
// (README_TARIFICATION.md, § Mesure des coûts IA). Les tentatives qui
// échouent avant d'obtenir de réponse ne sont pas comptées (pas de usage
// disponible).
export async function callLLM({ system, prompt, schema, maxTokens = 8000, onUsage }) {
  if (!GLM_API_KEY) {
    throw new Error('GLM_API_KEY manquante (export GLM_API_KEY=...).')
  }

  const fullSystem = `${system}

Tu DOIS répondre avec un unique objet JSON valide, sans aucun texte avant ni après, conforme exactement à ce schéma JSON Schema :

${JSON.stringify(schema, null, 2)}

Ne mets pas de balises markdown (pas de \`\`\`), juste le JSON brut.`

  const endpoints = [...new Set([GLM_BASE_URL, GLM_FALLBACK_URL])]
  let endpointIndex = 0
  let lastError
  let currentMaxTokens = maxTokens
  for (let attempt = 1; attempt <= 4; attempt++) {
    const endpoint = endpoints[endpointIndex]
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(GLM_TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: GLM_MODEL,
          max_tokens: currentMaxTokens,
          temperature: 0.7,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: fullSystem },
            { role: 'user', content: prompt },
          ],
        }),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`GLM API ${res.status} : ${body.slice(0, 300)}`)
      }

      const data = await res.json()
      // Suivi du coût : tokens réellement consommés par appel.
      const u = data.usage
      if (u) {
        console.log(
          `  usage : in=${u.prompt_tokens} out=${u.completion_tokens} total=${u.total_tokens}`
        )
        onUsage?.(u)
      }
      const choice = data.choices?.[0]
      if (!choice) throw new Error(`Réponse GLM inattendue : ${JSON.stringify(data).slice(0, 300)}`)
      if (choice.finish_reason === 'length') {
        throw new Error(`Sortie tronquée (max_tokens=${currentMaxTokens} atteint).`)
      }

      const text = choice.message?.content ?? ''
      return extractJson(text)
    } catch (err) {
      lastError = err
      if (attempt < 4) {
        // Une troncature ne se résout pas en retentant à l'identique : on
        // augmente le budget avant de réessayer (retry classique sinon).
        const wasTruncated = /Sortie tronquée/.test(err.message)
        // Erreur réseau (endpoint injoignable) : on bascule sur l'endpoint
        // suivant sans longue attente — inutile d'insister sur un hôte mort.
        const isNetwork = /fetch failed|aborted|timeout/i.test(err.message)
        if (wasTruncated) {
          currentMaxTokens = Math.min(64000, Math.round(currentMaxTokens * 1.6))
          console.warn(`  ⚠ ${err.message} — nouvel essai avec max_tokens=${currentMaxTokens}…`)
        } else if (isNetwork && endpoints.length > 1) {
          endpointIndex = (endpointIndex + 1) % endpoints.length
          console.warn(
            `  ⚠ ${err.message} sur ${endpoint} — bascule vers ${endpoints[endpointIndex]}…`
          )
        } else {
          const wait = attempt * 15000
          console.warn(`  ⚠ ${err.message} — nouvel essai dans ${wait / 1000}s…`)
          await sleep(wait)
        }
      }
    }
  }
  throw lastError
}
