#!/usr/bin/env node
// Backfill des explications de quiz sur le corpus statique src/texts/*.json :
// pour chaque texte dont les questions n'ont pas de champ "explanation",
// demande au LLM UNIQUEMENT les explications manquantes (même esprit que la
// passe de réparation REPAIR_SCHEMA de leggendo-server), puis réécrit le JSON.
//
// Idempotent : les textes dont toutes les questions ont déjà une explication
// sont sautés — le script peut être interrompu et relancé sans rejouer les
// appels déjà faits (chaque fichier est écrit dès que sa réponse arrive).
//
// Usage :
//   node scripts/backfill-quiz-explanations.mjs [--limit N] [--dry-run]
//
// La clé API vient de l'environnement (GLM_API_KEY), endpoint compatible
// OpenAI (DeepSeek en production) — voir scripts/lib/llm-openai.mjs.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { callLLM, requireApiKey } from './lib/llm-openai.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TEXTS_DIR = path.join(ROOT, 'src/texts')

// Taille des lots : les fichiers d'un même lot sont traités en parallèle,
// avec un log de progression entre chaque lot.
const BATCH_SIZE = 20

// --- Arguments ---
const args = { limit: Infinity, dryRun: false }
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a === '--limit') args.limit = Number(process.argv[++i])
  else if (a === '--dry-run') args.dryRun = true
  else {
    console.error(`Argument inconnu : ${a}`)
    console.error('Usage : node scripts/backfill-quiz-explanations.mjs [--limit N] [--dry-run]')
    process.exit(1)
  }
}
if (!Number.isFinite(args.limit) && process.argv.includes('--limit')) {
  console.error('--limit attend un nombre.')
  process.exit(1)
}

// DeepSeek ne supporte pas les structured outputs (json_schema strict) :
// le format attendu est décrit dans le system prompt et la réponse est
// validée côté script (validateExplanations), avec un retry par texte.
const SYSTEM = `Tu complètes les quiz de Leggendo, une application d'apprentissage de l'italien par la lecture destinée à des francophones. Chaque texte est en italien avec un quiz de compréhension ; tu dois ajouter, pour chaque question, une explication justifiant la bonne réponse.

Contraintes :
- Chaque "explanation" fait 1 phrase, en français simple (même registre que les traductions françaises de l'app).
- Elle justifie la bonne réponse en citant si possible le passage du texte concerné (ex. « Le texte dit "…" »).
- Renvoie une explication pour CHAQUE index demandé, avec l'index exact fourni.

Tu DOIS répondre avec un unique objet JSON valide, sans aucun texte avant ni après, exactement de cette forme :

{
  "explanations": [
    { "index": 0, "explanation": "…" },
    { "index": 2, "explanation": "…" }
  ]
}

- "index" : entier, l'index (0-based) de la question, recopié à l'identique depuis la demande.
- "explanation" : chaîne non vide, 1 phrase en français.
- Aucune autre clé, pas de balises markdown (pas de \`\`\`), juste le JSON brut.`

// Valide la réponse du modèle : un objet { explanations: [...] } couvrant
// chaque index demandé avec une explication non vide. Renvoie une Map
// index → explanation, ou lève une erreur décrivant le problème.
function validateExplanations(out, missing) {
  if (!out || !Array.isArray(out.explanations)) {
    throw new Error('réponse sans tableau "explanations"')
  }
  const byIndex = new Map()
  for (const e of out.explanations) {
    if (!e || !Number.isInteger(e.index)) {
      throw new Error(`entrée sans index entier : ${JSON.stringify(e).slice(0, 100)}`)
    }
    if (typeof e.explanation !== 'string' || !e.explanation.trim()) {
      throw new Error(`explication manquante ou vide pour la question ${e.index}`)
    }
    byIndex.set(e.index, e.explanation.trim())
  }
  for (const i of missing) {
    if (!byIndex.has(i)) throw new Error(`explication manquante ou vide pour la question ${i}`)
  }
  return byIndex
}

const hasExplanation = (q) =>
  typeof q.explanation === 'string' && q.explanation.trim().length > 0

// Indices des questions sans explication (vide = texte déjà backfillé).
function missingIndices(textData) {
  return (textData.questions ?? [])
    .map((q, i) => (hasExplanation(q) ? null : i))
    .filter((i) => i !== null)
}

// Backfill d'un texte : appelle le LLM pour les seules questions sans
// explication, valide la réponse, écrit le fichier. Renvoie true si OK.
async function backfillText(file) {
  const textData = JSON.parse(fs.readFileSync(file, 'utf8'))
  const missing = missingIndices(textData)
  if (!missing.length) return true

  const questionBlock = missing
    .map((i) => {
      const q = textData.questions[i]
      return `Question ${i} : ${q.q}\nBonne réponse : ${q.options[q.correct]}`
    })
    .join('\n\n')

  const prompt = `Voici un texte italien (« ${textData.title} », niveau ${textData.level}) :\n\n${textData.paragraphs.join('\n\n')}\n\nVoici les questions du quiz avec leur bonne réponse. Pour chaque question, écris l'explication (1 phrase en français) qui justifie la bonne réponse :\n\n${questionBlock}`

  // Sans structured outputs, une réponse peut être mal formée : on retente
  // une fois avant de compter le texte en échec (repris à la relance).
  let byIndex
  for (let attempt = 1; ; attempt++) {
    const out = await callLLM({ system: SYSTEM, prompt, maxTokens: 4000 })
    try {
      byIndex = validateExplanations(out, missing)
      break
    } catch (err) {
      if (attempt >= 2) throw err
      console.warn(`  ⚠ ${path.relative(ROOT, file)} : ${err.message} — nouvel essai…`)
    }
  }
  for (const i of missing) {
    textData.questions[i].explanation = byIndex.get(i)
  }

  fs.writeFileSync(file, JSON.stringify(textData, null, 2) + '\n')
  return true
}

// --- Programme principal ---

const allFiles = fs
  .readdirSync(TEXTS_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => path.join(TEXTS_DIR, f))

const pending = allFiles.filter((file) => {
  const textData = JSON.parse(fs.readFileSync(file, 'utf8'))
  return missingIndices(textData).length > 0
})

console.log(
  `${allFiles.length} texte(s) dans src/texts, ${pending.length} à backfiller` +
    (Number.isFinite(args.limit) ? ` (limite : ${args.limit})` : '')
)

const todo = pending.slice(0, args.limit)

if (args.dryRun) {
  for (const file of todo) console.log(`  → ${path.relative(ROOT, file)}`)
  console.log(`Dry-run : aucun appel API. ${todo.length} texte(s) seraient traités.`)
  process.exit(0)
}

if (!todo.length) {
  console.log('Rien à faire — corpus déjà backfillé.')
  process.exit(0)
}

// Des appels API vont partir : la clé est requise (pas en dry-run ci-dessus).
requireApiKey()

let done = 0
let failed = 0
for (let start = 0; start < todo.length; start += BATCH_SIZE) {
  const batch = todo.slice(start, start + BATCH_SIZE)
  const results = await Promise.allSettled(
    batch.map(async (file) => {
      await backfillText(file)
      console.log(`  ✓ ${path.relative(ROOT, file)}`)
    })
  )
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') done++
    else {
      failed++
      console.error(`  ✗ ${path.relative(ROOT, batch[i])} : ${r.reason?.message ?? r.reason}`)
    }
  }
  console.log(`Progression : ${done + failed}/${todo.length} (${failed} échec(s))`)
}

if (failed) {
  console.error(`Terminé avec ${failed} échec(s) — relance le script pour reprendre.`)
  process.exit(1)
}
console.log(`✓ ${done} texte(s) backfillé(s).`)
