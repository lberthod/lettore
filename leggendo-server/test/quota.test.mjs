import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  freshQuota,
  resetIfStale,
  quotaError,
  correctionQuotaError,
  dialogueQuotaError,
  quotaStatus,
  creditCost,
  creditLimit,
  resolveRole,
  isFreeAccount,
  MONTHLY_CREDITS,
  FREE_MONTHLY_CREDITS,
  CORRECTION_COST,
  DIALOGUE_COST,
} from '../quota.mjs'

const gratuit = { uid: 'u1', role: 'gratuit', premium: false, emailVerified: true }
// Compte tout juste inscrit : l'adresse n'a pas encore été confirmée.
const gratuitNonVerifie = { uid: 'u6', role: 'gratuit', premium: false, emailVerified: false }
// Anciens rôles d'abonnement : ne donnent plus rien de plus que le gratuit.
const premium = { uid: 'u2', role: 'premium', premium: true, emailVerified: true }
// Rôles attribués à la main par l'administration : plafond propre.
const premiumIA = { uid: 'u3', role: 'premium_plus', premium: true, emailVerified: true }
const enseignant = { uid: 'u4', role: 'enseignant', premium: true, emailVerified: true }

test('creditCost applique le barème par taille et 1 par défaut si inconnue', () => {
  assert.equal(creditCost('corto'), 1)
  assert.equal(creditCost('medio'), 2)
  assert.equal(creditCost('lungo'), 3)
  assert.equal(creditCost('molto_lungo'), 4)
  assert.equal(creditCost('inconnu'), 1)
})

test('mode gratuit : tout compte a un plafond mensuel, le rôle inconnu aussi', () => {
  assert.equal(creditLimit(gratuit), FREE_MONTHLY_CREDITS)
  assert.equal(creditLimit(premium), FREE_MONTHLY_CREDITS)
  assert.equal(creditLimit({ uid: 'x', role: 'inconnu' }), FREE_MONTHLY_CREDITS)
  assert.equal(creditLimit(premiumIA), MONTHLY_CREDITS.premium_plus)
  assert.equal(creditLimit(enseignant), MONTHLY_CREDITS.enseignant)
  assert.ok(MONTHLY_CREDITS.premium_plus > FREE_MONTHLY_CREDITS)
})

test('compte gratuit vérifié : génération autorisée sous le plafond', () => {
  const q = freshQuota(gratuit)
  assert.equal(quotaError(gratuit, q, 'corto'), null)
  q.monthlyUsed = FREE_MONTHLY_CREDITS - 2
  assert.equal(quotaError(gratuit, q, 'medio'), null) // coûte 2, il en reste 2
})

test('compte gratuit : refusé si le coût dépasse les crédits restants', () => {
  const q = freshQuota(gratuit)
  q.monthlyUsed = FREE_MONTHLY_CREDITS - 1
  assert.match(quotaError(gratuit, q, 'medio'), /Crédits mensuels insuffisants/) // coûte 2, il n'en reste qu'1
  assert.match(quotaError(gratuit, q, 'medio'), new RegExp(`1 restant sur ${FREE_MONTHLY_CREDITS}`))
})

test('adresse e-mail non vérifiée : aucun outil IA, quel que soit le rôle', () => {
  assert.match(quotaError(gratuitNonVerifie, freshQuota(gratuitNonVerifie), 'corto'), /Vérifiez votre adresse/)
  assert.match(correctionQuotaError(gratuitNonVerifie, freshQuota(gratuitNonVerifie)), /Vérifiez votre adresse/)
  assert.match(dialogueQuotaError(gratuitNonVerifie, freshQuota(gratuitNonVerifie)), /Vérifiez votre adresse/)
  const eleveNonVerifie = { uid: 'u7', role: 'premium_plus', premium: true, emailVerified: false }
  assert.match(quotaError(eleveNonVerifie, freshQuota(eleveNonVerifie), 'corto'), /Vérifiez votre adresse/)
})

test("l'ancien rôle Premium (lecture seule) a les mêmes crédits que le gratuit", () => {
  const q = freshQuota(premium)
  assert.equal(quotaError(premium, q, 'corto'), null)
  q.monthlyUsed = FREE_MONTHLY_CREDITS
  assert.match(quotaError(premium, q, 'corto'), /Crédits mensuels insuffisants/)
})

test('correction et dialogue : mêmes crédits mensuels que la génération', () => {
  const q = freshQuota(gratuit)
  assert.equal(correctionQuotaError(gratuit, q), null)
  assert.equal(dialogueQuotaError(gratuit, q), null)
  q.monthlyUsed = FREE_MONTHLY_CREDITS - CORRECTION_COST
  assert.equal(correctionQuotaError(gratuit, q), null)
  assert.match(dialogueQuotaError(gratuit, q), /Crédits mensuels insuffisants/)
  q.monthlyUsed = FREE_MONTHLY_CREDITS
  assert.match(correctionQuotaError(gratuit, q), /pour une correction/)
  q.monthlyUsed = FREE_MONTHLY_CREDITS - DIALOGUE_COST
  assert.equal(dialogueQuotaError(gratuit, q), null)
})

test('rôles élevés (attribués à la main) : plafonds propres, indépendants', () => {
  const q = freshQuota(premiumIA)
  q.monthlyUsed = MONTHLY_CREDITS.premium_plus - 2
  assert.equal(quotaError(premiumIA, q, 'medio'), null)
  q.monthlyUsed = MONTHLY_CREDITS.premium_plus - 1
  assert.match(quotaError(premiumIA, q, 'medio'), /Crédits mensuels insuffisants/)

  const qe = freshQuota(enseignant)
  qe.monthlyUsed = MONTHLY_CREDITS.enseignant - 4
  assert.equal(quotaError(enseignant, qe, 'molto_lungo'), null) // coûte 4
  qe.monthlyUsed = MONTHLY_CREDITS.enseignant
  assert.match(quotaError(enseignant, qe, 'corto'), /Crédits mensuels insuffisants/)
})

test('resetIfStale remet le compteur mensuel à zéro au changement de mois civil', () => {
  const q = { monthlyUsed: 7, periodAnchor: '2026-01' }
  const reset = resetIfStale(gratuit, q, new Date('2026-02-15T10:00:00Z'))
  assert.equal(reset.monthlyUsed, 0)
  assert.equal(reset.periodAnchor, '2026-02')
})

test('resetIfStale ne touche rien si on est toujours dans le même mois', () => {
  const now = new Date('2026-02-15T10:00:00Z')
  const q = freshQuota(gratuit, now)
  q.monthlyUsed = 7
  const reset = resetIfStale(gratuit, q, now)
  assert.equal(reset.monthlyUsed, 7)
})

test("resetIfStale garde l'ancre periodEnd d'un ancien abonnement Stripe (pas de remise à zéro surprise)", () => {
  const ancienAbonne = { uid: 'u5', role: 'premium_plus', premium: true, emailVerified: true, periodEnd: 1750000000 }
  const q = { monthlyUsed: 15, periodAnchor: 'stripe:1750000000' }
  const same = resetIfStale(ancienAbonne, { ...q }, new Date('2026-03-01T00:00:00Z'))
  assert.equal(same.monthlyUsed, 15)
  const renewed = { ...ancienAbonne, periodEnd: 1752600000 }
  const after = resetIfStale(renewed, { ...q }, new Date('2026-03-01T00:00:00Z'))
  assert.equal(after.monthlyUsed, 0)
})

test('quotaStatus : toujours des crédits, avec le solde et l’état de vérification', () => {
  const q = freshQuota(gratuit)
  q.monthlyUsed = 3
  assert.deepEqual(quotaStatus(gratuit, q), {
    type: 'credits',
    limit: FREE_MONTHLY_CREDITS,
    used: 3,
    remaining: FREE_MONTHLY_CREDITS - 3,
    emailVerified: true,
  })
  // L'app s'en sert pour afficher « confirmez votre adresse » au lieu du
  // bouton (CreateTextView.vue) : solde nul tant que l'adresse n'est pas
  // confirmée.
  assert.deepEqual(quotaStatus(gratuitNonVerifie, freshQuota(gratuitNonVerifie)), {
    type: 'credits',
    limit: FREE_MONTHLY_CREDITS,
    used: 0,
    remaining: 0,
    emailVerified: false,
  })
  const qIA = freshQuota(premiumIA)
  qIA.monthlyUsed = 5
  assert.equal(quotaStatus(premiumIA, qIA).limit, MONTHLY_CREDITS.premium_plus)
  assert.equal(quotaStatus(premiumIA, qIA).remaining, MONTHLY_CREDITS.premium_plus - 5)
})

test('isFreeAccount : seuls les rôles élevés échappent à la limite par IP', () => {
  assert.equal(isFreeAccount(gratuit), true)
  assert.equal(isFreeAccount(premium), true)
  assert.equal(isFreeAccount({ uid: 'x' }), true)
  assert.equal(isFreeAccount(premiumIA), false)
  assert.equal(isFreeAccount(enseignant), false)
})

// --- Anciennes claims d'essai (trialEnd), encore présentes sur des comptes ---
const NOW = new Date('2026-10-22T12:00:00Z')
const nowS = Math.floor(NOW.getTime() / 1000)

test('resolveRole : un ancien essai échu retombe sur gratuit, un essai en cours garde premium_plus', () => {
  assert.equal(resolveRole({ role: 'premium_plus', premium: true, trialEnd: nowS - 10 }, NOW), 'gratuit')
  assert.equal(resolveRole({ role: 'premium_plus', premium: true, trialEnd: nowS + 10 }, NOW), 'premium_plus')
  assert.equal(resolveRole({ role: 'premium_plus', trialEnd: nowS - 10, periodEnd: nowS + 5 }, NOW), 'premium_plus')
  assert.equal(resolveRole({ premium: true }, NOW), 'premium')
  assert.equal(resolveRole({}, NOW), 'gratuit')
})

test('un ancien essai échu a les crédits gratuits, pas zéro', () => {
  const u = { uid: 'ut', role: resolveRole({ role: 'premium_plus', trialEnd: nowS - 10 }, NOW), emailVerified: true }
  assert.equal(creditLimit(u), FREE_MONTHLY_CREDITS)
  assert.equal(quotaError(u, freshQuota(u, NOW), 'corto'), null)
})
