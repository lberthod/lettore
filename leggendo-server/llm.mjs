// Appels à l'API GLM (Zhipu AI / Z.ai), endpoint chat completions compatible
// OpenAI. Copie autonome de generator/lib/llm.mjs, configurée par variables
// d'environnement (le dossier leggendo/ part seul sur le VPS).

export const GLM_API_KEY = process.env.GLM_API_KEY || ''
export const GLM_MODEL = process.env.GLM_MODEL || 'glm-5.1'
export const GLM_BASE_URL =
  process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

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

export async function callLLM({ system, prompt, schema, maxTokens = 8000 }) {
  if (!GLM_API_KEY) {
    throw new Error('GLM_API_KEY manquante (export GLM_API_KEY=...).')
  }

  const fullSystem = `${system}

Tu DOIS répondre avec un unique objet JSON valide, sans aucun texte avant ni après, conforme exactement à ce schéma JSON Schema :

${JSON.stringify(schema, null, 2)}

Ne mets pas de balises markdown (pas de \`\`\`), juste le JSON brut.`

  let lastError
  let currentMaxTokens = maxTokens
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(GLM_BASE_URL, {
        method: 'POST',
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
      const choice = data.choices?.[0]
      if (!choice) throw new Error(`Réponse GLM inattendue : ${JSON.stringify(data).slice(0, 300)}`)
      if (choice.finish_reason === 'length') {
        throw new Error(`Sortie tronquée (max_tokens=${currentMaxTokens} atteint).`)
      }

      const text = choice.message?.content ?? ''
      return extractJson(text)
    } catch (err) {
      lastError = err
      if (attempt < 3) {
        // Une troncature ne se résout pas en retentant à l'identique : on
        // augmente le budget avant de réessayer (retry classique sinon).
        const wasTruncated = /Sortie tronquée/.test(err.message)
        if (wasTruncated) {
          currentMaxTokens = Math.min(64000, Math.round(currentMaxTokens * 1.6))
          console.warn(`  ⚠ ${err.message} — nouvel essai avec max_tokens=${currentMaxTokens}…`)
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
