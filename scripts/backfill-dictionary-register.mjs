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
// La clé API vient de l'environnement (GLM_API_KEY), endpoint compatible
// OpenAI (DeepSeek en production) — voir scripts/lib/llm-openai.mjs.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { callLLM, requireApiKey } from './lib/llm-openai.mjs'
import { loadShardedDictionary, writeLemmaShards } from './dictionary-shards.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const CORPUS_WORDS_PATH = path.join(ROOT, 'scripts', 'data', 'dictionary-words.json')
// Lemmes déjà classés "neutro" (champ absent des shards par design) : sans
// cette trace, ils seraient re-soumis au LLM à chaque exécution.
const NEUTRAL_PATH = path.join(ROOT, 'scripts', 'data', 'register-neutral.json')

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

// DeepSeek ne supporte pas les structured outputs (json_schema strict) :
// le format attendu est décrit dans le system prompt et la réponse est
// validée côté script (validateRegisters), avec un retry par lot.
const ALL_REGISTERS = new Set(['formale', 'neutro', 'informale', 'letterario', 'dialettale'])

const SYSTEM = `Tu es lexicographe pour Leggendo, un dictionnaire italien-français destiné à des apprenants francophones. Pour chaque lemme fourni (avec sa nature grammaticale et sa définition), indique son registre de langue en italien contemporain :

- "neutro" : registre courant, utilisable dans tout contexte — c'est la réponse pour la GRANDE MAJORITÉ des mots. En cas de doute, réponds "neutro".
- "formale" : registre soutenu/administratif, marqué comme formel à l'oral courant (ex. "recarsi", "codesto").
- "informale" : familier/colloquial, déplacé dans un contexte formel (ex. "fregarsene", "boh").
- "letterario" : littéraire/archaïque, rencontré surtout dans les textes littéraires (ex. "alfine", "desco", "favella").
- "dialettale" : dialectal/régional, non standard (ex. "picciotto", "gnocco" au sens régional).

Contraintes :
- Réponds pour CHAQUE lemme demandé, en recopiant le lemme à l'identique.
- Juge le mot dans son sens donné par la définition fournie, pas dans d'autres sens possibles.
- N'invente pas de marquage : un mot simplement rare ou technique reste "neutro".

Tu DOIS répondre avec un unique objet JSON valide, sans aucun texte avant ni après, exactement de cette forme :

{
  "registers": [
    { "lemma": "recarsi", "register": "formale" },
    { "lemma": "casa", "register": "neutro" }
  ]
}

- "lemma" : le lemme, recopié à l'identique depuis la liste fournie.
- "register" : exactement une de ces 5 valeurs : "formale", "neutro", "informale", "letterario", "dialettale".
- Aucune autre clé, pas de balises markdown (pas de \`\`\`), juste le JSON brut.`

// Valide la réponse du modèle : un objet { registers: [...] } couvrant chaque
// lemme du lot avec un registre parmi les 5 valeurs attendues. Renvoie une
// Map lemme → registre, ou lève une erreur décrivant le problème.
function validateRegisters(out, batch) {
  if (!out || !Array.isArray(out.registers)) {
    throw new Error('réponse sans tableau "registers"')
  }
  const byLemma = new Map()
  for (const r of out.registers) {
    if (!r || typeof r.lemma !== 'string') {
      throw new Error(`entrée sans lemme : ${JSON.stringify(r).slice(0, 100)}`)
    }
    if (!ALL_REGISTERS.has(r.register)) {
      throw new Error(`registre inattendu "${r.register}" pour "${r.lemma}"`)
    }
    byLemma.set(r.lemma, r.register)
  }
  for (const l of batch) {
    if (!byLemma.has(l)) throw new Error(`registre manquant pour "${l}"`)
  }
  return byLemma
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

// Des appels API vont partir : la clé est requise (pas en dry-run ci-dessus).
requireApiKey()

// --- Boucle par lots, écriture des shards après chaque lot (reprise) ---

let done = 0
let marked = 0
let failed = 0
// Lots traités en parallèle (CONCURRENCY appels LLM en vol) ; les mutations de
// `lemmas` et les écritures de shards restent séquentielles dans l'event loop.
const CONCURRENCY = 6
const batches = []
for (let start = 0; start < todo.length; start += BATCH_SIZE) {
  batches.push({ index: start / BATCH_SIZE + 1, batch: todo.slice(start, start + BATCH_SIZE) })
}
let cursor = 0
async function worker() {
  while (cursor < batches.length) {
    const { index, batch } = batches[cursor++]
    const wordBlock = batch
      .map((l) => {
        const e = lemmas[l]
        return `- ${e.lemma} (${e.pos}) : ${e.definition_it}`
      })
      .join('\n')

    try {
      const prompt = `Indique le registre de langue de chacun de ces ${batch.length} lemmes italiens :\n\n${wordBlock}`
      // Sans structured outputs, une réponse peut être mal formée : on retente
      // le lot une fois avant de le compter en échec (repris à la relance).
      let byLemma
      for (let attempt = 1; ; attempt++) {
        const out = await callLLM({ system: SYSTEM, prompt, maxTokens: 16000, thinking: 'disabled' })
        try {
          byLemma = validateRegisters(out, batch)
          break
        } catch (err) {
          if (attempt >= 2) throw err
          console.warn(`  ⚠ lot ${index} : ${err.message} — nouvel essai…`)
        }
      }
      let batchMarked = 0
      for (const l of batch) {
        const register = byLemma.get(l)
        if (MARKED_REGISTERS.has(register)) {
          lemmas[l].register = register
          batchMarked++
        } else {
          // "neutro" : champ absent des shards par design ; on trace le lemme
          // pour ne pas le re-soumettre aux prochaines exécutions.
          neutralLemmas.add(l)
        }
      }
      if (batchMarked > 0) writeLemmaShards(lemmas)
      writeFileSync(NEUTRAL_PATH, JSON.stringify([...neutralLemmas].sort(), null, 2) + '\n')
      done += batch.length
      marked += batchMarked
    } catch (err) {
      failed += batch.length
      console.error(`  ✗ lot ${index} (${batch[0]}…) : ${err?.message ?? err}`)
    }
    console.log(`Progression : ${done + failed}/${todo.length} (${marked} marqué(s), ${failed} en échec)`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

if (failed) {
  console.error(`Terminé avec ${failed} lemme(s) en échec — relance le script pour reprendre.`)
  process.exit(1)
}
console.log(`✓ ${done} lemme(s) classé(s), ${marked} registre(s) marqué(s) écrits dans les shards.`)
