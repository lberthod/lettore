import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HttpsError } from 'firebase-functions/v2/https'
import { ROLES, ADMIN_EMAIL, requireAdmin, PRICE_ROLE_MAP, roleForPriceId } from './roles.mjs'

test('ROLES contient les quatre rôles attendus, gratuit en premier', () => {
  assert.deepEqual(ROLES, ['gratuit', 'premium', 'premium_plus', 'enseignant'])
})

test('requireAdmin autorise l’e-mail administrateur', () => {
  assert.doesNotThrow(() =>
    requireAdmin({ auth: { uid: 'u1', token: { email: ADMIN_EMAIL } } })
  )
})

test('requireAdmin tolère la casse et les espaces', () => {
  assert.doesNotThrow(() =>
    requireAdmin({ auth: { uid: 'u1', token: { email: `  ${ADMIN_EMAIL.toUpperCase()}  ` } } })
  )
})

test('requireAdmin refuse un autre compte', () => {
  assert.throws(
    () => requireAdmin({ auth: { uid: 'u2', token: { email: 'quelquun@example.com' } } }),
    HttpsError
  )
})

test('requireAdmin refuse un appel non authentifié', () => {
  assert.throws(() => requireAdmin({}), HttpsError)
})

test('roleForPriceId renvoie le rôle mappé', () => {
  const priceId = Object.keys(PRICE_ROLE_MAP)[0]
  if (!priceId) return // table vide tant que Stripe n'est pas configuré (voir roles.mjs)
  assert.equal(roleForPriceId(priceId), PRICE_ROLE_MAP[priceId])
})

test('roleForPriceId renvoie undefined pour un prix inconnu, sans lever d’erreur', () => {
  assert.equal(roleForPriceId('price_inconnu'), undefined)
})

test('roleForPriceId renvoie undefined sans priceId', () => {
  assert.equal(roleForPriceId(undefined), undefined)
})
