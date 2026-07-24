// Cloud Functions — Leggendo (leggendo-dbb84)
//
// - ping             : healthcheck HTTPS (vérifie que le déploiement fonctionne)
// - stripeWebhook    : reçoit les événements Stripe et pose le custom claim
//                      `premium` sur l'utilisateur (lu par firestore.rules).
// - adminListUsers   : liste les comptes (réservé à ADMIN_EMAIL).
// - adminSetUserRole : change le rôle d'un compte à la main (réservé à
//                      ADMIN_EMAIL) — en attendant que Stripe soit branché.
//
// Secrets (à définir AVANT le premier déploiement qui les utilise) :
//   firebase functions:secrets:set STRIPE_SECRET_KEY
//   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
//
// L'URL du webhook (à coller dans le dashboard Stripe) est affichée à la fin
// du déploiement, du type :
//   https://<region>-leggendo-dbb84.cloudfunctions.net/stripeWebhook

import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { setGlobalOptions } from 'firebase-functions/v2'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp()
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 })

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY')
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET')

// Seul ce compte peut appeler les fonctions d'administration ci-dessous.
// L'e-mail vient du token Firebase Auth vérifié par onCall : il ne peut pas
// être falsifié par le client.
const ADMIN_EMAIL = 'lberthod@gmail.com'

function requireAdmin(request) {
  if (request.auth?.token?.email !== ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'Réservé à l’administrateur.')
  }
}

const ROLES = ['gratuit', 'premium', 'enseignant']

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
          if (uid) {
            await setPremium(uid, true)
            // Recopie l'uid sur l'abonnement : customer.subscription.deleted
            // ne reçoit que les métadonnées de l'abonnement, pas celles de la
            // session — sans cela la résiliation ne retirerait jamais le premium.
            if (session.subscription) {
              await stripe.subscriptions.update(session.subscription, {
                metadata: { firebaseUid: uid },
              })
            }
          }
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

// Liste les comptes (Auth + métadonnées Firestore) pour le tableau de bord
// admin. Jusqu'à 1000 comptes par page ; suffisant pour l'usage actuel.
export const adminListUsers = onCall(async (request) => {
  requireAdmin(request)

  const auth = getAuth()
  const db = getFirestore()

  const [authList, textsSnap] = await Promise.all([
    auth.listUsers(1000),
    db.collection('users').get(),
  ])

  const textsById = new Map(textsSnap.docs.map((d) => [d.id, d.data()]))

  return {
    users: authList.users.map((u) => {
      const textsDoc = textsById.get(u.uid)
      return {
        uid: u.uid,
        email: u.email || '',
        displayName: u.displayName || '',
        createdAt: u.metadata.creationTime,
        lastSignInAt: u.metadata.lastSignInTime,
        disabled: u.disabled,
        role: u.customClaims?.role || 'gratuit',
        textsCreated: (textsDoc?.createdTexts || []).length,
      }
    }),
  }
})

// Change le rôle d'un compte à la main (invité/gratuit, payant, enseignant).
// Pose le custom claim `role` (lu par le client et par ces fonctions) et
// garde le claim `premium` existant en phase, pour ne pas casser
// firestore.rules qui s'appuie dessus pour le contenu payant.
export const adminSetUserRole = onCall(async (request) => {
  requireAdmin(request)

  const { uid, role } = request.data || {}
  if (!uid || !ROLES.includes(role)) {
    throw new HttpsError('invalid-argument', 'uid et role (gratuit/premium/enseignant) requis.')
  }

  const auth = getAuth()
  const user = await auth.getUser(uid)
  await auth.setCustomUserClaims(uid, {
    ...(user.customClaims || {}),
    role,
    premium: role === 'premium' || role === 'enseignant',
  })

  return { ok: true }
})
