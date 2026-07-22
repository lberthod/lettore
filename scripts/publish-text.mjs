#!/usr/bin/env node
// Publie un brouillon Firestore et reconstruit l'index (doc meta/index).
//
// Usage :
//   node scripts/publish-text.mjs --id vendemmia          # publier
//   node scripts/publish-text.mjs --id vendemmia --unpublish
//   node scripts/publish-text.mjs --reindex               # reconstruire l'index seul

import { getDb, FieldValue, rebuildIndex } from './lib/firestore.mjs'
import { countWords, makeExcerpt } from './lib/schema.mjs'

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a === '--unpublish' || a === '--reindex') args[a.slice(2)] = true
  else if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i]
}

if (!args.id && !args.reindex) {
  console.error(
    'Usage : node scripts/publish-text.mjs --id <slug> [--unpublish] | --reindex'
  )
  process.exit(1)
}

const db = getDb()

if (args.id) {
  const ref = db.doc(`texts/${args.id}`)
  const snap = await ref.get()
  if (!snap.exists) {
    console.error(`Texte introuvable : texts/${args.id}`)
    process.exit(1)
  }
  const status = args.unpublish ? 'draft' : 'published'
  await ref.update({ status, updatedAt: FieldValue.serverTimestamp() })
  console.log(`✓ texts/${args.id} → ${status}`)
}

const count = await rebuildIndex((t) => ({
  id: t.id,
  title: t.title,
  level: t.level,
  excerpt: makeExcerpt(t.paragraphs),
  paragraphCount: t.paragraphs.length,
  wordCount: countWords(t.paragraphs),
  premium: t.premium === true,
}))
console.log(`✓ meta/index reconstruit (${count} texte(s) publié(s))`)
