// Lecture/écriture du dictionnaire shardé par initiale (src/dictionary/{lemmas,conjugations,word-index}/*.json
// + index.json) — utilisé par prepare-batch.mjs et merge-dictionary-batches.mjs pour continuer à manipuler
// les données en mémoire sous forme d'objets plats, sans connaître le découpage en shards.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { shardKey } from '../src/dictionary/shard-key.js'

const ROOT = path.resolve(import.meta.dirname, '..')
const DICT_DIR = path.join(ROOT, 'src', 'dictionary')

function readShardDir(dir) {
  const dirPath = path.join(DICT_DIR, dir)
  const merged = {}
  if (!existsSync(dirPath)) return merged
  for (const file of readdirSync(dirPath).filter((f) => f.endsWith('.json'))) {
    Object.assign(merged, JSON.parse(readFileSync(path.join(dirPath, file), 'utf8')))
  }
  return merged
}

function writeShardDir(dir, flat) {
  const dirPath = path.join(DICT_DIR, dir)
  mkdirSync(dirPath, { recursive: true })
  const buckets = {}
  for (const [key, value] of Object.entries(flat)) {
    const bucket = shardKey(key)
    buckets[bucket] ??= {}
    buckets[bucket][key] = value
  }
  // Nettoie les shards devenus vides (ex. une lettre qui perdrait sa dernière entrée).
  for (const file of existsSync(dirPath) ? readdirSync(dirPath).filter((f) => f.endsWith('.json')) : []) {
    const bucket = file.replace(/\.json$/, '')
    if (!buckets[bucket]) writeFileSync(path.join(dirPath, file), '{}\n')
  }
  for (const [bucket, entries] of Object.entries(buckets)) {
    const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b, 'it')))
    writeFileSync(path.join(dirPath, `${bucket}.json`), JSON.stringify(sorted, null, 2) + '\n')
  }
}

export function loadShardedDictionary() {
  return {
    lemmas: readShardDir('lemmas'),
    conjugations: readShardDir('conjugations'),
    wordIndex: readShardDir('word-index'),
  }
}

export function writeLemmaShards(lemmas) {
  writeShardDir('lemmas', lemmas)
}

export function writeConjugationShards(conjugations) {
  writeShardDir('conjugations', conjugations)
}

export function writeWordIndexShards(wordIndex) {
  writeShardDir('word-index', wordIndex)
}

// meta.json (quelques octets) et entries.json (lemma+fr+isVerb, sans `pos`
// ni les autres champs déjà présents dans les shards `lemmas/*.json`) sont
// deux fichiers séparés, et non plus `{ meta, entries }` dans un seul
// index.json : la plupart des pages qui affichent des statistiques
// (dictionaryEntryCount, dictionaryStats) n'ont besoin que de meta.json, pas
// des ~4800 entrées — voir src/lib/dictionary.js.
export function rebuildIndex(lemmas, conjugations, wordIndex) {
  const entries = Object.values(lemmas)
    .map(({ lemma, fr, isVerb }) => ({ lemma, fr, isVerb: !!isVerb }))
    .sort((a, b) => a.lemma.localeCompare(b.lemma, 'it'))
  const meta = {
    lemmaCount: entries.length,
    verbCount: entries.filter((l) => l.isVerb).length,
    conjugatedVerbCount: Object.keys(conjugations).length,
    indexedFormCount: Object.keys(wordIndex).length,
  }
  writeFileSync(path.join(DICT_DIR, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
  writeFileSync(path.join(DICT_DIR, 'entries.json'), JSON.stringify(entries, null, 2) + '\n')
}
