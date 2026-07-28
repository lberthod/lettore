// Sélection du premier lot de pages /coniugazione/<verbo> indexables
// (GPTanalyse.md, § 8). Dérivée de la sélection éditoriale du dictionnaire
// (dictionaryPages.js) plutôt que dupliquée : les mêmes verbes fréquents
// servent de point d'entrée aux deux familles de pages, et un verbe absent
// de dictionaryPages.js n'a pas non plus de raison d'avoir sa propre page
// de conjugaison en tête de rollout.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shardKey } from '../dictionary/shard-key.js'
import { getSeoDictionaryEntries } from './dictionaryPages.js'

const DICTIONARY_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dictionary'
)

function readShard(dir, key) {
  try {
    return JSON.parse(
      readFileSync(path.join(DICTIONARY_DIR, `${dir}/${key}.json`), 'utf8')
    )
  } catch {
    return {}
  }
}

let cache = null

// { lemma, fr, conjugation } pour chaque verbe du lot ayant une table de
// conjugaison complète.
export function getSeoConjugations() {
  if (cache) return cache
  cache = getSeoDictionaryEntries()
    .filter((e) => e.isVerb)
    .map((e) => {
      const conjugation = readShard('conjugations', shardKey(e.lemma))[e.lemma]
      return conjugation ? { lemma: e.lemma, fr: e.fr, conjugation } : null
    })
    .filter(Boolean)
  return cache
}
