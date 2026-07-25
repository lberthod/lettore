#!/usr/bin/env node
// Migration ponctuelle : découpe les 3 JSON monolithiques (lemmas.json,
// conjugations.json, word-index.json) en shards par initiale + génère
// l'index léger (index.json). À lancer une seule fois, puis les 3 fichiers
// monolithiques peuvent être supprimés (voir P2 dans l'audit).
import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { writeLemmaShards, writeConjugationShards, writeWordIndexShards, rebuildIndex } from './dictionary-shards.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const DICT_DIR = path.join(ROOT, 'src', 'dictionary')

const lemmas = JSON.parse(readFileSync(path.join(DICT_DIR, 'lemmas.json'), 'utf8'))
const conjugations = JSON.parse(readFileSync(path.join(DICT_DIR, 'conjugations.json'), 'utf8'))
const wordIndex = JSON.parse(readFileSync(path.join(DICT_DIR, 'word-index.json'), 'utf8'))

writeLemmaShards(lemmas)
writeConjugationShards(conjugations)
writeWordIndexShards(wordIndex)
rebuildIndex(lemmas, conjugations, wordIndex)

for (const file of ['lemmas.json', 'conjugations.json', 'word-index.json']) {
  rmSync(path.join(DICT_DIR, file))
}

console.log(`Découpage terminé : ${Object.keys(lemmas).length} lemmes, ${Object.keys(conjugations).length} conjugaisons, ${Object.keys(wordIndex).length} formes indexées.`)
