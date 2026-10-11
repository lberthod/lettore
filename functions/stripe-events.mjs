// Traitement des événements du webhook Stripe — extrait de index.js (QUA-2)
// pour être testable sans Firebase. `applyRole(uid, premium, role, periodEnd)`
// et `roleForSession(session)` sont injectés.

import { subscriptionAccess } from './subscription.mjs'

export async function handleStripeEvent(event, { stripe, applyRole, roleForSession, nowS }) {
  switch (event.type) {
    // Achat/abonnement validé → premium activé.
    // L'uid Firebase doit être passé dans metadata.firebaseUid côté création
    // de la Checkout Session (client_reference_id possible aussi).
    case 'checkout.session.completed': {
      const session = event.data.object
      const uid = session.metadata?.firebaseUid || session.client_reference_id
      if (!uid) return
      const role = await roleForSession(session)
      let periodEnd
      // Recopie l'uid (et le rôle, pour la résiliation) sur l'abonnement :
      // customer.subscription.deleted ne reçoit que les métadonnées de
      // l'abonnement, pas celles de la session. La même réponse donne
      // `current_period_end`, ancre de renouvellement des crédits.
      if (session.subscription) {
        const sub = await stripe.subscriptions.update(session.subscription, {
          metadata: { firebaseUid: uid, ...(role ? { role } : {}) },
        })
        periodEnd = sub.current_period_end
      }
      await applyRole(uid, true, role, periodEnd)
      return
    }
    // Renouvellement, changement de formule, impayé… : seuls `active` et
    // `trialing` gardent les droits (voir subscription.mjs, SEC-4).
    case 'customer.subscription.updated': {
      const sub = event.data.object
      const uid = sub.metadata?.firebaseUid
      if (!uid) return
      const access = subscriptionAccess(sub, nowS)
      if (access.premium) {
        await applyRole(uid, true, sub.metadata?.role, sub.current_period_end)
      } else {
        await applyRole(uid, false, 'gratuit')
      }
      return
    }
    // Abonnement annulé/expiré → droits retirés (retour au rôle gratuit).
    case 'customer.subscription.deleted': {
      const sub = event.data.object
      const uid = sub.metadata?.firebaseUid
      if (uid) await applyRole(uid, false, 'gratuit')
      return
    }
    default:
      // Événements non gérés : on accuse simplement réception.
      return
  }
}
