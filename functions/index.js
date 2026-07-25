// Cloud Functions — Leggendo (leggendo-dbb84)
//
// - ping             : healthcheck HTTPS (vérifie que le déploiement fonctionne)
// - stripeWebhook    : reçoit les événements Stripe et pose les custom claims
//                      `premium`/`role` sur l'utilisateur (lus par firestore.rules
//                      et par le VPS), via PRICE_ROLE_MAP (Price ID → rôle).
// - adminListUsers   : liste les comptes (réservé à ADMIN_EMAIL).
// - adminSetUserRole : change le rôle d'un compte à la main (réservé à
//                      ADMIN_EMAIL) — en attendant que Stripe soit branché.
// - deleteAccount    : suppression de compte en libre-service (l'utilisateur
//                      supprime son propre compte, réauthentification récente
//                      exigée côté client juste avant l'appel).
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
  // Comparaison normalisée (casse, espaces) : certains fournisseurs (Google…)
  // peuvent renvoyer l'e-mail avec une casse différente de celle saisie.
  const email = (request.auth?.token?.email || '').trim().toLowerCase()
  if (email !== ADMIN_EMAIL) {
    console.warn('Appel admin refusé', {
      email: email || '(aucun e-mail dans le token)',
      uid: request.auth?.uid || null,
    })
    throw new HttpsError('permission-denied', 'Réservé à l’administrateur.')
  }
}

const ROLES = ['gratuit', 'premium', 'premium_plus', 'enseignant']

// Correspondance Stripe Price ID → rôle Leggendo. À compléter avec les Price
// ID réels une fois les Payment Links/Checkout créés dans le dashboard
// Stripe (voir README_TARIFICATION.md pour les formules). Tant qu'un prix
// n'est pas dans cette table, le webhook retombe sur `premium: true` sans
// préciser de rôle (comportement historique, non-régressif).
const PRICE_ROLE_MAP = {
  // 'price_xxx': 'premium',
  // 'price_yyy': 'premium_plus',
  // 'price_zzz': 'enseignant',
}

// Healthcheck simple : confirme que les Functions sont en ligne.
export const ping = onRequest((req, res) => {
  res.json({ ok: true, service: 'leggendo-functions' })
})

// Pose (ou retire) le rôle et le claim `premium` associé sur un utilisateur.
// `role` est optionnel : si absent, seul `premium` est mis à jour (cas d'un
// Price ID non encore répertorié dans PRICE_ROLE_MAP).
async function applyRole(uid, premium, role) {
  const auth = getAuth()
  const user = await auth.getUser(uid)
  await auth.setCustomUserClaims(uid, {
    ...(user.customClaims || {}),
    premium,
    ...(role ? { role } : {}),
  })
}

// Retrouve le rôle associé à une session Checkout via son (ses) Price ID —
// nécessite un appel séparé à l'API Stripe car `checkout.session.completed`
// ne contient pas les line items par défaut.
async function roleForSession(stripe, session) {
  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 })
    const priceId = lineItems.data[0]?.price?.id
    const role = priceId ? PRICE_ROLE_MAP[priceId] : undefined
    if (priceId && !role) {
      console.warn('Price ID Stripe non répertorié dans PRICE_ROLE_MAP :', priceId)
    }
    return role
  } catch (err) {
    console.error('Impossible de lire les line items de la session Stripe :', err)
    return undefined
  }
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
            const role = await roleForSession(stripe, session)
            await applyRole(uid, true, role)
            // Recopie l'uid (et le rôle, pour la résiliation) sur
            // l'abonnement : customer.subscription.deleted ne reçoit que les
            // métadonnées de l'abonnement, pas celles de la session — sans
            // cela la résiliation ne retirerait jamais les droits.
            if (session.subscription) {
              await stripe.subscriptions.update(session.subscription, {
                metadata: { firebaseUid: uid, ...(role ? { role } : {}) },
              })
            }
          }
          break
        }
        // Abonnement annulé/expiré → droits retirés (retour au rôle gratuit).
        case 'customer.subscription.deleted': {
          const sub = event.data.object
          const uid = sub.metadata?.firebaseUid
          if (uid) await applyRole(uid, false, 'gratuit')
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
    throw new HttpsError('invalid-argument', 'uid et role (gratuit/premium/premium_plus/enseignant) requis.')
  }

  const auth = getAuth()
  const user = await auth.getUser(uid)
  await auth.setCustomUserClaims(uid, {
    ...(user.customClaims || {}),
    role,
    premium: role === 'premium' || role === 'premium_plus' || role === 'enseignant',
  })

  return { ok: true }
})

// Réauthentification exigée juste avant l'appel (voir src/lib/account.js) :
// `auth_time` doit être récent, sinon un jeton dérobé mais encore valide
// suffirait à supprimer le compte sans reconfirmation.
const REAUTH_MAX_AGE_S = 5 * 60

// Suppression de son propre compte (RGPD / demande explicite). Supprime les
// textes créés, le document de profil, puis le compte Firebase Auth
// lui-même. L'abonnement Stripe éventuel n'est pas résilié automatiquement
// (aucun identifiant client/abonnement n'est encore persisté côté serveur,
// voir Sprint 2 de correctauditgpt.md) — le client doit prévenir l'utilisateur.
export const deleteAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Connexion requise.')
  }
  const authTimeS = request.auth.token.auth_time || 0
  if (Date.now() / 1000 - authTimeS > REAUTH_MAX_AGE_S) {
    throw new HttpsError(
      'failed-precondition',
      'Reconnexion récente requise avant de supprimer le compte.'
    )
  }

  const uid = request.auth.uid
  const db = getFirestore()
  const auth = getAuth()

  const textsSnap = await db.collection('userTexts').where('owner', '==', uid).get()
  const refs = [...textsSnap.docs.map((d) => d.ref), db.collection('users').doc(uid)]
  // Firestore limite un batch à 500 écritures : peu probable ici, mais on
  // découpe par sécurité plutôt que de supposer un nombre de textes borné.
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch()
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }

  await auth.deleteUser(uid)

  return { ok: true }
})
