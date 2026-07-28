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
  // Premium
  price_1Ty5I6KFCJv6x4JZL1Zgd7o0: 'premium', // mensuel
  price_1Ty5MRKFCJv6x4JZD7yJmuhs: 'premium', // annuel
  // Premium IA (premium_plus)
  price_1Ty5N7KFCJv6x4JZUgnj5G63: 'premium_plus', // mensuel
  price_1Ty5OTKFCJv6x4JZ2EeulBJ5: 'premium_plus', // annuel
  // Enseignant
  price_1Ty5OzKFCJv6x4JZ1rX7gC5X: 'enseignant', // mensuel
  price_1Ty5QhKFCJv6x4JZccKwYT2K: 'enseignant', // annuel
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

// Correspondance Product ID App Store Connect → rôle Leggendo. Doit rester
// synchronisé avec `appleProducts` dans src/lib/iap.js et avec les achats
// intégrés créés dans App Store Connect.
export const APPLE_PRODUCT_ROLE_MAP = {
  'com.leggendo.app.premium.monthly': 'premium',
  'com.leggendo.app.premium.annual': 'premium',
  'com.leggendo.app.premiumplus.monthly': 'premium_plus',
  'com.leggendo.app.premiumplus.annual': 'premium_plus',
  'com.leggendo.app.enseignant.monthly': 'enseignant',
  'com.leggendo.app.enseignant.annual': 'enseignant',
}

export function roleForAppleProductId(productId) {
  if (!productId) return undefined
  const role = APPLE_PRODUCT_ROLE_MAP[productId]
  if (!role) {
    console.warn('Product ID Apple non répertorié dans APPLE_PRODUCT_ROLE_MAP :', productId)
  }
  return role
}
