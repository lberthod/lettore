// Logique de rôles — pure, sans dépendance Firebase Admin/Functions, pour
// rester testable sans émulateur (voir roles.test.mjs).

import { HttpsError } from 'firebase-functions/v2/https'

export const ROLES = ['gratuit', 'premium', 'premium_plus', 'enseignant']

// Seul ce compte peut appeler les fonctions d'administration.
export const ADMIN_EMAIL = 'lberthod@gmail.com'

// Comparaison normalisée (casse, espaces) : certains fournisseurs (Google…)
// peuvent renvoyer l'e-mail avec une casse différente de celle saisie.
export function requireAdmin(request) {
  const email = (request.auth?.token?.email || '').trim().toLowerCase()
  if (email !== ADMIN_EMAIL) {
    console.warn('Appel admin refusé', {
      email: email || '(aucun e-mail dans le token)',
      uid: request.auth?.uid || null,
    })
    throw new HttpsError('permission-denied', 'Réservé à l’administrateur.')
  }
}

// Correspondance Stripe Price ID → rôle Leggendo. À compléter avec les Price
// ID réels une fois les Payment Links/Checkout créés dans le dashboard
// Stripe (voir README_TARIFICATION.md pour les formules). Tant qu'un prix
// n'est pas dans cette table, le webhook retombe sur `premium: true` sans
// préciser de rôle (comportement historique, non-régressif).
export const PRICE_ROLE_MAP = {
  // 'price_xxx': 'premium',
  // 'price_yyy': 'premium_plus',
  // 'price_zzz': 'enseignant',
}

// Résout le rôle associé à un Price ID Stripe ; avertit si le prix est
// inconnu de la table plutôt que d'échouer silencieusement.
export function roleForPriceId(priceId) {
  if (!priceId) return undefined
  const role = PRICE_ROLE_MAP[priceId]
  if (!role) {
    console.warn('Price ID Stripe non répertorié dans PRICE_ROLE_MAP :', priceId)
  }
  return role
}

// Correspondance ID produit Google Play (souscriptions) → rôle Leggendo.
// Les ID ci-dessous sont ceux utilisés par le client (src/lib/billing.js) —
// il faut créer des souscriptions avec exactement ces ID dans Play Console
// (Monétiser > Produits > Abonnements) avant que l'achat in-app fonctionne.
// Voir apkdoc.md, § Google Play Billing.
export const PLAY_PRODUCT_ROLE_MAP = {
  premium_monthly: 'premium',
  premium_annual: 'premium',
  premium_plus_monthly: 'premium_plus',
  premium_plus_annual: 'premium_plus',
  enseignant_monthly: 'enseignant',
  enseignant_annual: 'enseignant',
}

export function roleForProductId(productId) {
  if (!productId) return undefined
  const role = PLAY_PRODUCT_ROLE_MAP[productId]
  if (!role) {
    console.warn('Product ID Google Play non répertorié :', productId)
  }
  return role
}
