// Configuration Stripe — à remplir quand le compte Stripe sera prêt.
//
// Option la plus simple sans backend : les "Payment Links" créés dans le
// dashboard Stripe (https://dashboard.stripe.com/payment-links). Collez
// l'URL de chaque lien ci-dessous et la page Abonnement fonctionnera.

export const stripeConfig = {
  // Clé publique (pk_live_... ou pk_test_...), utile plus tard pour Checkout
  publishableKey: '',
}

export const plans = [
  {
    id: 'gratuit',
    name: 'Gratuit',
    price: '0 CHF',
    period: '',
    features: [
      'Accès à une sélection de textes',
      'Traduction des mots au survol',
      'Lecture audio des phrases',
    ],
    paymentLink: null, // pas de paiement
  },
  {
    id: 'mensuel',
    name: 'Premium mensuel',
    price: '5 CHF',
    period: '/ mois',
    features: [
      'Accès à tous les textes',
      'Nouveaux textes chaque semaine',
      'Traduction de phrases entières',
      'Sans publicité',
    ],
    paymentLink: '', // ← coller ici l'URL du Payment Link Stripe
  },
  {
    id: 'annuel',
    name: 'Premium annuel',
    price: '45 CHF',
    period: '/ an',
    highlight: true,
    features: [
      'Tout le Premium mensuel',
      '2 mois offerts',
      'Accès prioritaire aux nouveautés',
    ],
    paymentLink: '', // ← coller ici l'URL du Payment Link Stripe
  },
]

export const stripeReady = plans.some((p) => p.paymentLink)
