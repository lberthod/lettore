#!/usr/bin/env node
// Backfill du registre de langue sur le dictionnaire (src/dictionary/lemmas/*.json) :
// pour chaque lemme sans champ "register", demande au LLM par lots son registre
// (formale | neutro | informale | letterario | dialettale) et n'écrit QUE les
// valeurs marquées ("neutro" = champ absent : la grande majorité des mots sont
// neutres, inutile de gonfler les shards avec un champ implicite).
//
// Par défaut, seuls les lemmes réellement présents dans le corpus sont ciblés
// (via scripts/data/dictionary-words.json produit par extract-dictionary-words.mjs,
// résolu vers les lemmes par le word-index) ; --all étend à tout le dictionnaire.
//
// Idempotent : les entrées ayant déjà "register" sont sautées, les lemmes
// confirmés neutres sont notés dans scripts/data/register-neutral.json (même
// esprit que skipped-words.json : sans cette trace, "neutro" = champ absent
// serait re-demandé à chaque exécution), et les shards sont réécrits après
// chaque lot — le script peut être interrompu et relancé sans rejouer les
// appels déjà faits.
//
// Usage :
//   node scripts/backfill-dictionary-register.mjs [--all] [--limit N] [--dry-run]
//
// La clé API vient de l'environnement (ANTHROPIC_API_KEY), comme pour
// scripts/backfill-quiz-explanations.mjs.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { loadShardedDictionary, writeLemmaShards } from './dictionary-shards.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const CORPUS_WORDS_PATH = path.join(ROOT, 'scripts', 'data', 'dictionary-words.json')
// Lemmes déjà classés "neutro" (champ absent des shards par design) : sans
// cette trace, ils seraient re-soumis au LLM à chaque exécution.
const NEUTRAL_PATH = path.join(ROOT, 'scripts', 'data', 'register-neutral.json')

const MODEL = 'claude-opus-4-8'
// Lemmes par appel LLM : la classification est courte (un mot par ligne en
// entrée, un couple lemme/registre en sortie), on peut charger les lots.
const BATCH_SIZE = 50

// Seules valeurs écrites dans les shards. "neutro" est une réponse valide du
// modèle mais ne s'écrit jamais (champ absent = neutro implicite).
const MARKED_REGISTERS = new Set(['formale', 'informale', 'letterario', 'dialettale'])

// --- Arguments ---
const args = { all: false, limit: Infinity, dryRun: false }
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a === '--all') args.all = true
  else if (a === '--limit') args.limit = Number(process.argv[++i])
  else if (a === '--dry-run') args.dryRun = true
  else {
    console.error(`Argument inconnu : ${a}`)
    console.error('Usage : node scripts/backfill-dictionary-register.mjs [--all] [--limit N] [--dry-run]')
    process.exit(1)
  }
}
if (!Number.isFinite(args.limit) && process.argv.includes('--limit')) {
  console.error('--limit attend un nombre.')
  process.exit(1)
}

// Sortie attendue du modèle : un registre par lemme, repéré par le lemme
// lui-même (plus robuste qu'un tableau ordonné si le modèle réordonne).
const REGISTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['registers'],
  properties: {
    registers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['lemma', 'register'],
        properties: {
          lemma: { type: 'string', description: 'Le lemme, recopié à l’identique depuis la liste fournie' },
          register: {
            type: 'string',
            enum: ['formale', 'neutro', 'informale', 'letterario', 'dialettale'],
          },
        },
      },
    },
  },
}

const SYSTEM = `Tu es lexicographe pour Leggendo, un dictionnaire italien-français destiné à des apprenants francophones. Pour chaque lemme fourni (avec sa nature grammaticale et sa définition), indique son registre de langue en italien contemporain :

- "neutro" : registre courant, utilisable dans tout contexte — c'est la réponse pour la GRANDE MAJORITÉ des mots. En cas de doute, réponds "neutro".
- "formale" : registre soutenu/administratif, marqué comme formel à l'oral courant (ex. "recarsi", "codesto").
- "informale" : familier/colloquial, déplacé dans un contexte formel (ex. "fregarsene", "boh").
- "letterario" : littéraire/archaïque, rencontré surtout dans les textes littéraires (ex. "alfine", "desco", "favella").
- "dialettale" : dialectal/régional, non standard (ex. "picciotto", "gnocco" au sens régional).

Contraintes :
- Réponds pour CHAQUE lemme demandé, en recopiant le lemme à l'identique.
- Juge le mot dans son sens donné par la définition fournie, pas dans d'autres sens possibles.
- N'invente pas de marquage : un mot simplement rare ou technique reste "neutro".`

let client = null
function getClient() {
  if (!client) client = new Anthropic()
  return client
}

async function callClaude(prompt) {
  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: REGISTER_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  })
  const msg = await stream.finalMessage()
  if (msg.stop_reason === 'refusal') {
    throw new Error('Requête refusée par les classificateurs de sécurité.')
  }
  if (msg.stop_reason === 'max_tokens') {
    throw new Error('Sortie tronquée (max_tokens atteint).')
  }
  const text = msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return JSON.parse(text)
}

// --- Sélection des lemmes cibles ---

const { lemmas, wordIndex } = loadShardedDictionary()

let targetLemmas
if (args.all) {
  targetLemmas = Object.keys(lemmas)
} else {
  // Cible corpus : les mots des textes/livres (extract-dictionary-words.mjs),
  // résolus vers leur lemme via le word-index. Régénère la liste si absente
  // (le script d'extraction est purement local, aucun appel LLM).
  if (!existsSync(CORPUS_WORDS_PATH)) {
    console.log('scripts/data/dictionary-words.json absent — extraction du corpus…')
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'extract-dictionary-words.mjs')], {
      stdio: 'inherit',
    })
  }
  const corpusWords = JSON.parse(readFileSync(CORPUS_WORDS_PATH, 'utf8'))
  const set = new Set()
  for (const { word } of corpusWords) {
    const lemma = wordIndex[word]
    if (lemma && lemmas[lemma]) set.add(lemma)
  }
  targetLemmas = [...set]
}
targetLemmas.sort((a, b) => a.localeCompare(b, 'it'))

const neutralLemmas = new Set(
  existsSync(NEUTRAL_PATH) ? JSON.parse(readFileSync(NEUTRAL_PATH, 'utf8')) : []
)

const pending = targetLemmas.filter(
  (l) => lemmas[l].register === undefined && !neutralLemmas.has(l)
)

console.log(
  `${args.all ? 'Dictionnaire entier' : 'Lemmes du corpus'} : ${targetLemmas.length} lemme(s), ` +
    `${pending.length} sans registre` +
    (Number.isFinite(args.limit) ? ` (limite : ${args.limit})` : '')
)

const todo = pending.slice(0, args.limit)

if (args.dryRun) {
  const preview = todo.slice(0, 20)
  for (const l of preview) console.log(`  → ${l} (${lemmas[l].pos})`)
  if (todo.length > preview.length) console.log(`  … et ${todo.length - preview.length} autre(s)`)
  console.log(
    `Dry-run : aucun appel API. ${todo.length} lemme(s) seraient traités en ${Math.ceil(todo.length / BATCH_SIZE)} lot(s) de ${BATCH_SIZE}.`
  )
  process.exit(0)
}

if (!todo.length) {
  console.log('Rien à faire — tous les lemmes ciblés ont déjà un registre.')
  process.exit(0)
}

// --- Boucle par lots, écriture des shards après chaque lot (reprise) ---

let done = 0
let marked = 0
let failed = 0
for (let start = 0; start < todo.length; start += BATCH_SIZE) {
  const batch = todo.slice(start, start + BATCH_SIZE)
  const wordBlock = batch
    .map((l) => {
      const e = lemmas[l]
      return `- ${e.lemma} (${e.pos}) : ${e.definition_it}`
    })
    .join('\n')

  try {
    const out = await callClaude(
      `Indique le registre de langue de chacun de ces ${batch.length} lemmes italiens :\n\n${wordBlock}`
    )
    const byLemma = new Map(out.registers.map((r) => [r.lemma, r.register]))
    let batchMarked = 0
    for (const l of batch) {
      const register = byLemma.get(l)
      if (register === undefined) {
        throw new Error(`registre manquant pour "${l}"`)
      }
      if (MARKED_REGISTERS.has(register)) {
        lemmas[l].register = register
        batchMarked++
      } else if (register === 'neutro') {
        // Champ absent des shards par design ; on trace le lemme pour ne pas
        // le re-soumettre aux prochaines exécutions.
        neutralLemmas.add(l)
      } else {
        throw new Error(`registre inattendu "${register}" pour "${l}"`)
      }
    }
    if (batchMarked > 0) writeLemmaShards(lemmas)
    writeFileSync(NEUTRAL_PATH, JSON.stringify([...neutralLemmas].sort(), null, 2) + '\n')
    done += batch.length
    marked += batchMarked
  } catch (err) {
    failed += batch.length
    console.error(`  ✗ lot ${start / BATCH_SIZE + 1} (${batch[0]}…) : ${err?.message ?? err}`)
  }
  console.log(`Progression : ${done + failed}/${todo.length} (${marked} marqué(s), ${failed} en échec)`)
}

if (failed) {
  console.error(`Terminé avec ${failed} lemme(s) en échec — relance le script pour reprendre.`)
  process.exit(1)
}
console.log(`✓ ${done} lemme(s) classé(s), ${marked} registre(s) marqué(s) écrits dans les shards.`)
