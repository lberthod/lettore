// Logique des crédits IA (pure, sans dépendance Firestore — voir
// TODO_SECURITE.md, point 4). Isolée de server.mjs pour être testable seule.
//
// Mode gratuit (GRATUIT.md) : il n'y a plus de formule payante. Tout compte
// connecté dispose chaque mois civil de FREE_MONTHLY_CREDITS crédits IA
// (génération, correction, dialogue), une fois son adresse e-mail vérifiée.
// Les rôles `premium_plus` et `enseignant`, attribués à la main par
// l'administration (adminSetUserRole), gardent un plafond plus élevé — ils
// servent aux tests et à d'éventuels comptes partenaires, pas à la vente.
// Coût par taille de texte (CREDIT_COST). Une génération qui échoue pour une
// raison technique ne consomme pas de crédit — voir `failJob` dans jobs.mjs,
// qui clôture le job et le rembourse dans la même transaction.

export const FREE_MONTHLY_CREDITS = 10
export const MONTHLY_CREDITS = {
  gratuit: FREE_MONTHLY_CREDITS,
  premium: FREE_MONTHLY_CREDITS,
  premium_plus: 30,
  enseignant: 100,
}
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

// Les crédits gratuits rendent l'inscription en masse rentable pour un
// attaquant (un compte jetable = des générations payées par nous) : exiger
// une boîte aux lettres réelle casse l'automatisation à faible coût.
export const EMAIL_NOT_VERIFIED =
  'Vérifiez votre adresse e-mail pour utiliser les outils IA : un lien vous a été envoyé à l’inscription.'

export function creditCost(sizeId) {
  return CREDIT_COST[sizeId] ?? 1
}

export function monthKey(now = new Date()) {
  return now.toISOString().slice(0, 7) // YYYY-MM
}

// Ancre de la période de crédits en cours : le mois civil UTC. Les comptes
// qui portent encore une claim `periodEnd` (anciens abonnements Stripe,
// jamais retirée) gardent cette ancre pour ne pas remettre leur compteur à
// zéro au moment du passage en gratuit.
function periodAnchor(user, now) {
  if (user?.periodEnd) return `stripe:${user.periodEnd}`
  return monthKey(now)
}

function nowSeconds(now) {
  return Math.floor((now instanceof Date ? now.getTime() : Number(now)) / 1000)
}

// Rôles à plafond élevé, attribués à la main (jamais par un paiement).
function isElevatedRole(role) {
  return role === 'premium_plus' || role === 'enseignant'
}

// Compte ordinaire (plafond gratuit) : soumis à la limite de comptes par IP
// (ratelimit.mjs), puisqu'il se crée en quelques secondes.
export function isFreeAccount(user) {
  return !isElevatedRole(user?.role)
}

// Rôle effectif à partir des claims du jeton. Les anciens essais Premium IA
// (claim `trialEnd` posée par `startTrial`/`onUserCreated`, voir
// functions/index.js) ne sont plus accordés, mais des comptes en portent
// encore : un essai échu est traité comme `gratuit` pour qu'il ne conserve
// pas le plafond élevé de `premium_plus`.
export function resolveRole(claims, now = new Date()) {
  const role = claims.role || (claims.premium ? 'premium' : 'gratuit')
  if (
    role === 'premium_plus' &&
    claims.trialEnd &&
    !claims.periodEnd &&
    Number(claims.trialEnd) <= nowSeconds(now)
  ) {
    return 'gratuit'
  }
  return role
}

// Plafond mensuel applicable au compte.
export function creditLimit(user) {
  return MONTHLY_CREDITS[user?.role] ?? FREE_MONTHLY_CREDITS
}

export function freshQuota(user, now = new Date()) {
  return { monthlyUsed: 0, periodAnchor: periodAnchor(user, now) }
}

// Remet à zéro le compteur mensuel si on a changé de période.
export function resetIfStale(user, q, now = new Date()) {
  const anchor = periodAnchor(user, now)
  if (q.periodAnchor !== anchor) {
    q.periodAnchor = anchor
    q.monthlyUsed = 0
  }
  return q
}

function insufficient(q, limit, cost, what) {
  const remaining = Math.max(0, limit - q.monthlyUsed)
  return `Crédits mensuels insuffisants (${remaining} restant${remaining > 1 ? 's' : ''} sur ${limit}, ${cost} requis ${what}).`
}

// Renvoie un message d'erreur si une consommation de `cost` crédits doit
// être refusée, sinon null. `emailVerified` est lu dans l'ID token (jamais
// fourni par le client).
function creditError(user, q, cost, what) {
  if (!user.emailVerified) return EMAIL_NOT_VERIFIED
  const limit = creditLimit(user)
  if (q.monthlyUsed + cost > limit) return insufficient(q, limit, cost, what)
  return null
}

// Génération d'un texte.
export function quotaError(user, q, sizeId) {
  return creditError(user, q, creditCost(sizeId), 'pour ce format')
}

// Correction d'une production écrite (Phase 5).
export function correctionQuotaError(user, q) {
  return creditError(user, q, CORRECTION_COST, 'pour une correction')
}

// Ouverture d'un dialogue simulé (Phase 7).
export function dialogueQuotaError(user, q) {
  return creditError(user, q, DIALOGUE_COST, 'pour un dialogue')
}

// Solde à afficher côté client avant de lancer une action IA. `emailVerified`
// sert à l'affichage : l'app invite à vérifier l'adresse avant de proposer le
// bouton plutôt que de laisser partir une requête qui sera refusée (voir
// CreateTextView.vue, WriteView.vue, DialogueView.vue).
export function quotaStatus(user, q) {
  const limit = creditLimit(user)
  const used = q.monthlyUsed
  const emailVerified = Boolean(user.emailVerified)
  return {
    type: 'credits',
    limit,
    used,
    remaining: emailVerified ? Math.max(0, limit - used) : 0,
    emailVerified,
  }
}

export class QuotaExceededError extends Error {}
