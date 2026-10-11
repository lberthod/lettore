// Statut d'abonnement Stripe → droits (SEC-4). Pur, testé dans
// subscription.test.mjs.
//
// Seuls `active` et `trialing` gardent les droits. `past_due` (paiement de
// renouvellement échoué, Stripe réessaie) bénéficie d'un délai de grâce court
// et explicite — PAST_DUE_GRACE_DAYS depuis le début de la période impayée
// (`current_period_start`) ; passé ce délai (ou si l'événement arrive plus
// tard), les droits sont retirés. `unpaid`, `incomplete`, `incomplete_expired`,
// `canceled` et tout statut inconnu : rétrogradation.

export const PAST_DUE_GRACE_DAYS = 3
const KEEP = new Set(['active', 'trialing'])

export function subscriptionAccess(sub, nowS = Math.floor(Date.now() / 1000)) {
  const status = sub?.status
  if (KEEP.has(status)) return { premium: true, reason: status }
  if (status === 'past_due') {
    const start = Number(sub.current_period_start) || 0
    if (start && nowS - start <= PAST_DUE_GRACE_DAYS * 24 * 60 * 60) {
      return { premium: true, reason: 'past_due_grace' }
    }
    return { premium: false, reason: 'past_due_expired' }
  }
  return { premium: false, reason: status || 'unknown' }
}
