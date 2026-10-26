// Tests de la correction pédagogique (Phase 5) : droit d'accès (rôles à
// crédits uniquement), consommation/remboursement transactionnels du crédit,
// validation d'entrée et contrôle structurel de la sortie LLM.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FakeFirestore } from './fake-firestore.mjs'
import { createJobStore } from '../jobs.mjs'
import {
  QuotaExceededError,
  correctionQuotaError,
  freshQuota,
  MONTHLY_CREDITS,
  CORRECTION_COST,
} from '../quota.mjs'
import {
  parseCorrectionRequest,
  CORRECTION_MAX_CHARS,
  CORRECTION_GOAL_MAX_CHARS,
} from '../validate.mjs'
import {
  CORRECTION_SCHEMA,
  COMMUNICATIVE_STATUSES,
  validateCorrectionStructure,
} from '../schema.mjs'

const gratuit = { uid: 'u1', role: 'gratuit', premium: false, emailVerified: true }
const premium = { uid: 'u2', role: 'premium', premium: true }
const premiumIA = { uid: 'u3', role: 'premium_plus', premium: true }
const enseignant = { uid: 'u4', role: 'enseignant', premium: true }

function makeStore() {
  return createJobStore(new FakeFirestore())
}

// --- correctionQuotaError (quota.mjs) ---

test('correction refusée aux comptes gratuit et premium (réservée aux rôles à crédits)', () => {
  // Choix documenté dans quota.mjs : pas d'essai gratuit pour la correction —
  // l'essai existant est le capital unique de génération, le partager serait
  // trompeur et un compteur d'essai séparé rouvrirait l'abus par comptes jetables.
  assert.match(correctionQuotaError(gratuit, freshQuota()), /Premium IA/)
  assert.match(correctionQuotaError(premium, freshQuota()), /Premium IA/)
})

test('correction autorisée pour Premium IA et Enseignant sous la limite', () => {
  assert.equal(correctionQuotaError(premiumIA, freshQuota()), null)
  assert.equal(correctionQuotaError(enseignant, freshQuota()), null)
})

test('correction refusée quand les crédits mensuels sont épuisés', () => {
  const q = freshQuota()
  q.monthlyUsed = MONTHLY_CREDITS.premium_plus
  assert.match(correctionQuotaError(premiumIA, q), /Crédits mensuels insuffisants/)
})

// --- reserveCorrection / finishCorrection / failCorrection (jobs.mjs) ---

test('reserveCorrection consomme 1 crédit et crée le document dans la même transaction', async () => {
  const store = makeStore()
  const ref = store.correctionsCollection.doc('c-1')
  const q = await store.reserveCorrection(premiumIA, ref)
  assert.equal(q.monthlyUsed, CORRECTION_COST)

  const doc = await ref.get()
  assert.equal(doc.exists, true)
  assert.equal(doc.data().uid, 'u3')
  assert.equal(doc.data().status, 'pending')
  assert.equal(doc.data().cost, CORRECTION_COST)
})

test('reserveCorrection refuse un compte gratuit sans rien créer ni consommer', async () => {
  const store = makeStore()
  const ref = store.correctionsCollection.doc('c-refused')
  await assert.rejects(() => store.reserveCorrection(gratuit, ref), QuotaExceededError)

  const doc = await ref.get()
  assert.equal(doc.exists, false, 'aucun document créé quand le droit est refusé')
  const status = await store.getQuotaStatus(gratuit)
  assert.equal(status.remaining, 1, "l'essai gratuit de génération reste intact")
})

test('reserveCorrection refuse quand les crédits sont épuisés, sans créer de document', async () => {
  const store = makeStore()
  const user = premiumIA
  // Épuise les crédits par des réservations successives.
  for (let i = 0; i < MONTHLY_CREDITS.premium_plus; i++) {
    await store.reserveCorrection(user, store.correctionsCollection.doc(`c-${i}`))
  }
  const ref = store.correctionsCollection.doc('c-too-much')
  await assert.rejects(() => store.reserveCorrection(user, ref), QuotaExceededError)
  assert.equal((await ref.get()).exists, false)
})

test('failCorrection rembourse le crédit après un échec technique', async () => {
  const store = makeStore()
  await store.reserveCorrection(premiumIA, store.correctionsCollection.doc('c-1'))
  assert.equal(await store.failCorrection('c-1', 'GLM indisponible'), true)

  const status = await store.getQuotaStatus(premiumIA)
  assert.equal(status.used, 0)
  assert.equal(status.remaining, MONTHLY_CREDITS.premium_plus)

  const doc = await store.correctionsCollection.doc('c-1').get()
  assert.equal(doc.data().status, 'error')
  assert.equal(doc.data().error, 'GLM indisponible')
  assert.ok(doc.data().creditRefundedAt)
})

test('failCorrection ne rembourse qu\'une fois, même appelé plusieurs fois', async () => {
  const store = makeStore()
  await store.reserveCorrection(premiumIA, store.correctionsCollection.doc('c-1'))

  assert.equal(await store.failCorrection('c-1', 'échec 1'), true)
  assert.equal(await store.failCorrection('c-1', 'échec 2'), false, 'déjà clôturée')

  const status = await store.getQuotaStatus(premiumIA)
  assert.equal(status.used, 0, 'un seul remboursement, pas de crédit offert')
  const doc = await store.correctionsCollection.doc('c-1').get()
  assert.equal(doc.data().error, 'échec 1')
})

test('finishCorrection clôture en succès : le crédit reste consommé', async () => {
  const store = makeStore()
  await store.reserveCorrection(premiumIA, store.correctionsCollection.doc('c-1'))
  assert.equal(await store.finishCorrection('c-1'), true)

  const status = await store.getQuotaStatus(premiumIA)
  assert.equal(status.used, CORRECTION_COST)
  const doc = await store.correctionsCollection.doc('c-1').get()
  assert.equal(doc.data().status, 'done')
})

test('finishCorrection puis failCorrection : pas de remboursement après livraison', async () => {
  const store = makeStore()
  await store.reserveCorrection(premiumIA, store.correctionsCollection.doc('c-1'))
  await store.finishCorrection('c-1')
  assert.equal(await store.failCorrection('c-1', 'trop tard'), false)
  assert.equal((await store.getQuotaStatus(premiumIA)).used, CORRECTION_COST)
})

test('failCorrection puis finishCorrection : une correction remboursée n\'est jamais livrée', async () => {
  const store = makeStore()
  await store.reserveCorrection(premiumIA, store.correctionsCollection.doc('c-1'))
  await store.failCorrection('c-1', 'délai dépassé')
  assert.equal(await store.finishCorrection('c-1'), false)
  const doc = await store.correctionsCollection.doc('c-1').get()
  assert.equal(doc.data().status, 'error')
})

test('une correction ne bloque pas la génération (pas de verrou un-job-par-compte)', async () => {
  const store = makeStore()
  await store.reserveCorrection(premiumIA, store.correctionsCollection.doc('c-1'))
  // La réservation d'un vrai job de génération doit passer malgré la
  // correction en cours (collections séparées).
  const q = await store.reserveJob(premiumIA, store.jobsCollection.doc('job-1'), 'Titre', 'corto')
  assert.equal(q.monthlyUsed, CORRECTION_COST + 1)
})

// --- parseCorrectionRequest (validate.mjs) ---

test('parseCorrectionRequest accepte un texte italien normal', () => {
  const { errors, text } = parseCorrectionRequest({ text: '  Io sono andato al mercato ieri.  ' })
  assert.deepEqual(errors, [])
  assert.equal(text, 'Io sono andato al mercato ieri.')
})

test('parseCorrectionRequest rejette un texte vide, absent ou non-string', () => {
  assert.ok(parseCorrectionRequest({}).errors.some((e) => e.includes('vide')))
  assert.ok(parseCorrectionRequest({ text: '   ' }).errors.some((e) => e.includes('vide')))
  assert.ok(parseCorrectionRequest({ text: 42 }).errors.some((e) => e.includes('vide')))
  assert.ok(parseCorrectionRequest({ text: null }).errors.some((e) => e.includes('vide')))
})

test('parseCorrectionRequest rejette un texte trop long', () => {
  const { errors } = parseCorrectionRequest({ text: 'a'.repeat(CORRECTION_MAX_CHARS + 1) })
  assert.ok(errors.some((e) => e.includes('2000 caractères')))
})

test('parseCorrectionRequest rejette un texte sans aucune lettre', () => {
  const { errors } = parseCorrectionRequest({ text: '123 !!! ???' })
  assert.ok(errors.some((e) => e.includes('aucune lettre')))
})

// --- goal (Sprint 1.1, phasetravail.md) : consigne/objectif communicatif,
// optionnelle — présente pour les modes guidé/contenu, absente en mode libre.

test('parseCorrectionRequest : goal absente (mode libre) donne goal null, sans erreur', () => {
  const { errors, goal } = parseCorrectionRequest({ text: 'Ieri sono andato al mercato.' })
  assert.deepEqual(errors, [])
  assert.equal(goal, null)
})

test('parseCorrectionRequest : goal fournie (mode guidé/contenu) est acceptée et nettoyée', () => {
  const { errors, goal } = parseCorrectionRequest({
    text: 'Ieri sono andato al mercato.',
    goal: '  Scrivi un\'email per rifiutare un invito.  ',
  })
  assert.deepEqual(errors, [])
  assert.equal(goal, "Scrivi un'email per rifiutare un invito.")
})

test('parseCorrectionRequest : goal trop longue est tronquée, pas rejetée', () => {
  const { errors, goal } = parseCorrectionRequest({
    text: 'Ieri sono andato al mercato.',
    goal: 'a'.repeat(CORRECTION_GOAL_MAX_CHARS + 50),
  })
  assert.deepEqual(errors, [])
  assert.equal(goal.length, CORRECTION_GOAL_MAX_CHARS)
})

test('parseCorrectionRequest : goal non-string ou vide est ignorée (repli null)', () => {
  assert.equal(parseCorrectionRequest({ text: 'Ciao.', goal: '   ' }).goal, null)
  assert.equal(parseCorrectionRequest({ text: 'Ciao.', goal: 42 }).goal, null)
  assert.equal(parseCorrectionRequest({ text: 'Ciao.' }).goal, null)
})

// --- CORRECTION_SCHEMA / validateCorrectionStructure (schema.mjs) ---

function validCorrection() {
  return {
    corrected: 'Ieri sono andato al mercato.',
    errors: [
      {
        original: 'Ieri ho andato',
        correction: 'Ieri sono andato',
        explanation: 'Le verbe « andare » se conjugue avec l’auxiliaire essere, pas avere.',
        type: 'grammatica',
      },
    ],
    level_estimate: 'A2',
  }
}

test('le schéma de correction est fermé (additionalProperties: false) et type énuméré', () => {
  assert.equal(CORRECTION_SCHEMA.additionalProperties, false)
  const item = CORRECTION_SCHEMA.properties.errors.items
  assert.equal(item.additionalProperties, false)
  assert.deepEqual(item.properties.type.enum, ['grammatica', 'lessico', 'registro', 'ortografia'])
  assert.deepEqual(CORRECTION_SCHEMA.properties.level_estimate.enum, ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
})

test('validateCorrectionStructure accepte une sortie complète, y compris sans erreurs', () => {
  assert.deepEqual(validateCorrectionStructure(validCorrection()), [])
  const perfect = { ...validCorrection(), errors: [] }
  assert.deepEqual(validateCorrectionStructure(perfect), [])
})

test('validateCorrectionStructure signale corrected manquant ou vide', () => {
  const out = validCorrection()
  out.corrected = '   '
  assert.ok(validateCorrectionStructure(out).some((e) => e.includes('corrected')))
  delete out.corrected
  assert.ok(validateCorrectionStructure(out).some((e) => e.includes('corrected')))
})

test('validateCorrectionStructure signale une erreur incomplète ou un type inconnu', () => {
  const out = validCorrection()
  out.errors[0].explanation = ''
  out.errors.push({ original: 'x', correction: 'y', explanation: 'z', type: 'fantasia' })
  const errors = validateCorrectionStructure(out)
  assert.ok(errors.some((e) => e === 'erreur 1 : explanation manquant'))
  assert.ok(errors.some((e) => e === 'erreur 2 : type invalide'))
})

test('validateCorrectionStructure signale un niveau estimé invalide ou absent', () => {
  const out = validCorrection()
  out.level_estimate = 'Z9'
  assert.ok(validateCorrectionStructure(out).some((e) => e.includes('level_estimate')))
  delete out.level_estimate
  assert.ok(validateCorrectionStructure(out).some((e) => e.includes('level_estimate')))
})

// --- communicative (Sprint 1.1) : optionnel (absent en mode libre), mais
// complet quand présent (modes guidé/contenu, une consigne a été fournie).

test('le schéma déclare "communicative" comme optionnel, fermé, avec un statut énuméré', () => {
  assert.ok(!CORRECTION_SCHEMA.required.includes('communicative'))
  const c = CORRECTION_SCHEMA.properties.communicative
  assert.equal(c.additionalProperties, false)
  assert.deepEqual(c.properties.status.enum, COMMUNICATIVE_STATUSES)
  assert.deepEqual(COMMUNICATIVE_STATUSES, ['atteint', 'partiel', 'a_completer'])
})

test('validateCorrectionStructure accepte une sortie sans communicative (mode libre)', () => {
  const out = validCorrection()
  assert.equal(out.communicative, undefined)
  assert.deepEqual(validateCorrectionStructure(out), [])
})

test('validateCorrectionStructure accepte une sortie avec communicative complet (consigne fournie)', () => {
  const out = {
    ...validCorrection(),
    communicative: { status: 'atteint', note: 'Le message répond bien à la consigne demandée.' },
  }
  assert.deepEqual(validateCorrectionStructure(out), [])
})

test('validateCorrectionStructure signale un statut communicative invalide ou une note manquante', () => {
  const out = {
    ...validCorrection(),
    communicative: { status: 'presque', note: 'Une note.' },
  }
  assert.ok(validateCorrectionStructure(out).some((e) => e.includes('communicative') && e.includes('status')))

  const out2 = {
    ...validCorrection(),
    communicative: { status: 'a_completer', note: '   ' },
  }
  assert.ok(validateCorrectionStructure(out2).some((e) => e.includes('communicative') && e.includes('note')))
})
