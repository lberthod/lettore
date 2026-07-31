// Logique des crédits de génération (pure, sans dépendance Firestore — voir
// TODO_SECURITE.md, point 4). Isolée de server.mjs pour être testable seule.
//
// Barème défini dans README_TARIFICATION.md :
// - Gratuit    : 1 génération d'essai, à vie (jamais renouvelée).
// - Premium    : pas d'accès à la génération IA (formule lecture uniquement).
// - Premium IA (rôle technique `premium_plus`) : 30 crédits par mois.
// - Enseignant : 100 crédits par mois (inclut les droits Premium IA).
// Coût par taille de texte (CREDIT_COST). Une génération qui échoue pour une
// raison technique ne consomme pas de crédit — voir `failJob` dans jobs.mjs,
// qui clôture le job et le rembourse dans la même transaction.

export const FREE_TRIAL_CREDITS = 1
export const MONTHLY_CREDITS = { premium_plus: 30, enseignant: 100 }
export const CREDIT_COST = { corto: 1, medio: 2, lungo: 3, molto_lungo: 4 }
// Correction d'une production écrite (Phase 5) : même barème que « corto ».
export const CORRECTION_COST = 1
// Dialogue simulé (Phase 7) : tarification à la SESSION, pas au tour — le
// coût doit être prévisible pour l'utilisateur avant d'ouvrir la scène. Les
// 2 crédits sont réservés à l'ouverture ; le plafond de tours utilisateur
// (MAX_DIALOGUE_TURNS, appliqué côté serveur dans server.mjs) borne le nombre
// d'appels LLM que ces 2 crédits peuvent déclencher.
export const DIALOGUE_COST = 2
export const MAX_DIALOGUE_TURNS = 12

export const EMAIL_NOT_VERIFIED =
  'Vérifiez votre adresse e-mail pour lancer votre génération d’essai : un lien vous a été envoyé à l’inscription.'

export function creditCost(sizeId) {
  return CREDIT_COST[sizeId] ?? 1
}

export function monthKey(now = new Date()) {
  return now.toISOString().slice(0, 7) // YYYY-MM
}

// Ancre de la période de crédits en cours. Priorité à `user.periodEnd` — la
// date de fin de période Stripe (claim Firebase posée par
// functions/index.js à partir de `subscription.current_period_end`) : elle
// change à chaque renouvellement réel de l'abonnement, donc comparer cette
// valeur à celle stockée dans le quota suffit à détecter un nouveau cycle,
// quel que soit le jour du mois où l'abonnement a été souscrit (voir
// README_TARIFICATION.md, § Règles des crédits). Pour un compte sans
// abonnement Stripe (essai gratuit, rôle attribué à la main), on retombe sur
// le mois civil UTC faute de date de référence.
function periodAnchor(user, now) {
  return user?.periodEnd ? `stripe:${user.periodEnd}` : monthKey(now)
}

export function freshQuota(user, now = new Date()) {
  return { trialUsed: false, monthlyUsed: 0, periodAnchor: periodAnchor(user, now) }
}

// Remet à zéro le compteur mensuel si on a changé de période de facturation.
// Le crédit d'essai gratuit, lui, n'est jamais remis à zéro (c'est un
// capital à vie, pas périodique).
export function resetIfStale(user, q, now = new Date()) {
  const anchor = periodAnchor(user, now)
  if (q.periodAnchor !== anchor) {
    q.periodAnchor = anchor
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
  // …et seulement une fois l'adresse e-mail vérifiée. C'est l'essai gratuit
  // qui rend l'inscription en masse rentable pour un attaquant (un compte
  // jetable = une génération payée par nous) : exiger une boîte aux lettres
  // réelle casse l'automatisation à faible coût. Les rôles payants ne sont
  // pas soumis à ce contrôle — ils ont déjà passé Stripe, et l'adresse de
  // facturation peut différer de celle du compte Firebase.
  if (!user.emailVerified) {
    return EMAIL_NOT_VERIFIED
  }
  return null
}

// Refus/autorisation d'une correction d'écriture (Phase 5). Choix assumé :
// la correction est réservée aux rôles à crédits (premium_plus/enseignant),
// SANS essai gratuit. L'essai gratuit existant est un capital unique à vie
// (`trialUsed`, un booléen) entièrement pensé pour la génération : le
// partager avec la correction ferait consommer silencieusement, pour une
// petite correction, la seule génération d'essai du compte — et en créer un
// second compteur d'essai rouvrirait la surface d'abus (comptes jetables)
// que TODO_SECURITE.md a justement fermée. Aligné sur l'accès client
// (src/lib/access.js : correction = premium_plus/enseignant, comme Notizie).
export function correctionQuotaError(user, q) {
  if (!isCreditRole(user.role)) {
    return 'La correction de textes fait partie de la formule Premium IA — passez à Premium IA pour faire corriger vos productions écrites.'
  }
  const limit = MONTHLY_CREDITS[user.role]
  if (q.monthlyUsed + CORRECTION_COST > limit) {
    const remaining = Math.max(0, limit - q.monthlyUsed)
    return `Crédits mensuels insuffisants (${remaining} restant${remaining > 1 ? 's' : ''} sur ${limit}, ${CORRECTION_COST} requis pour une correction).`
  }
  return null
}

// Refus/autorisation d'un dialogue simulé (Phase 7). Même choix documenté
// que la correction : réservé aux rôles à crédits (premium_plus/enseignant),
// SANS essai gratuit — l'essai existant est le capital unique de génération,
// et un compteur d'essai séparé rouvrirait l'abus par comptes jetables que
// TODO_SECURITE.md a fermé. Aligné sur l'accès client (src/lib/access.js :
// hasDialogueAccess = premium_plus/enseignant, comme la correction).
export function dialogueQuotaError(user, q) {
  if (!isCreditRole(user.role)) {
    return 'Le dialogue simulé fait partie de la formule Premium IA — passez à Premium IA pour converser avec votre partenaire de dialogue.'
  }
  const limit = MONTHLY_CREDITS[user.role]
  if (q.monthlyUsed + DIALOGUE_COST > limit) {
    const remaining = Math.max(0, limit - q.monthlyUsed)
    return `Crédits mensuels insuffisants (${remaining} restant${remaining > 1 ? 's' : ''} sur ${limit}, ${DIALOGUE_COST} requis pour un dialogue).`
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
  // `emailVerified` sert à l'affichage : l'app invite à vérifier l'adresse
  // avant de proposer le bouton plutôt que de laisser partir une requête
  // qui sera refusée (voir quotaError et CreateTextView.vue).
  return {
    type: 'trial',
    used: q.trialUsed ? 1 : 0,
    remaining: q.trialUsed ? 0 : FREE_TRIAL_CREDITS,
    emailVerified: Boolean(user.emailVerified),
  }
}

export class QuotaExceededError extends Error {}
