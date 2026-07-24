import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshQuota, resetIfStale, quotaError, isPaidUser, FREE_STARTER_CREDITS } from '../quota.mjs'

const gratuit = { uid: 'u1', role: 'gratuit', premium: false }
const paid = { uid: 'u2', role: 'premium', premium: true }

test('compte gratuit : autorisé tant que le capital de bienvenue n\'est pas épuisé', () => {
  const q = freshQuota()
  q.totalCount = FREE_STARTER_CREDITS - 1
  assert.equal(quotaError(gratuit, q), null)
})

test('compte gratuit : bloqué une fois le capital épuisé et la génération du jour déjà faite', () => {
  const q = freshQuota()
  q.totalCount = FREE_STARTER_CREDITS
  q.dailyCount = 1
  assert.match(quotaError(gratuit, q), /Quota gratuit atteint/)
})

test('compte gratuit : autorisé le lendemain même capital épuisé', () => {
  const q = freshQuota()
  q.totalCount = FREE_STARTER_CREDITS
  q.dailyCount = 0
  assert.equal(quotaError(gratuit, q), null)
})

test('compte payant : bloqué au-delà de la limite journalière', () => {
  const q = freshQuota()
  q.dailyCount = 10
  assert.match(quotaError(paid, q), /Quota journalier atteint/)
})

test('compte payant : bloqué au-delà de la limite mensuelle même sous la limite journalière', () => {
  const q = freshQuota()
  q.dailyCount = 0
  q.monthlyCount = 100
  assert.match(quotaError(paid, q), /Quota mensuel atteint/)
})

test('compte payant : autorisé sous les deux limites', () => {
  const q = freshQuota()
  q.dailyCount = 9
  q.monthlyCount = 99
  assert.equal(quotaError(paid, q), null)
})

test('isPaidUser reconnaît premium_plus et enseignant', () => {
  assert.equal(isPaidUser({ role: 'premium_plus' }), true)
  assert.equal(isPaidUser({ role: 'enseignant' }), true)
  assert.equal(isPaidUser({ role: 'gratuit', premium: false }), false)
})

test('resetIfStale remet les compteurs jour/mois à zéro au changement de période', () => {
  const q = { totalCount: 5, dailyCount: 3, dailyDate: '2026-01-01', monthlyCount: 20, monthlyMonth: '2026-01' }
  const reset = resetIfStale(q, new Date('2026-02-15T10:00:00Z'))
  assert.equal(reset.dailyCount, 0)
  assert.equal(reset.monthlyCount, 0)
  assert.equal(reset.totalCount, 5) // le total cumulé n'est jamais remis à zéro
})

test('resetIfStale ne touche rien si on est toujours dans la même période', () => {
  const now = new Date('2026-02-15T10:00:00Z')
  const q = freshQuota(now)
  q.dailyCount = 2
  q.monthlyCount = 7
  const reset = resetIfStale(q, now)
  assert.equal(reset.dailyCount, 2)
  assert.equal(reset.monthlyCount, 7)
})
