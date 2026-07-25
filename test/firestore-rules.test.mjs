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

function validUserText(overrides = {}) {
  return {
    owner: 'u1',
    public: false,
    level: 'A2',
    title: 'Un titre',
    paragraphs: ['Un paragraphe.'],
    questions: [],
    words: {},
    sentences: {},
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
