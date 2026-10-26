// Tests du dialogue simulé (Phase 7) : droit d'accès (rôles à crédits),
// réservation/remboursement des 2 crédits de session, plafond de tours,
// isolation entre comptes, validation d'entrée et schémas de sortie LLM.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FakeFirestore } from './fake-firestore.mjs'
import { createJobStore, DIALOGUE_SESSION_TTL_MS } from '../jobs.mjs'
import {
  QuotaExceededError,
  dialogueQuotaError,
  freshQuota,
  MONTHLY_CREDITS,
  DIALOGUE_COST,
  MAX_DIALOGUE_TURNS,
} from '../quota.mjs'
import { parseDialogueRequest, parseDialogueTurnRequest, DIALOGUE_TURN_MAX_CHARS } from '../validate.mjs'
import {
  DIALOGUE_TURN_SCHEMA,
  DIALOGUE_FEEDBACK_SCHEMA,
  validateDialogueTurnStructure,
  validateDialogueFeedbackStructure,
} from '../schema.mjs'
import { SCENARIOS, scenarioById } from '../dialogue.mjs'

const gratuit = { uid: 'u1', role: 'gratuit', premium: false, emailVerified: true }
const premium = { uid: 'u2', role: 'premium', premium: true }
const premiumIA = { uid: 'u3', role: 'premium_plus', premium: true }
const enseignant = { uid: 'u4', role: 'enseignant', premium: true }

function makeStore() {
  return createJobStore(new FakeFirestore())
}

async function openSession(store, user = premiumIA, id = 's-1') {
  await store.reserveDialogue(user, store.dialogueSessionsCollection.doc(id), {
    scenario: 'al_bar',
    level: 'A2',
  })
  return id
}

// --- dialogueQuotaError (quota.mjs) ---

test('dialogue refusé aux comptes gratuit et premium (réservé aux rôles à crédits)', () => {
  // Même choix documenté que la correction (quota.mjs) : pas d'essai gratuit.
  assert.match(dialogueQuotaError(gratuit, freshQuota()), /Premium IA/)
  assert.match(dialogueQuotaError(premium, freshQuota()), /Premium IA/)
})

test('dialogue autorisé pour Premium IA et Enseignant sous la limite', () => {
  assert.equal(dialogueQuotaError(premiumIA, freshQuota()), null)
  assert.equal(dialogueQuotaError(enseignant, freshQuota()), null)
})

test('dialogue refusé quand il reste moins de 2 crédits', () => {
  const q = freshQuota()
  q.monthlyUsed = MONTHLY_CREDITS.premium_plus - 1 // 1 restant, 2 requis
  assert.match(dialogueQuotaError(premiumIA, q), /Crédits mensuels insuffisants/)
})

// --- reserveDialogue / failDialogue / closeDialogue (jobs.mjs) ---

test('reserveDialogue consomme 2 crédits et crée la session dans la même transaction', async () => {
  const store = makeStore()
  const ref = store.dialogueSessionsCollection.doc('s-1')
  const q = await store.reserveDialogue(premiumIA, ref, { scenario: 'al_bar', level: 'A2' })
  assert.equal(q.monthlyUsed, DIALOGUE_COST)

  const doc = await ref.get()
  assert.equal(doc.exists, true)
  const s = doc.data()
  assert.equal(s.uid, 'u3')
  assert.equal(s.status, 'active')
  assert.equal(s.scenario, 'al_bar')
  assert.equal(s.level, 'A2')
  assert.deepEqual(s.turns, [])
  assert.equal(s.cost, DIALOGUE_COST)
})

test('reserveDialogue refuse un compte gratuit sans rien créer ni consommer', async () => {
  const store = makeStore()
  const ref = store.dialogueSessionsCollection.doc('s-refused')
  await assert.rejects(
    () => store.reserveDialogue(gratuit, ref, { scenario: 'al_bar', level: 'A1' }),
    QuotaExceededError
  )
  assert.equal((await ref.get()).exists, false)
  const status = await store.getQuotaStatus(gratuit)
  assert.equal(status.remaining, 1, "l'essai gratuit de génération reste intact")
})

test('reserveDialogue refuse quand les crédits sont épuisés, sans créer de session', async () => {
  const store = makeStore()
  const sessions = Math.floor(MONTHLY_CREDITS.premium_plus / DIALOGUE_COST)
  for (let i = 0; i < sessions; i++) {
    await openSession(store, premiumIA, `s-${i}`)
  }
  const ref = store.dialogueSessionsCollection.doc('s-too-much')
  await assert.rejects(
    () => store.reserveDialogue(premiumIA, ref, { scenario: 'al_bar', level: 'A2' }),
    QuotaExceededError
  )
  assert.equal((await ref.get()).exists, false)
})

test('failDialogue rembourse les 2 crédits si la session échoue avant le premier échange', async () => {
  const store = makeStore()
  await openSession(store) // turns encore vide : l'ouverture LLM a échoué
  assert.equal(await store.failDialogue('s-1', 'GLM indisponible'), true)

  const status = await store.getQuotaStatus(premiumIA)
  assert.equal(status.used, 0)
  assert.equal(status.remaining, MONTHLY_CREDITS.premium_plus)

  const doc = await store.dialogueSessionsCollection.doc('s-1').get()
  assert.equal(doc.data().status, 'error')
  assert.equal(doc.data().error, 'GLM indisponible')
  assert.ok(doc.data().creditRefundedAt)
})

test("failDialogue ne rembourse qu'une fois, même appelé plusieurs fois", async () => {
  const store = makeStore()
  await openSession(store)
  assert.equal(await store.failDialogue('s-1', 'échec 1'), true)
  assert.equal(await store.failDialogue('s-1', 'échec 2'), false, 'déjà clôturée')

  const status = await store.getQuotaStatus(premiumIA)
  assert.equal(status.used, 0, 'un seul remboursement, pas de crédit offert')
  const doc = await store.dialogueSessionsCollection.doc('s-1').get()
  assert.equal(doc.data().error, 'échec 1')
})

test('failDialogue ne rembourse PAS une session qui a déjà servi un tour', async () => {
  const store = makeStore()
  await openSession(store)
  await store.appendDialogueTurns('s-1', [{ role: 'assistant', text: 'Buongiorno! Cosa prende?' }])
  assert.equal(await store.failDialogue('s-1', 'échec en cours de route'), true)

  // La session est close en erreur, mais l'échange livré reste payé.
  const status = await store.getQuotaStatus(premiumIA)
  assert.equal(status.used, DIALOGUE_COST)
  assert.equal((await store.dialogueSessionsCollection.doc('s-1').get()).data().status, 'error')
})

test("appendDialogueTurns cumule l'historique et refuse une session close", async () => {
  const store = makeStore()
  await openSession(store)
  const first = await store.appendDialogueTurns(
    's-1',
    [{ role: 'assistant', text: 'Buongiorno!' }],
    { suggested_replies: ['Un caffè, per favore', 'Buongiorno!'] }
  )
  assert.equal(first.length, 1)
  const second = await store.appendDialogueTurns('s-1', [
    { role: 'user', text: 'Un caffè, per favore' },
    { role: 'assistant', text: 'Subito!' },
  ])
  assert.equal(second.length, 3)

  const doc = await store.dialogueSessionsCollection.doc('s-1').get()
  assert.deepEqual(doc.data().suggested_replies, ['Un caffè, per favore', 'Buongiorno!'])

  await store.closeDialogue('s-1', [])
  assert.equal(
    await store.appendDialogueTurns('s-1', [{ role: 'user', text: 'trop tard' }]),
    null,
    'aucune écriture après clôture'
  )
})

test('closeDialogue enregistre le bilan, le crédit reste consommé, et est sans effet la 2e fois', async () => {
  const store = makeStore()
  await openSession(store)
  await store.appendDialogueTurns('s-1', [
    { role: 'assistant', text: 'Buongiorno!' },
    { role: 'user', text: 'Vorrei un caffè' },
  ])
  const feedback = [{ original: 'Vorrei un caffè', better: 'Vorrei un caffè, per favore', explanation: 'Plus poli.' }]
  assert.equal(await store.closeDialogue('s-1', feedback), true)
  assert.equal(await store.closeDialogue('s-1', []), false, 'déjà close')

  const doc = await store.dialogueSessionsCollection.doc('s-1').get()
  assert.equal(doc.data().status, 'closed')
  assert.deepEqual(doc.data().feedback, feedback)
  assert.equal((await store.getQuotaStatus(premiumIA)).used, DIALOGUE_COST)
})

test('failDialogue après clôture normale : aucun remboursement', async () => {
  const store = makeStore()
  await openSession(store)
  await store.closeDialogue('s-1', [])
  assert.equal(await store.failDialogue('s-1', 'trop tard'), false)
  assert.equal((await store.getQuotaStatus(premiumIA)).used, DIALOGUE_COST)
})

// --- Isolation entre comptes ---

test("dialogueFor ne rend pas la session d'un autre uid (comme si elle n'existait pas)", async () => {
  const store = makeStore()
  await openSession(store, premiumIA, 's-1')
  assert.equal(await store.dialogueFor('u4', 's-1'), null, 'autre compte : session invisible')
  assert.equal(await store.dialogueFor('u3', 'inconnu'), null)
  const own = await store.dialogueFor('u3', 's-1')
  assert.equal(own.scenario, 'al_bar')
})

// --- Plafond de tours ---

test('le plafond MAX_DIALOGUE_TURNS est atteignable et détectable sur les tours utilisateur', async () => {
  const store = makeStore()
  await openSession(store)
  await store.appendDialogueTurns('s-1', [{ role: 'assistant', text: 'Buongiorno!' }])
  for (let i = 0; i < MAX_DIALOGUE_TURNS; i++) {
    await store.appendDialogueTurns('s-1', [
      { role: 'user', text: `réplique ${i + 1}` },
      { role: 'assistant', text: 'Va bene.' },
    ])
  }
  const session = await store.dialogueFor('u3', 's-1')
  const userTurns = session.turns.filter((t) => t.role === 'user').length
  // C'est ce comptage que server.mjs fait avant chaque tour : à
  // MAX_DIALOGUE_TURNS, le tour suivant est refusé (409 limitReached).
  assert.equal(userTurns, MAX_DIALOGUE_TURNS)
  assert.ok(userTurns >= MAX_DIALOGUE_TURNS)
})

// --- pruneJobs : sessions actives expirées (> 24 h) ---

test('pruneJobs clôt les sessions actives de plus de 24 h et laisse les récentes', async () => {
  const store = makeStore()
  const old = store.dialogueSessionsCollection.doc('s-old')
  await old.set({
    uid: 'u3',
    scenario: 'al_bar',
    level: 'A2',
    turns: [{ role: 'assistant', text: 'Buongiorno!' }],
    status: 'active',
    createdAt: Date.now() - DIALOGUE_SESSION_TTL_MS - 1000,
    updatedAt: Date.now() - DIALOGUE_SESSION_TTL_MS - 1000,
  })
  await openSession(store, premiumIA, 's-recent')

  await store.pruneJobs()

  assert.equal((await old.get()).data().status, 'closed')
  assert.equal((await old.get()).data().closedReason, 'expired')
  assert.equal(
    (await store.dialogueSessionsCollection.doc('s-recent').get()).data().status,
    'active'
  )
})

// --- parseDialogueRequest / parseDialogueTurnRequest (validate.mjs) ---

test('parseDialogueRequest accepte un scénario connu et un niveau valide', () => {
  const { errors, scenario, level } = parseDialogueRequest(
    { scenario: 'al_bar', level: 'A2' },
    scenarioById
  )
  assert.deepEqual(errors, [])
  assert.equal(scenario, 'al_bar')
  assert.equal(level, 'A2')
})

test('parseDialogueRequest rejette scénario inconnu et niveau invalide', () => {
  assert.ok(
    parseDialogueRequest({ scenario: 'sulla_luna', level: 'A2' }, scenarioById).errors.some((e) =>
      e.includes('scénario')
    )
  )
  assert.ok(
    parseDialogueRequest({ scenario: 'al_bar', level: 'Z9' }, scenarioById).errors.some((e) =>
      e.includes('niveau')
    )
  )
  assert.equal(parseDialogueRequest({}, scenarioById).errors.length, 2)
})

test('parseDialogueTurnRequest accepte une réplique normale et la borne à 500 caractères', () => {
  const ok = parseDialogueTurnRequest({ text: '  Vorrei un cappuccino, per favore.  ' })
  assert.deepEqual(ok.errors, [])
  assert.equal(ok.text, 'Vorrei un cappuccino, per favore.')

  const long = parseDialogueTurnRequest({ text: 'a'.repeat(DIALOGUE_TURN_MAX_CHARS + 1) })
  assert.ok(long.errors.some((e) => e.includes('500 caractères')))
})

test('parseDialogueTurnRequest rejette vide, non-texte et sans lettre', () => {
  assert.ok(parseDialogueTurnRequest({}).errors.some((e) => e.includes('vide')))
  assert.ok(parseDialogueTurnRequest({ text: '   ' }).errors.some((e) => e.includes('vide')))
  assert.ok(parseDialogueTurnRequest({ text: 42 }).errors.some((e) => e.includes('vide')))
  assert.ok(parseDialogueTurnRequest({ text: '123 !!!' }).errors.some((e) => e.includes('aucune lettre')))
})

// --- Scénarios prédéfinis (dialogue.mjs) ---

test('les scénarios prédéfinis sont complets et indexés', () => {
  assert.ok(SCENARIOS.length >= 5)
  for (const s of SCENARIOS) {
    assert.ok(s.id && s.title && s.description && s.level && s.role, `scénario ${s.id} incomplet`)
    assert.equal(scenarioById.get(s.id), s)
  }
})

// --- Schémas et contrôles structurels (schema.mjs) ---

test('les schémas de dialogue sont fermés (additionalProperties: false)', () => {
  assert.equal(DIALOGUE_TURN_SCHEMA.additionalProperties, false)
  assert.deepEqual(DIALOGUE_TURN_SCHEMA.required, ['reply', 'suggested_replies', 'done'])
  assert.equal(DIALOGUE_FEEDBACK_SCHEMA.additionalProperties, false)
  assert.equal(DIALOGUE_FEEDBACK_SCHEMA.properties.feedback.items.additionalProperties, false)
  assert.deepEqual(DIALOGUE_FEEDBACK_SCHEMA.properties.feedback.items.required, [
    'original',
    'better',
    'explanation',
  ])
})

test('validateDialogueTurnStructure accepte un tour valide, avec ou sans suggestions', () => {
  assert.deepEqual(
    validateDialogueTurnStructure({
      reply: 'Buongiorno! Cosa prende?',
      suggested_replies: ['Un caffè, per favore', 'Un cappuccino'],
      done: false,
    }),
    []
  )
  // Réplique de clôture : suggestions vides autorisées.
  assert.deepEqual(
    validateDialogueTurnStructure({ reply: 'Arrivederci!', suggested_replies: [], done: true }),
    []
  )
})

test('validateDialogueTurnStructure signale reply vide, suggestions invalides et done manquant', () => {
  assert.ok(
    validateDialogueTurnStructure({ reply: '  ', suggested_replies: [], done: false }).some((e) =>
      e.includes('reply')
    )
  )
  assert.ok(
    validateDialogueTurnStructure({ reply: 'Ciao', suggested_replies: 'no', done: false }).some(
      (e) => e.includes('suggested_replies')
    )
  )
  assert.ok(
    validateDialogueTurnStructure({ reply: 'Ciao', suggested_replies: ['ok', ''], done: false }).some(
      (e) => e.includes('suggested_replies')
    )
  )
  assert.ok(
    validateDialogueTurnStructure({ reply: 'Ciao', suggested_replies: [] }).some((e) =>
      e.includes('done')
    )
  )
})

test('validateDialogueFeedbackStructure accepte un bilan complet et un bilan vide', () => {
  assert.deepEqual(
    validateDialogueFeedbackStructure({
      feedback: [
        {
          original: 'Io ho andato al bar',
          better: 'Io sono andato al bar',
          explanation: '« Andare » se conjugue avec essere.',
        },
      ],
    }),
    []
  )
  assert.deepEqual(validateDialogueFeedbackStructure({ feedback: [] }), [])
})

test('validateDialogueFeedbackStructure signale les entrées incomplètes', () => {
  const errors = validateDialogueFeedbackStructure({
    feedback: [{ original: 'x', better: '', explanation: 'y' }],
  })
  assert.ok(errors.some((e) => e === 'feedback 1 : better manquant'))
  assert.ok(
    validateDialogueFeedbackStructure({}).some((e) => e.includes('feedback'))
  )
})
