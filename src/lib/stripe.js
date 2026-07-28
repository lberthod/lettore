// Configuration Stripe — à remplir quand le compte Stripe sera prêt.
//
// Option la plus simple sans backend : les "Payment Links" créés dans le
// dashboard Stripe (https://dashboard.stripe.com/payment-links). Collez
// l'URL de chaque lien ci-dessous et la page Abonnement fonctionnera.

export const stripeConfig = {
  // Clé publique (pk_live_... ou pk_test_...), utile plus tard pour Checkout
  publishableKey:
    'pk_live_51TDopGKFCJv6x4JZm9mfh2sW2hvpxPph1IkyPWn7vqsBxdbK9Dhh0d75AlvEMFtyHKIYnQJKDzk1zhAMkutqf5IS00ztZ2uumu',
}

// Abonnements facturés en CHF en Suisse et en EUR ailleurs en Europe.
// Détection simple via la langue/le fuseau horaire du navigateur — aucune
// donnée n'est envoyée, c'est purement indicatif côté affichage.
function isSwitzerland() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    if (tz.includes('Zurich')) return true
    const locale = navigator.language || ''
    return /-CH$/i.test(locale)
  } catch {
    return false
  }
}

const swiss = isSwitzerland()

// Tarification et périmètre fonctionnel : voir README_TARIFICATION.md
// (décision de lancement, source de vérité — ne pas modifier les prix ou
// les fonctionnalités listées ici sans mettre à jour ce document).

export const premiumPlan = {
  id: 'premium',
  name: 'Premium',
  highlight: true,
  monthly: {
    price: swiss ? '7,90 CHF' : '7,90 €',
    period: '/ mois',
    paymentLink: 'https://buy.stripe.com/dRm00k2zz3bSc8zcQOfEk04',
    productId: 'premium_monthly', // ← souscription Google Play (voir apkdoc.md)
  },
  annual: {
    price: swiss ? '79,90 CHF' : '79 €',
    period: '/ an',
    paymentLink: 'https://buy.stripe.com/7sYeVe3DDfYEb4v4kifEk06',
    productId: 'premium_annual',
  },
  features: [
    'Accès à l’ensemble du catalogue, tous niveaux (A1 à C2)',
    'Traductions, audio et quiz',
    'Favoris et vocabulaire sauvegardé',
    'Progression synchronisée entre appareils',
    'Nouveaux textes ajoutés régulièrement',
    'Lecture hors ligne',
  ],
}

// Nom commercial « Premium IA » (voir README_TARIFICATION.md, §Règles
// d'accès) — l'identifiant technique `premium_plus` reste inchangé dans le
// code (rôle Firebase, firestore.rules) pour éviter une migration inutile.
export const premiumPlusPlan = {
  id: 'premium_plus',
  name: 'Premium IA',
  monthly: {
    price: swiss ? '14,90 CHF' : '14,90 €',
    period: '/ mois',
    paymentLink: 'https://buy.stripe.com/9B6cN6ded4fW6Of6sqfEk02',
    productId: 'premium_plus_monthly',
  },
  annual: {
    price: swiss ? '149 CHF' : '149 €',
    period: '/ an',
    paymentLink: 'https://buy.stripe.com/7sYfZigqp7s8fkL8AyfEk05',
    productId: 'premium_plus_annual',
  },
  features: [
    'Tout le Premium',
    '30 crédits de génération par mois (sujet, niveau, genre et longueur au choix)',
    'Bibliothèque personnelle des textes créés, notification à la fin de la génération',
    'Bibliothèque de classiques italiens adaptés et gradués : Pinocchio, Il Principe, Rosso Malpelo, Il fu Mattia Pascal, Inferno (Divina Commedia)…',
    'Notizie : jusqu’à 3 textes d’actualité italienne générés chaque jour',
  ],
}

export const teacherPlan = {
  id: 'enseignant',
  name: 'Enseignant',
  monthly: {
    price: swiss ? '24,90 CHF' : '24,90 €',
    period: '/ mois',
    paymentLink: 'https://buy.stripe.com/eVq5kE0rr13K1tV7wufEk00',
    productId: 'enseignant_monthly',
  },
  annual: {
    price: swiss ? '249 CHF' : '249 €',
    period: '/ an',
    paymentLink: 'https://buy.stripe.com/dRm3cwfmlfYE4G7bMKfEk01',
    productId: 'enseignant_annual',
  },
  features: [
    'Tout Premium IA (100 crédits de génération par mois)',
    'Partage d’un texte par URL publique, sans compte requis pour les élèves',
    'Classes et dossiers, affectation d’un texte à une classe',
    'Personnalisation des quiz, duplication et adaptation d’un texte existant',
    'Export PDF',
    'Statistiques simples : ouvertures, lectures et quiz terminés',
  ],
}

export const gratuitPlan = {
  id: 'gratuit',
  name: 'Gratuit',
  monthly: { price: swiss ? '0 CHF' : '0 €', period: '', paymentLink: null },
  annual: { price: swiss ? '0 CHF' : '0 €', period: '', paymentLink: null },
  features: [
    '6 à 10 textes complets répartis sur plusieurs niveaux',
    'Traduction des mots et des phrases',
    'Lecture audio en italien',
    'Quiz de compréhension',
    'Une génération IA d’essai après inscription',
  ],
}

export const plans = [gratuitPlan, premiumPlan, premiumPlusPlan, teacherPlan]

// URL de paiement liée au compte : le webhook Stripe (functions/index.js)
// retrouve l'utilisateur via client_reference_id pour activer le premium.
export function checkoutUrl(paymentLink, user) {
  const url = new URL(paymentLink)
  url.searchParams.set('client_reference_id', user.uid)
  if (user.email) url.searchParams.set('prefilled_email', user.email)
  return url.toString()
}

export const stripeReady = plans.some(
  (p) => p.monthly.paymentLink || p.annual.paymentLink,
)
