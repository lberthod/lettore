// Dictionnaire italien-français : fiches lexicographiques (définition, nature
// grammaticale, exemples, synonymes) + tables de conjugaison, pré-générées
// une fois par lots (voir scripts/prepare-batch.mjs) puis stockées ici en
// JSON statique, shardé par initiale. Aucun appel réseau/LLM au runtime.
//
// meta.json (quelques octets) et entries.json (~270 kB minifiés : lemma, fr,
// isVerb pour chaque mot — pas `pos` ni les autres champs, déjà dans les
// shards lemmas/*.json) sont deux fichiers séparés plutôt qu'un seul
// index.json, et chargés à la demande (loadCatalog ci-dessous) plutôt
// qu'importés en haut de ce module : la conjugaison d'un verbe (getConjugation)
// ou la fiche d'un mot précis (lookupDictionary) n'ont besoin ni de l'un ni de
// l'autre, seulement des shards par initiale — les en embarquer dans le même
// chunk aurait fait payer aux pages qui affichent une seule fiche le poids
// des ~4800 entrées que seules la recherche et les pages de listing lisent.
import { shardKey } from '../dictionary/shard-key.js'

const lemmaShards = import.meta.glob('../dictionary/lemmas/*.json', { import: 'default' })
const conjugationShards = import.meta.glob('../dictionary/conjugations/*.json', { import: 'default' })
const wordIndexShards = import.meta.glob('../dictionary/word-index/*.json', { import: 'default' })

let catalogPromise = null

function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = Promise.all([
      import('../dictionary/meta.json'),
      import('../dictionary/entries.json'),
    ]).then(([{ default: meta }, { default: entries }]) => ({
      meta,
      entries,
      entryByLemma: new Map(entries.map((e) => [e.lemma, e])),
    }))
  }
  return catalogPromise
}

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
// vers son lemme (« abbandonare »). Le shard de son initiale suffit : chaque
// lemme y est indexé vers lui-même en plus de ses formes fléchies (voir
// scripts/dictionary-shards.mjs), donc un lemme entré tel quel s'y résout
// déjà sans repli sur la liste complète des entrées.
async function resolveLemma(word) {
  const key = normalize(word)
  const wi = await loadShard(wordIndexShards, 'word-index', shardKey(key))
  return wi[key] || null
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
  const { entries, entryByLemma } = await loadCatalog()
  const matched = new Map()
  for (const e of entries) {
    if (e.fr.toLowerCase().includes(q)) matched.set(e.lemma, e)
  }
  const wi = await loadShard(wordIndexShards, 'word-index', shardKey(q))
  for (const [form, lemma] of Object.entries(wi)) {
    if (form.startsWith(q) && entryByLemma.has(lemma)) matched.set(lemma, entryByLemma.get(lemma))
  }
  return [...matched.values()].sort((a, b) => a.lemma.localeCompare(b.lemma, 'it'))
}

export async function allLemmas() {
  return (await loadCatalog()).entries
}

export async function allVerbs() {
  return (await loadCatalog()).entries.filter((l) => l.isVerb)
}

export async function dictionaryEntryCount() {
  return (await loadCatalog()).meta.lemmaCount
}

export async function dictionaryStats() {
  return { ...(await loadCatalog()).meta }
}
