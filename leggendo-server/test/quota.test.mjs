import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  freshQuota,
  resetIfStale,
  quotaError,
  quotaStatus,
  creditCost,
  MONTHLY_CREDITS,
  FREE_TRIAL_CREDITS,
} from '../quota.mjs'

const gratuit = { uid: 'u1', role: 'gratuit', premium: false }
const premium = { uid: 'u2', role: 'premium', premium: true }
const premiumIA = { uid: 'u3', role: 'premium_plus', premium: true }
const enseignant = { uid: 'u4', role: 'enseignant', premium: true }

test('creditCost applique le barème par taille et 1 par défaut si inconnue', () => {
  assert.equal(creditCost('corto'), 1)
  assert.equal(creditCost('medio'), 2)
  assert.equal(creditCost('lungo'), 3)
  assert.equal(creditCost('molto_lungo'), 4)
  assert.equal(creditCost('inconnu'), 1)
})

test('compte gratuit : autorisé pour son unique essai', () => {
  const q = freshQuota()
  assert.equal(quotaError(gratuit, q, 'corto'), null)
})

test('compte gratuit : bloqué une fois l\'essai consommé, quelle que soit la taille', () => {
  const q = freshQuota()
  q.trialUsed = true
  assert.match(quotaError(gratuit, q, 'corto'), /essai déjà utilisée/)
})

test('compte Premium (sans IA) : toujours refusé, quel que soit le quota', () => {
  const q = freshQuota()
  assert.match(quotaError(premium, q, 'corto'), /ne comprend pas la génération/)
})

test('Premium IA : autorisé sous la limite mensuelle de crédits', () => {
  const q = freshQuota()
  q.monthlyUsed = MONTHLY_CREDITS.premium_plus - 2
  assert.equal(quotaError(premiumIA, q, 'medio'), null) // coûte 2, il en reste 2
})

test('Premium IA : refusé si le coût dépasse les crédits restants', () => {
  const q = freshQuota()
  q.monthlyUsed = MONTHLY_CREDITS.premium_plus - 1
  assert.match(quotaError(premiumIA, q, 'medio'), /Crédits mensuels insuffisants/) // coûte 2, il n'en reste qu'1
})

test('Enseignant : limite mensuelle propre (100), indépendante de Premium IA', () => {
  const q = freshQuota()
  q.monthlyUsed = MONTHLY_CREDITS.enseignant - 4
  assert.equal(quotaError(enseignant, q, 'molto_lungo'), null) // coûte 4
  q.monthlyUsed = MONTHLY_CREDITS.enseignant
  assert.match(quotaError(enseignant, q, 'corto'), /Crédits mensuels insuffisants/)
})

test('resetIfStale remet le compteur mensuel à zéro au changement de mois, sans toucher à l\'essai', () => {
  const q = { trialUsed: true, monthlyUsed: 20, monthlyMonth: '2026-01' }
  const reset = resetIfStale(q, new Date('2026-02-15T10:00:00Z'))
  assert.equal(reset.monthlyUsed, 0)
  assert.equal(reset.trialUsed, true) // l'essai gratuit n'est jamais remis à zéro
})

test('resetIfStale ne touche rien si on est toujours dans le même mois', () => {
  const now = new Date('2026-02-15T10:00:00Z')
  const q = freshQuota(now)
  q.monthlyUsed = 7
  const reset = resetIfStale(q, now)
  assert.equal(reset.monthlyUsed, 7)
})

test('quotaStatus expose le solde correct par rôle', () => {
  const qGratuit = freshQuota()
  assert.deepEqual(quotaStatus(gratuit, qGratuit), {
    type: 'trial',
    used: 0,
    remaining: FREE_TRIAL_CREDITS,
  })

  assert.deepEqual(quotaStatus(premium, freshQuota()), { type: 'no_access' })

  const qIA = freshQuota()
  qIA.monthlyUsed = 5
  assert.deepEqual(quotaStatus(premiumIA, qIA), {
    type: 'credits',
    limit: MONTHLY_CREDITS.premium_plus,
    used: 5,
    remaining: MONTHLY_CREDITS.premium_plus - 5,
  })
})
