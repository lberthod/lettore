import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { loadShardedDictionary } from './dictionary-shards.mjs'

const allWords = JSON.parse(readFileSync('scripts/data/dictionary-words.json', 'utf8')).map((w) => w.word)
const filtered = allWords.filter((w) => !/^\d+$/.test(w))
const { wordIndex } = loadShardedDictionary()
const skipped = new Set(
  existsSync('scripts/data/skipped-words.json') ? JSON.parse(readFileSync('scripts/data/skipped-words.json', 'utf8')) : []
)

const remaining = filtered.filter((w) => !wordIndex[w] && !skipped.has(w))
console.log('Total remaining:', remaining.length)

const N_WORKERS = 5
const chunkSize = Math.ceil(remaining.length / N_WORKERS)
mkdirSync('scripts/data/split', { recursive: true })

for (let i = 0; i < N_WORKERS; i++) {
  const slice = remaining.slice(i * chunkSize, (i + 1) * chunkSize)
  writeFileSync(`scripts/data/split/worker-${i + 1}.json`, JSON.stringify(slice, null, 2) + '\n')
  console.log(`worker-${i + 1}.json: ${slice.length} mots`)
}
