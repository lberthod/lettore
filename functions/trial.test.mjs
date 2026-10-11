import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HttpsError } from 'firebase-functions/v2/https'
import { normalizeEmail, startTrialFor, TRIAL_EMAILS } from './trial.mjs'
import { makeFakeDb, makeFakeAuth } from './fake-db.mjs'
import { TRIAL_DAYS } from './roles.mjs'

const NOW = Date.parse('2026-10-11T12:00:00Z')
const verified = (email) => ({ email, email_verified: true })

async function rejects(p, code) {
  await assert.rejects(p, (e) => e instanceof HttpsError && e.code === code)
}

test('normalizeEmail : casse, +tag, points gmail, googlemail', () => {
  assert.equal(normalizeEmail('  A.B+x@Gmail.com '), 'ab@gmail.com')
  assert.equal(normalizeEmail('a.b@googlemail.com'), 'ab@gmail.com')
  assert.equal(normalizeEmail('a.b+z@exemple.ch'), 'a.b@exemple.ch')
  assert.equal(normalizeEmail('nimportequoi'), '')
})

test('e-mail non vérifié : aucun essai, aucun claim', async () => {
  const db = makeFakeDb()
  const auth = makeFakeAuth({ u1: {} })
  await rejects(
    startTrialFor({ db, auth, uid: 'u1', token: { email: 'a@b.ch', email_verified: false }, now: NOW }),
    'failed-precondition'
  )
  assert.equal(auth.claimsWrites.length, 0)
})

test('e-mail vérifié : essai de 10 jours, claims posés', async () => {
  const db = makeFakeDb()
  const auth = makeFakeAuth({ u1: {} })
  const res = await startTrialFor({ db, auth, uid: 'u1', token: verified('a@b.ch'), now: NOW })
  const expected = Math.floor(NOW / 1000) + TRIAL_DAYS * 86400
  assert.deepEqual(res, { ok: true, trialEnd: expected })
  assert.deepEqual(auth.claimsWrites[0].claims, { role: 'premium_plus', premium: true, trialEnd: expected })
})

test('un second uid avec le même e-mail (alias compris) est refusé', async () => {
  const db = makeFakeDb()
  const auth = makeFakeAuth({ u1: {}, u2: {} })
  await startTrialFor({ db, auth, uid: 'u1', token: verified('jean.dupont@gmail.com'), now: NOW })
  await rejects(
    startTrialFor({ db, auth, uid: 'u2', token: verified('jeandupont+promo@gmail.com'), now: NOW }),
    'already-exists'
  )
  assert.equal(auth.claimsWrites.length, 1)
  assert.equal(db.cols.get(TRIAL_EMAILS).size, 1)
})

test('appel répété du même uid : idempotent pendant l’essai, refusé après expiration', async () => {
  const db = makeFakeDb()
  const auth = makeFakeAuth({ u1: {} })
  const first = await startTrialFor({ db, auth, uid: 'u1', token: verified('a@b.ch'), now: NOW })
  const again = await startTrialFor({ db, auth, uid: 'u1', token: verified('a@b.ch'), now: NOW + 1000 })
  assert.equal(again.trialEnd, first.trialEnd)
  // essai échu, claims revenus à gratuit : pas de second essai
  auth.setCustomUserClaims('u1', { role: 'gratuit', premium: false, trialEnd: null })
  await rejects(
    startTrialFor({ db, auth, uid: 'u1', token: verified('a@b.ch'), now: NOW + 11 * 86400 * 1000 }),
    'already-exists'
  )
})

test('un abonné payant ne reçoit pas d’essai', async () => {
  const db = makeFakeDb()
  const auth = makeFakeAuth({ u1: { customClaims: { role: 'premium', premium: true, periodEnd: 1 } } })
  await rejects(
    startTrialFor({ db, auth, uid: 'u1', token: verified('a@b.ch'), now: NOW }),
    'failed-precondition'
  )
})

test('claims avec trialEnd (ancien essai expiré, trialEnd null) : second essai refusé', async () => {
  for (const trialEnd of [null, 1000]) {
    const db = makeFakeDb()
    const auth = makeFakeAuth({ u1: { customClaims: { trialEnd } } })
    await rejects(
      startTrialFor({ db, auth, uid: 'u1', token: verified('a@b.ch'), now: NOW }),
      'already-exists'
    )
    assert.equal(auth.claimsWrites.length, 0)
  }
})
