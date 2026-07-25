// Dictionnaire italien-français : fiches lexicographiques (définition, nature
// grammaticale, exemples, synonymes) + tables de conjugaison, pré-générées
// une fois par lots (voir scripts/prepare-batch.mjs) puis stockées ici en
// JSON statique, shardé par initiale. Aucun appel réseau/LLM au runtime.
import indexData from '../dictionary/index.json'
import { shardKey } from '../dictionary/shard-key.js'

const lemmaShards = import.meta.glob('../dictionary/lemmas/*.json', { import: 'default' })
const conjugationShards = import.meta.glob('../dictionary/conjugations/*.json', { import: 'default' })
const wordIndexShards = import.meta.glob('../dictionary/word-index/*.json', { import: 'default' })

const entryByLemma = new Map(indexData.entries.map((e) => [e.lemma, e]))

function normalize(word) {
  return word
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[’‘´`]/g, "'")
}

async function loadShard(shards, dir, key) {
  const loader = shards[`../dictionary/${dir}/${key}.json`]
  return loader ? loader() : {}
}

// Résout n'importe quelle forme rencontrée dans un texte (ex. « abbandonava »)
// vers son lemme (« abbandonare »).
async function resolveLemma(word) {
  const key = normalize(word)
  const wi = await loadShard(wordIndexShards, 'word-index', shardKey(key))
  if (wi[key]) return wi[key]
  return entryByLemma.has(key) ? key : null
}

export async function lookupDictionary(word) {
  const lemma = await resolveLemma(word)
  if (!lemma) return null
  const shard = await loadShard(lemmaShards, 'lemmas', shardKey(lemma))
  const entry = shard[lemma]
  if (!entry) return null
  const conjugation = entry.isVerb
    ? (await loadShard(conjugationShards, 'conjugations', shardKey(lemma)))[lemma] ?? null
    : null
  return { ...entry, conjugation }
}

export async function getConjugation(verb) {
  const lemma = await resolveLemma(verb)
  if (!lemma) return null
  return (await loadShard(conjugationShards, 'conjugations', shardKey(lemma)))[lemma] ?? null
}

// Recherche libre (page /dizionario) : correspondance sur les formes fléchies
// indexées (un seul shard, celui de l'initiale de la requête) ou la
// traduction française (index léger, déjà en mémoire).
export async function searchDictionary(query) {
  const q = normalize(query)
  if (!q) return []
  const matched = new Map()
  for (const e of indexData.entries) {
    if (e.fr.toLowerCase().includes(q)) matched.set(e.lemma, e)
  }
  const wi = await loadShard(wordIndexShards, 'word-index', shardKey(q))
  for (const [form, lemma] of Object.entries(wi)) {
    if (form.startsWith(q) && entryByLemma.has(lemma)) matched.set(lemma, entryByLemma.get(lemma))
  }
  return [...matched.values()].sort((a, b) => a.lemma.localeCompare(b.lemma, 'it'))
}

export function allLemmas() {
  return indexData.entries
}

export function allVerbs() {
  return indexData.entries.filter((l) => l.isVerb)
}

export function dictionaryEntryCount() {
  return indexData.meta.lemmaCount
}

export function dictionaryStats() {
  return { ...indexData.meta }
}
