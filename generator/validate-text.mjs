#!/usr/bin/env node
// Utilitaire de validation manuelle : vérifie qu'un fichier texte JSON
// respecte les mêmes règles que le générateur automatique (couverture
// lexicale, structure du quiz). Usage : node generator/validate-text.mjs <file.json>
import fs from 'node:fs'
import {
  validateCoverage,
  validateStructure,
  countWords,
} from './lib/schema.mjs'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node generator/validate-text.mjs <file.json>')
  process.exit(1)
}
const textData = JSON.parse(fs.readFileSync(file, 'utf8'))

const structuralErrors = validateStructure(textData)
const { missingWords, missingSentences } = validateCoverage(textData)
const wordCount = countWords(textData.paragraphs)

console.log(`Fichier : ${file}`)
console.log(`id: ${textData.id}, level: ${textData.level}, genre: ${textData.genre}, category: ${textData.category}`)
console.log(`paragraphCount: ${textData.paragraphs.length}, wordCount: ${wordCount}`)

if (structuralErrors.length) {
  console.log(`\n✗ Erreurs structurelles :`)
  for (const e of structuralErrors) console.log(`  - ${e}`)
}
if (missingWords.length) {
  console.log(`\n✗ Mots sans traduction (${missingWords.length}) :`)
  console.log('  ' + missingWords.join(', '))
}
if (missingSentences.length) {
  console.log(`\n✗ Phrases sans traduction (${missingSentences.length}) :`)
  for (const s of missingSentences) console.log(`  - ${s}`)
}
if (!structuralErrors.length && !missingWords.length && !missingSentences.length) {
  console.log('\n✓ OK — structure et couverture complètes.')
}
