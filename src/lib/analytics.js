// Événements métier GA4 (voir GPTanalyse.md, § 5 « Mesurer le tunnel »).
//
// Construit sur getAnalyticsInstance() (src/lib/firebase.js), déjà chargé de
// façon paresseuse à l'inactivité en production. Chaque fonction échoue
// silencieusement si Analytics n'est pas disponible (SSR, navigateur non
// supporté, tracking bloqué) : aucun appelant n'a à vérifier l'état
// d'Analytics avant de journaliser un événement.
//
// trackPurchase n'est volontairement pas appelée nulle part pour l'instant :
// le paiement se termine sur une page Stripe hébergée hors de l'app (Payment
// Links), la confirmation arrive par webhook serveur (functions/index.js),
// jamais par un retour mesurable dans le SPA. Mieux vaut l'absence
// d'événement qu'un événement non fiable.

import { getAnalyticsInstance } from './firebase.js'

async function track(name, params) {
  try {
    const analytics = await getAnalyticsInstance()
    if (!analytics) return
    const { logEvent } = await import('firebase/analytics')
    logEvent(analytics, name, params)
  } catch {
    // Ne jamais faire échouer une action utilisateur pour un événement de mesure.
  }
}

export function trackPageView(path, title) {
  track('page_view', { page_path: path, page_title: title })
}

export function trackCtaClick({ placement, action, destination }) {
  track('cta_click', { placement, action, destination })
}

export function trackTextOpened({ textId, level, access }) {
  track('view_item', { text_id: textId, level, access })
}

export function trackReadingStarted({ textId, level }) {
  track('select_content', { text_id: textId, level })
}

export function trackReadingCompleted({ textId, level }) {
  track('tutorial_complete', { text_id: textId, level })
}

export function trackWordTranslated({ textId, level }) {
  track('word_translated', { text_id: textId, level })
}

export function trackSignUp(method) {
  track('sign_up', { method })
}

export function trackLogin(method) {
  track('login', { method })
}

export function trackBeginCheckout(plan, billing) {
  track('begin_checkout', { plan, billing })
}

// Volontairement non appelée aujourd'hui — voir commentaire d'en-tête.
export function trackPurchase({ transactionId, plan, value, currency }) {
  track('purchase', { transaction_id: transactionId, plan, value, currency })
}
