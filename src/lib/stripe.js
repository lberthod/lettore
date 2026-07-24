// Configuration Stripe — à remplir quand le compte Stripe sera prêt.
//
// Option la plus simple sans backend : les "Payment Links" créés dans le
// dashboard Stripe (https://dashboard.stripe.com/payment-links). Collez
// l'URL de chaque lien ci-dessous et la page Abonnement fonctionnera.

export const stripeConfig = {
  // Clé publique (pk_live_... ou pk_test_...), utile plus tard pour Checkout
  publishableKey: '',
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

export const premiumPlan = {
  id: 'premium',
  name: 'Premium',
  highlight: true,
  monthly: {
    price: swiss ? '5 CHF' : '6 €',
    period: '/ mois',
    paymentLink: '', // ← coller ici l'URL du Payment Link Stripe (mensuel)
  },
  annual: {
    price: swiss ? '45 CHF' : '50 €',
    period: '/ an',
    paymentLink: '', // ← coller ici l'URL du Payment Link Stripe (annuel)
  },
  features: [
    'Accès à tous les textes du catalogue',
    'Nouveaux textes chaque semaine',
    'Tous les niveaux, de A1 à C2',
    'Soutient un projet indépendant',
  ],
}

export const premiumPlusPlan = {
  id: 'premium_plus',
  name: 'Premium+',
  monthly: {
    price: swiss ? '15 CHF' : '16 €',
    period: '/ mois',
    paymentLink: '', // ← coller ici l'URL du Payment Link Stripe (mensuel)
  },
  annual: {
    price: swiss ? '150 CHF' : '160 €',
    period: '/ an',
    paymentLink: '', // ← coller ici l'URL du Payment Link Stripe (annuel)
  },
  features: [
    'Tout le Premium',
    'Notifications pour les nouveaux textes générés',
    'Jusqu’à 3 textes générés par jour, sur le thème ou l’actualité de votre choix',
    'Bibliothèque d’ebooks classiques traduits et gradués : La Parure, Le Horla, Rosso Malpelo, Pinocchio, Le Dernier Jour d’un condamné, Candide, Il fu Mattia Pascal, Inferno…',
  ],
}

export const teacherPlan = {
  id: 'enseignant',
  name: 'Enseignant',
  monthly: {
    price: swiss ? '20 CHF' : '25 €',
    period: '/ mois',
    paymentLink: '', // ← coller ici l'URL du Payment Link Stripe (mensuel)
  },
  annual: {
    price: swiss ? '200 CHF' : '250 €',
    period: '/ an',
    paymentLink: '', // ← coller ici l'URL du Payment Link Stripe (annuel)
  },
  features: [
    'Tout le Premium',
    'Partage gratuit des textes créés via une URL publique',
    "Aucun compte Leggendo requis pour les élèves qui consultent le lien",
    'Idéal pour les enseignants et leurs classes',
  ],
}

export const gratuitPlan = {
  id: 'gratuit',
  name: 'Gratuit',
  monthly: { price: swiss ? '0 CHF' : '0 €', period: '', paymentLink: null },
  annual: { price: swiss ? '0 CHF' : '0 €', period: '', paymentLink: null },
  features: [
    'Une sélection de textes découverte',
    'Traduction des mots et des phrases',
    'Lecture audio en italien',
    'Quiz de compréhension',
  ],
}

export const plans = [gratuitPlan, premiumPlan, teacherPlan]

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
