// Cloud Functions — Leggendo (leggendo-dbb84)
//
// - ping          : healthcheck HTTPS (vérifie que le déploiement fonctionne)
// - stripeWebhook : reçoit les événements Stripe et pose le custom claim
//                   `premium` sur l'utilisateur (lu par firestore.rules).
//
// Secrets (à définir AVANT le premier déploiement qui les utilise) :
//   firebase functions:secrets:set STRIPE_SECRET_KEY
//   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
//
// L'URL du webhook (à coller dans le dashboard Stripe) est affichée à la fin
// du déploiement, du type :
//   https://<region>-leggendo-dbb84.cloudfunctions.net/stripeWebhook

import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { setGlobalOptions } from 'firebase-functions/v2'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

initializeApp()
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 })

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY')
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET')

// Healthcheck simple : confirme que les Functions sont en ligne.
export const ping = onRequest((req, res) => {
  res.json({ ok: true, service: 'leggendo-functions' })
})

// Pose (ou retire) le custom claim `premium` sur un utilisateur.
async function setPremium(uid, premium) {
  const auth = getAuth()
  const user = await auth.getUser(uid)
  await auth.setCustomUserClaims(uid, {
    ...(user.customClaims || {}),
    premium,
  })
}

// Webhook Stripe : la signature est vérifiée avec le corps BRUT (req.rawBody).
export const stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const { default: Stripe } = await import('stripe')
    const stripe = new Stripe(STRIPE_SECRET_KEY.value())

    let event
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers['stripe-signature'],
        STRIPE_WEBHOOK_SECRET.value()
      )
    } catch (err) {
      console.error('Signature Stripe invalide :', err.message)
      res.status(400).send(`Webhook Error: ${err.message}`)
      return
    }

    try {
      switch (event.type) {
        // Achat/abonnement validé → premium activé.
        // L'uid Firebase doit être passé dans metadata.firebaseUid côté
        // création de la Checkout Session (client_reference_id possible aussi).
        case 'checkout.session.completed': {
          const session = event.data.object
          const uid =
            session.metadata?.firebaseUid || session.client_reference_id
          if (uid) await setPremium(uid, true)
          break
        }
        // Abonnement annulé/expiré → premium retiré.
        case 'customer.subscription.deleted': {
          const sub = event.data.object
          const uid = sub.metadata?.firebaseUid
          if (uid) await setPremium(uid, false)
          break
        }
        default:
          // Événements non gérés : on accuse simplement réception.
          break
      }
      res.json({ received: true })
    } catch (err) {
      console.error('Erreur traitement webhook :', err)
      res.status(500).send('Internal error')
    }
  }
)
