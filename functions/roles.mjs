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
