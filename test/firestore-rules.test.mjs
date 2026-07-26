// Tests des règles Firestore (firestore.rules) contre l'émulateur local.
// Lancer avec : npm run test:rules (démarre l'émulateur puis ce fichier).

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore'

let testEnv

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'leggendo-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

after(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

function asOwner(uid, claims) {
  return testEnv.authenticatedContext(uid, claims).firestore()
}

function asAnon() {
  return testEnv.unauthenticatedContext().firestore()
}

async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()))
}

// --- texts/{id} : lecture publique gratuite, premium réservé au claim ---

test('texts : lecture publique d’un texte publié gratuit', async () => {
  await seed((db) => setDoc(doc(db, 'texts/free1'), { status: 'published', premium: false }))
  await assertSucceeds(getDoc(doc(asAnon(), 'texts/free1')))
})

test('texts : un texte non publié n’est jamais lisible', async () => {
  await seed((db) => setDoc(doc(db, 'texts/draft1'), { status: 'draft', premium: false }))
  await assertFails(getDoc(doc(asAnon(), 'texts/draft1')))
})

test('texts : un texte premium est refusé sans le claim premium', async () => {
  await seed((db) => setDoc(doc(db, 'texts/prem1'), { status: 'published', premium: true }))
  await assertFails(getDoc(doc(asAnon(), 'texts/prem1')))
  await assertFails(getDoc(doc(asOwner('u1', { premium: false }), 'texts/prem1')))
})

test('texts : un texte premium est lisible avec le claim premium', async () => {
  await seed((db) => setDoc(doc(db, 'texts/prem1'), { status: 'published', premium: true }))
  await assertSucceeds(getDoc(doc(asOwner('u1', { premium: true }), 'texts/prem1')))
})

test('texts : écriture toujours refusée côté client', async () => {
  await assertFails(
    setDoc(doc(asOwner('u1', { premium: true }), 'texts/hack'), {
      status: 'published',
      premium: false,
    })
  )
})

// --- meta/index : index public des textes publiés ---

test('meta/index : lecture publique, écriture refusée', async () => {
  await seed((db) => setDoc(doc(db, 'meta/index'), { texts: [] }))
  await assertSucceeds(getDoc(doc(asAnon(), 'meta/index')))
  await assertFails(setDoc(doc(asOwner('u1', { role: 'enseignant' }), 'meta/index'), { texts: [] }))
})

// --- catalogTexts/{id} : catalogue réservé, Premium et au-dessus ---
//
// Ces trois collections sont la vraie barrière d'accès au contenu payant
// depuis qu'il a quitté le build (voir vite.config.js et
// scripts/check-build-leaks.mjs) : elles sont testées ici parce qu'une
// permission trop large y rendrait à nouveau le catalogue téléchargeable.

test('catalogTexts : lecture refusée sans authentification ni rôle', async () => {
  await seed((db) => setDoc(doc(db, 'catalogTexts/miracolo'), { data: '{}' }))
  await assertFails(getDoc(doc(asAnon(), 'catalogTexts/miracolo')))
  await assertFails(getDoc(doc(asOwner('u1', {}), 'catalogTexts/miracolo')))
  await assertFails(getDoc(doc(asOwner('u1', { role: 'gratuit' }), 'catalogTexts/miracolo')))
})

test('catalogTexts : lecture autorisée pour premium, premium_plus et enseignant', async () => {
  await seed((db) => setDoc(doc(db, 'catalogTexts/miracolo'), { data: '{}' }))
  for (const role of ['premium', 'premium_plus', 'enseignant']) {
    await assertSucceeds(getDoc(doc(asOwner('u1', { role }), 'catalogTexts/miracolo')))
  }
})

test('catalogTexts : écriture toujours refusée côté client', async () => {
  await assertFails(
    setDoc(doc(asOwner('u1', { role: 'enseignant' }), 'catalogTexts/hack'), { data: '{}' })
  )
})

test('catalogTexts : suppression toujours refusée côté client', async () => {
  await seed((db) => setDoc(doc(db, 'catalogTexts/miracolo'), { data: '{}' }))
  await assertFails(deleteDoc(doc(asOwner('u1', { role: 'enseignant' }), 'catalogTexts/miracolo')))
})

// --- bookChapters/{id} : Classici, Premium IA et Enseignant seulement ---

test('bookChapters : lecture refusée sans rôle suffisant', async () => {
  await seed((db) => setDoc(doc(db, 'bookChapters/pinocchio__02'), { data: '{}' }))
  await assertFails(getDoc(doc(asAnon(), 'bookChapters/pinocchio__02')))
  await assertFails(getDoc(doc(asOwner('u1', {}), 'bookChapters/pinocchio__02')))
  // Premium simple donne accès au catalogue mais pas aux Classici : c'est
  // l'écart entre les deux collections qui sépare les formules.
  await assertFails(getDoc(doc(asOwner('u1', { role: 'premium' }), 'bookChapters/pinocchio__02')))
})

test('bookChapters : lecture autorisée pour premium_plus et enseignant', async () => {
  await seed((db) => setDoc(doc(db, 'bookChapters/pinocchio__02'), { data: '{}' }))
  for (const role of ['premium_plus', 'enseignant']) {
    await assertSucceeds(getDoc(doc(asOwner('u1', { role }), 'bookChapters/pinocchio__02')))
  }
})

test('bookChapters : écriture toujours refusée côté client', async () => {
  await assertFails(
    setDoc(doc(asOwner('u1', { role: 'enseignant' }), 'bookChapters/hack'), { data: '{}' })
  )
})

// --- contentStats/{id} : agrégats de vocabulaire, administration seule ---

test('contentStats : lecture refusée hors compte administrateur', async () => {
  await seed((db) => setDoc(doc(db, 'contentStats/vocab-A1'), { count: 10 }))
  await assertFails(getDoc(doc(asAnon(), 'contentStats/vocab-A1')))
  await assertFails(getDoc(doc(asOwner('u1', {}), 'contentStats/vocab-A1')))
  // Le rôle le plus élevé ne suffit pas : seul l'e-mail admin ouvre la porte.
  await assertFails(
    getDoc(doc(asOwner('u1', { role: 'enseignant', email: 'autre@exemple.fr' }), 'contentStats/vocab-A1'))
  )
})

test('contentStats : lecture autorisée pour le compte administrateur', async () => {
  await seed((db) => setDoc(doc(db, 'contentStats/vocab-A1'), { count: 10 }))
  await assertSucceeds(
    getDoc(doc(asOwner('u1', { email: 'lberthod@gmail.com' }), 'contentStats/vocab-A1'))
  )
})

test('contentStats : écriture refusée même pour l’administrateur', async () => {
  await assertFails(
    setDoc(doc(asOwner('u1', { email: 'lberthod@gmail.com' }), 'contentStats/vocab-A1'), {
      count: 0,
    })
  )
})

// --- users/{uid} : profil, createdTexts + progress uniquement ---

test('users : lecture réservée au propriétaire', async () => {
  await seed((db) => setDoc(doc(db, 'users/u1'), { createdTexts: [] }))
  await assertSucceeds(getDoc(doc(asOwner('u1', {}), 'users/u1')))
  await assertFails(getDoc(doc(asOwner('u2', {}), 'users/u1')))
})

test('users : le propriétaire peut écrire createdTexts (liste)', async () => {
  await assertSucceeds(
    setDoc(doc(asOwner('u1', {}), 'users/u1'), { createdTexts: [{ id: 't1' }] })
  )
})

test('users : le propriétaire peut écrire progress (map)', async () => {
  await assertSucceeds(
    setDoc(doc(asOwner('u1', {}), 'users/u1'), { progress: { readTexts: ['t1'] } }, { merge: true })
  )
})

test('users : createdTexts doit être une liste', async () => {
  await assertFails(setDoc(doc(asOwner('u1', {}), 'users/u1'), { createdTexts: 'oops' }))
})

test('users : un champ arbitraire est refusé', async () => {
  await assertFails(setDoc(doc(asOwner('u1', {}), 'users/u1'), { role: 'enseignant' }))
})

test('users : un autre compte ne peut pas écrire', async () => {
  await assertFails(setDoc(doc(asOwner('u2', {}), 'users/u1'), { createdTexts: [] }))
})

// --- userTexts/{id} : textes créés par l'utilisateur ---

// Reflète ce qu'écrit saveUserText() : la sortie de toTextData() du VPS
// (leggendo-server/schema.mjs) plus owner / public / createdAt.
function validUserText(overrides = {}) {
  return {
    owner: 'u1',
    public: false,
    id: 'un-titre',
    level: 'A2',
    title: 'Un titre',
    paragraphs: ['Un paragraphe.'],
    questions: [{ q: 'Perché ?', options: ['a', 'b', 'c'], correct: 0 }],
    words: { un: 'un', paragraphe: 'paragraphe' },
    sentences: { 'Un paragraphe.': 'Un paragraphe.' },
    category: 'vita_quotidiana',
    genre: 'racconto',
    size: 'corto',
    wordCount: 2,
    excerpt: 'Un paragraphe.',
    ...overrides,
  }
}

test('userTexts : création valide par le propriétaire', async () => {
  await assertSucceeds(
    setDoc(doc(asOwner('u1', {}), 'userTexts/t1'), validUserText())
  )
})

test('userTexts : owner doit correspondre au compte authentifié', async () => {
  await assertFails(
    setDoc(doc(asOwner('u1', {}), 'userTexts/t1'), validUserText({ owner: 'u2' }))
  )
})

test('userTexts : public doit être false à la création', async () => {
  await assertFails(
    setDoc(doc(asOwner('u1', {}), 'userTexts/t1'), validUserText({ public: true }))
  )
})

test('userTexts : niveau hors énumération refusé', async () => {
  await assertFails(
    setDoc(doc(asOwner('u1', {}), 'userTexts/t1'), validUserText({ level: 'Z9' }))
  )
})

test('userTexts : titre trop long refusé', async () => {
  await assertFails(
    setDoc(doc(asOwner('u1', {}), 'userTexts/t1'), validUserText({ title: 'x'.repeat(201) }))
  )
})

test('userTexts : trop de paragraphes refusé', async () => {
  await assertFails(
    setDoc(
      doc(asOwner('u1', {}), 'userTexts/t1'),
      validUserText({ paragraphs: Array.from({ length: 61 }, () => 'p') })
    )
  )
})

test('userTexts : création valide sans les champs facultatifs', async () => {
  const minimal = validUserText()
  for (const key of ['id', 'category', 'genre', 'size', 'wordCount', 'excerpt']) {
    delete minimal[key]
  }
  await assertSucceeds(setDoc(doc(asOwner('u1', {}), 'userTexts/t1'), minimal))
})

test('userTexts : champ obligatoire manquant refusé', async () => {
  const incomplete = validUserText()
  delete incomplete.sentences
  await assertFails(setDoc(doc(asOwner('u1', {}), 'userTexts/t1'), incomplete))
})

test('userTexts : champ hors liste blanche refusé', async () => {
  await assertFails(
    setDoc(doc(asOwner('u1', {}), 'userTexts/t1'), validUserText({ role: 'enseignant' }))
  )
})

test('userTexts : trop de questions refusé', async () => {
  await assertFails(
    setDoc(
      doc(asOwner('u1', {}), 'userTexts/t1'),
      validUserText({
        questions: Array.from({ length: 21 }, () => ({ q: 'q', options: ['a'], correct: 0 })),
      })
    )
  )
})

test('userTexts : lexique surdimensionné refusé', async () => {
  const words = {}
  for (let i = 0; i <= 3000; i++) words[`w${i}`] = 'x'
  await assertFails(
    setDoc(doc(asOwner('u1', {}), 'userTexts/t1'), validUserText({ words }))
  )
})

test('userTexts : trop de phrases refusé', async () => {
  const sentences = {}
  for (let i = 0; i <= 500; i++) sentences[`Phrase ${i}.`] = 'x'
  await assertFails(
    setDoc(doc(asOwner('u1', {}), 'userTexts/t1'), validUserText({ sentences }))
  )
})

test('userTexts : champ facultatif mal typé refusé', async () => {
  await assertFails(
    setDoc(doc(asOwner('u1', {}), 'userTexts/t1'), validUserText({ wordCount: 'beaucoup' }))
  )
  await assertFails(
    setDoc(doc(asOwner('u1', {}), 'userTexts/t1'), validUserText({ size: { id: 'corto' } }))
  )
  await assertFails(
    setDoc(
      doc(asOwner('u1', {}), 'userTexts/t1'),
      validUserText({ excerpt: 'x'.repeat(301) })
    )
  )
})

test('userTexts : lecture privée réservée au propriétaire', async () => {
  await seed((db) => setDoc(doc(db, 'userTexts/t1'), validUserText()))
  await assertSucceeds(getDoc(doc(asOwner('u1', {}), 'userTexts/t1')))
  await assertFails(getDoc(doc(asOwner('u2', {}), 'userTexts/t1')))
  await assertFails(getDoc(doc(asAnon(), 'userTexts/t1')))
})

test('userTexts : lecture publique si public == true', async () => {
  await seed((db) => setDoc(doc(db, 'userTexts/t1'), validUserText({ public: true })))
  await assertSucceeds(getDoc(doc(asAnon(), 'userTexts/t1')))
})

test('userTexts : activer le partage exige le rôle enseignant', async () => {
  await seed((db) => setDoc(doc(db, 'userTexts/t1'), validUserText()))
  await assertFails(
    updateDoc(doc(asOwner('u1', { role: 'premium_plus' }), 'userTexts/t1'), { public: true })
  )
  await assertSucceeds(
    updateDoc(doc(asOwner('u1', { role: 'enseignant' }), 'userTexts/t1'), { public: true })
  )
})

test('userTexts : désactiver le partage ne requiert aucun rôle', async () => {
  await seed((db) => setDoc(doc(db, 'userTexts/t1'), validUserText({ public: true })))
  await assertSucceeds(
    updateDoc(doc(asOwner('u1', {}), 'userTexts/t1'), { public: false })
  )
})

test('userTexts : modifier un autre champ que public est refusé', async () => {
  await seed((db) => setDoc(doc(db, 'userTexts/t1'), validUserText()))
  await assertFails(
    updateDoc(doc(asOwner('u1', { role: 'enseignant' }), 'userTexts/t1'), { title: 'Autre' })
  )
})

test('userTexts : suppression réservée au propriétaire', async () => {
  await seed((db) => setDoc(doc(db, 'userTexts/t1'), validUserText()))
  await assertFails(deleteDoc(doc(asOwner('u2', {}), 'userTexts/t1')))
  await assertSucceeds(deleteDoc(doc(asOwner('u1', {}), 'userTexts/t1')))
})

// --- newsTexts/{id} : Notizie, réservé Premium IA / Enseignant ---

test('newsTexts : lecture refusée sans le rôle requis', async () => {
  await seed((db) => setDoc(doc(db, 'newsTexts/n1'), { title: 'Notizia' }))
  await assertFails(getDoc(doc(asAnon(), 'newsTexts/n1')))
  await assertFails(getDoc(doc(asOwner('u1', { role: 'premium' }), 'newsTexts/n1')))
})

test('newsTexts : lecture autorisée avec premium_plus ou enseignant', async () => {
  await seed((db) => setDoc(doc(db, 'newsTexts/n1'), { title: 'Notizia' }))
  await assertSucceeds(getDoc(doc(asOwner('u1', { role: 'premium_plus' }), 'newsTexts/n1')))
  await assertSucceeds(getDoc(doc(asOwner('u2', { role: 'enseignant' }), 'newsTexts/n1')))
})

// --- Filet de sécurité : collections non listées ---

test('collection inconnue : toujours refusée', async () => {
  await assertFails(setDoc(doc(asOwner('u1', {}), 'somethingElse/doc1'), { a: 1 }))
})
