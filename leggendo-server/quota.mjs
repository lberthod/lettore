// Logique des crédits de génération (pure, sans dépendance Firestore — voir
// TODO_SECURITE.md, point 4). Isolée de server.mjs pour être testable seule.
//
// Barème défini dans README_TARIFICATION.md :
// - Gratuit    : 1 génération d'essai, à vie (jamais renouvelée).
// - Premium    : pas d'accès à la génération IA (formule lecture uniquement).
// - Premium IA (rôle technique `premium_plus`) : 30 crédits par mois.
// - Enseignant : 100 crédits par mois (inclut les droits Premium IA).
// Coût par taille de texte (CREDIT_COST). Une génération qui échoue pour une
// raison technique ne consomme pas de crédit — voir `refundCredit` dans
// jobs.mjs, appelé quand un job se termine en erreur.

export const FREE_TRIAL_CREDITS = 1
export const MONTHLY_CREDITS = { premium_plus: 30, enseignant: 100 }
export const CREDIT_COST = { corto: 1, medio: 2, lungo: 3, molto_lungo: 4 }

export function creditCost(sizeId) {
  return CREDIT_COST[sizeId] ?? 1
}

export function monthKey(now = new Date()) {
  return now.toISOString().slice(0, 7) // YYYY-MM
}

export function freshQuota(now = new Date()) {
  return { trialUsed: false, monthlyUsed: 0, monthlyMonth: monthKey(now) }
}

// Remet à zéro le compteur mensuel si on a changé de mois. Le crédit d'essai
// gratuit, lui, n'est jamais remis à zéro (c'est un capital à vie, pas
// périodique).
export function resetIfStale(q, now = new Date()) {
  if (q.monthlyMonth !== monthKey(now)) {
    q.monthlyMonth = monthKey(now)
    q.monthlyUsed = 0
  }
  return q
}

function isCreditRole(role) {
  return role === 'premium_plus' || role === 'enseignant'
}

// Renvoie un message d'erreur si la génération doit être refusée, sinon null.
export function quotaError(user, q, sizeId) {
  if (isCreditRole(user.role)) {
    const limit = MONTHLY_CREDITS[user.role]
    const cost = creditCost(sizeId)
    if (q.monthlyUsed + cost > limit) {
      const remaining = Math.max(0, limit - q.monthlyUsed)
      return `Crédits mensuels insuffisants (${remaining} restant${remaining > 1 ? 's' : ''} sur ${limit}, ${cost} requis pour ce format).`
    }
    return null
  }

  if (user.role === 'premium') {
    return 'La formule Premium ne comprend pas la génération de textes — passez à Premium IA pour créer vos propres lectures.'
  }

  // Gratuit : un unique essai, jamais renouvelé.
  if (q.trialUsed) {
    return 'Génération d’essai déjà utilisée — passez à Premium IA pour continuer à créer vos propres textes.'
  }
  return null
}

// Solde à afficher côté client avant de lancer une génération (voir
// README_TARIFICATION.md, § Règles des crédits : « le solde doit être
// visible avant de lancer une génération »).
export function quotaStatus(user, q) {
  if (isCreditRole(user.role)) {
    const limit = MONTHLY_CREDITS[user.role]
    const used = q.monthlyUsed
    return { type: 'credits', limit, used, remaining: Math.max(0, limit - used) }
  }
  if (user.role === 'premium') {
    return { type: 'no_access' }
  }
  return { type: 'trial', used: q.trialUsed ? 1 : 0, remaining: q.trialUsed ? 0 : FREE_TRIAL_CREDITS }
}

export class QuotaExceededError extends Error {}
