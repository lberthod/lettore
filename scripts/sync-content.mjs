#!/usr/bin/env node
// Publie le contenu réservé du catalogue vers Firestore.
//
// Le build public ne contient plus que l'aperçu gratuit (voir le plugin
// `virtual:free-content` dans vite.config.js) : les 450+ textes et les
// chapitres de Classici réservés ne sont plus des chunks téléchargeables,
// ils vivent dans Firestore et ne sont servis qu'après vérification du rôle
// (firestore.rules). Ce script est le pont entre la source de vérité — les
// fichiers JSON versionnés dans src/ — et cette copie servie aux abonnés.
//
// Usage :
//   export GOOGLE_APPLICATION_CREDENTIALS=/chemin/vers/serviceAccount.json
//   node scripts/sync-content.mjs [--dry-run] [--prune] [--only <id>] [--force]
//
//   --dry-run  n'écrit rien, affiche ce qui serait fait
//   --prune    supprime les documents devenus orphelins (texte retiré du
//              catalogue, ou passé dans l'aperçu gratuit)
//   --only     ne traite qu'un identifiant (texte « miracolo », chapitre
//              « pinocchio__02 »)
//   --force    réécrit même les documents dont le contenu n'a pas changé
//
// À lancer AVANT `firebase deploy --only hosting` : sans cela, l'application
// déployée chercherait un contenu absent de Firestore. Les règles et les
// exemptions d'index doivent elles aussi être déployées au préalable
// (firebase deploy --only firestore).

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { lockedContent, chapterDocId, allTexts } from './lib/free-content.mjs'
import { getDb, FieldValue } from './lib/firestore.mjs'
import { createVocabAggregator } from '../src/lib/vocab.js'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const PRUNE = args.includes('--prune')
const FORCE = args.includes('--force')
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null

// Marges volontairement basses par rapport aux limites Firestore (500
// écritures et 10 Mio par commit) : un chapitre annoté pèse jusqu'à 200 Ko.
const MAX_BATCH_WRITES = 400
const MAX_BATCH_BYTES = 8 * 1024 * 1024

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

// Documents à publier, dans la forme attendue par src/lib/protectedContent.js :
// le JSON du texte tient dans un seul champ `data` (chaîne). Éclater les maps
// `words`/`sentences` en champs Firestore produirait des centaines d'entrées
// d'index par document, et un gros chapitre dépasserait la taille maximale
// d'une entrée d'index — d'où aussi l'exemption d'index sur `data`
// (firestore.indexes.json).
function collectDocuments() {
  const { texts, chapters } = lockedContent()
  const docs = []

  for (const text of texts) {
    const raw = readFileSync(text.file, 'utf8')
    docs.push({
      collection: 'catalogTexts',
      id: text.id,
      fields: { id: text.id, level: text.level, data: raw },
      raw,
    })
  }

  for (const chapter of chapters) {
    const raw = readFileSync(chapter.file, 'utf8')
    const id = chapterDocId(chapter.bookId, chapter.chapterId)
    docs.push({
      collection: 'bookChapters',
      id,
      fields: {
        bookId: chapter.bookId,
        chapterId: chapter.chapterId,
        level: chapter.level,
        data: raw,
      },
      raw,
    })
  }

  return docs.map((doc) => ({ ...doc, hash: sha256(doc.raw) }))
}

// Vocabulaire du corpus entier (aperçu gratuit compris : la page admin décrit
// le catalogue, pas seulement sa partie payante) — voir src/lib/vocab.js.
function collectVocabStats() {
  const aggregator = createVocabAggregator()
  for (const text of allTexts()) {
    aggregator.add(JSON.parse(readFileSync(text.file, 'utf8')))
  }
  const stats = aggregator.result()
  const docs = stats.levels.map((level) => ({
    collection: 'contentStats',
    id: `vocab-${level.level}`,
    fields: {
      level: level.level,
      count: level.count,
      data: JSON.stringify(level.words),
    },
  }))
  docs.push({
    collection: 'contentStats',
    id: 'vocab-summary',
    fields: {
      totalCount: stats.totalCount,
      levels: stats.levels.map(({ level, count }) => ({ level, count })),
    },
  })
  return docs
}

// Empreintes déjà publiées, en une lecture par collection (`select` ne
// rapatrie que le champ demandé : inutile de retélécharger 10 Mo de contenu
// pour savoir ce qui a changé).
async function existingHashes(db, collection) {
  const snap = await db.collection(collection).select('hash').get()
  return new Map(snap.docs.map((d) => [d.id, d.data().hash]))
}

async function commitAll(db, writes) {
  let batch = db.batch()
  let count = 0
  let bytes = 0
  let committed = 0

  const flush = async () => {
    if (!count) return
    await batch.commit()
    committed += count
    process.stdout.write(`  … ${committed}/${writes.length} écritures\n`)
    batch = db.batch()
    count = 0
    bytes = 0
  }

  for (const write of writes) {
    if (count >= MAX_BATCH_WRITES || bytes + write.bytes > MAX_BATCH_BYTES) {
      await flush()
    }
    if (write.op === 'delete') batch.delete(write.ref)
    else batch.set(write.ref, write.data)
    count++
    bytes += write.bytes
  }
  await flush()
}

async function main() {
  const documents = [...collectDocuments(), ...collectVocabStats()]
  const selected = ONLY ? documents.filter((d) => d.id === ONLY) : documents
  if (ONLY && !selected.length) {
    console.error(`Aucun document nommé « ${ONLY} ».`)
    process.exit(1)
  }

  const db = DRY_RUN && !process.env.GOOGLE_APPLICATION_CREDENTIALS ? null : getDb()

  const collections = [...new Set(selected.map((d) => d.collection))]
  const published = new Map()
  for (const collection of collections) {
    published.set(
      collection,
      db ? await existingHashes(db, collection) : new Map()
    )
  }

  const writes = []
  let unchanged = 0

  for (const doc of selected) {
    // Les agrégats n'ont pas de fichier source : on les réécrit à chaque fois.
    const hash = doc.hash || sha256(JSON.stringify(doc.fields))
    if (!FORCE && published.get(doc.collection).get(doc.id) === hash) {
      unchanged++
      continue
    }
    const data = { ...doc.fields, hash, updatedAt: FieldValue.serverTimestamp() }
    writes.push({
      op: 'set',
      ref: db?.collection(doc.collection).doc(doc.id),
      data,
      bytes: Buffer.byteLength(doc.raw || JSON.stringify(doc.fields)),
      label: `${doc.collection}/${doc.id}`,
    })
  }

  let pruned = []
  if (PRUNE && !ONLY) {
    const wanted = new Map()
    for (const doc of selected) {
      if (!wanted.has(doc.collection)) wanted.set(doc.collection, new Set())
      wanted.get(doc.collection).add(doc.id)
    }
    for (const [collection, ids] of published) {
      for (const id of ids.keys()) {
        if (wanted.get(collection)?.has(id)) continue
        pruned.push(`${collection}/${id}`)
        writes.push({
          op: 'delete',
          ref: db.collection(collection).doc(id),
          bytes: 0,
          label: `${collection}/${id}`,
        })
      }
    }
  }

  const totalBytes = selected.reduce(
    (sum, d) => sum + Buffer.byteLength(d.raw || ''),
    0
  )
  console.log(
    `${selected.length} document(s) candidat(s) — ${(totalBytes / 1024 / 1024).toFixed(1)} Mo de contenu`
  )
  console.log(`  ${writes.filter((w) => w.op === 'set').length} à écrire, ${unchanged} inchangé(s), ${pruned.length} à supprimer`)

  if (DRY_RUN) {
    for (const write of writes.slice(0, 20)) {
      console.log(`  [${write.op}] ${write.label}`)
    }
    if (writes.length > 20) console.log(`  … et ${writes.length - 20} de plus`)
    console.log('(--dry-run : rien n’a été écrit)')
    return
  }

  if (!writes.length) {
    console.log('✓ Firestore est déjà à jour.')
    return
  }

  await commitAll(db, writes)
  console.log(`✓ Synchronisation terminée (${writes.length} opération(s)).`)
}

main().catch((err) => {
  console.error('Échec de la synchronisation :', err)
  process.exit(1)
})
