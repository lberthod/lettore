// Cloud Functions — Leggendo (leggendo-dbb84)
//
// - ping             : healthcheck HTTPS (vérifie que le déploiement fonctionne)
// - stripeWebhook    : reçoit les événements Stripe et pose les custom claims
//                      `premium`/`role`/`periodEnd` sur l'utilisateur (lus par
//                      firestore.rules et par le VPS), via PRICE_ROLE_MAP
//                      (Price ID → rôle). `periodEnd` (fin de la période de
//                      facturation en cours) ancre le renouvellement des
//                      crédits de génération sur la vraie date de
//                      renouvellement Stripe (voir leggendo-server/quota.mjs).
// - adminListUsers      : liste les comptes (réservé à ADMIN_EMAIL).
// - adminSetUserRole    : change le rôle d'un compte à la main (réservé à
//                         ADMIN_EMAIL) — en attendant que Stripe soit branché.
// - deleteAccount       : suppression de compte en libre-service (l'utilisateur
//                         supprime son propre compte, réauthentification récente
//                         exigée côté client juste avant l'appel).
// - verifyPlayPurchase  : vérifie un achat Google Play Billing (voir
//                         src/lib/billing.js, apkdoc.md § Google Play Billing).
// - validateAppleReceipt : vérifie un reçu StoreKit iOS (voir src/lib/iap.js,
//                         apk doc.md § Paiement in-app).
//
// Secrets (à définir AVANT le premier déploiement qui les utilise) :
//   firebase functions:secrets:set STRIPE_SECRET_KEY
//   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
//   firebase functions:secrets:set GOOGLE_PLAY_SERVICE_ACCOUNT
//   firebase functions:secrets:set APPLE_SHARED_SECRET
//
// L'URL du webhook (à coller dans le dashboard Stripe) est affichée à la fin
// du déploiement, du type :
//   https://<region>-leggendo-dbb84.cloudfunctions.net/stripeWebhook

import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { setGlobalOptions } from 'firebase-functions/v2'
import functionsV1 from 'firebase-functions/v1'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import {
  ROLES,
  requireAdmin,
  roleForPriceId,
  roleForProductId,
  roleForAppleProductId,
} from './roles.mjs'

initializeApp()
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 })

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY')
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET')
// « Shared Secret » App-Specific généré dans App Store Connect
// (Utilisateurs et accès → Clés → Secret partagé App-Specific), nécessaire
// pour valider les reçus d'abonnement auto-renouvelable.
const APPLE_SHARED_SECRET = defineSecret('APPLE_SHARED_SECRET')

// Clé JSON du compte de service Google Play (voir apkdoc.md, § Google Play
// Billing) : Play Console > Configuration de l'API > créer un compte de
// service avec le rôle "Voir les infos financières, gérer les commandes...",
// exporter sa clé JSON, puis :
//   firebase functions:secrets:set GOOGLE_PLAY_SERVICE_ACCOUNT
// (coller le contenu du fichier JSON tel quel).
const GOOGLE_PLAY_SERVICE_ACCOUNT = defineSecret('GOOGLE_PLAY_SERVICE_ACCOUNT')

// Doit correspondre à l'appId de capacitor.config.json / android/app/build.gradle.
const ANDROID_PACKAGE_NAME = 'ch.loicberthod.leggendo'

// Healthcheck simple : confirme que les Functions sont en ligne.
export const ping = onRequest((req, res) => {
  res.json({ ok: true, service: 'leggendo-functions' })
})

// --- Surveillance des créations de comptes ---
// Chaque compte gratuit reçoit une génération d'essai : une rafale
// d'inscriptions est donc le premier signe visible d'une tentative de
// pillage du fournisseur IA (voir leggendo-server/TODO_SECURITE.md).
// Cette fonction ne bloque rien — bloquer une inscription demanderait une
// fonction `beforeUserCreated`, qui exige Identity Platform. Elle compte les
// créations par heure dans `signupStats` et journalise une alerte au-delà du
// seuil ; le compteur est aussi consultable pour un tableau de bord.
// Déclencheur Auth v1 : les triggers v2 sur `user.create` n'existent pas hors
// Identity Platform, d'où le mélange v1/v2 assumé dans ce fichier.
// Constantes volontairement non exportées : tout export de ce fichier est
// analysé par le déployeur Firebase comme une fonction candidate.
const SIGNUPS_ALERT_PER_HOUR = Number(process.env.SIGNUPS_ALERT_PER_HOUR || 30)
const SIGNUP_STATS = 'signupStats'

// Clé horaire UTC (YYYY-MM-DDTHH) — un document par heure, purgeable à la
// main ; volume négligeable (24 documents par jour).
function hourKey(date) {
  return date.toISOString().slice(0, 13)
}

export const onUserCreated = functionsV1
  .region('europe-west1')
  .auth.user()
  .onCreate(async (user) => {
    const db = getFirestore()
    const ref = db.collection(SIGNUP_STATS).doc(hourKey(new Date()))
    try {
      await ref.set(
        { count: FieldValue.increment(1), updatedAt: Date.now() },
        { merge: true }
      )
      const count = (await ref.get()).data()?.count || 0
      if (count >= SIGNUPS_ALERT_PER_HOUR) {
        console.warn(
          `⚠ ALERTE ABUS : ${count} créations de comptes dans l'heure (seuil ${SIGNUPS_ALERT_PER_HOUR}) — dernière : ${user.email || user.uid}`
        )
      }
    } catch (err) {
      // Ne jamais faire échouer une inscription légitime pour un compteur.
      console.error('Comptage des inscriptions impossible :', err)
    }
  })

// Pose (ou retire) le rôle et le claim `premium` associé sur un utilisateur.
// `role` est optionnel : si absent, seul `premium` est mis à jour (cas d'un
// Price ID non encore répertorié dans PRICE_ROLE_MAP). `periodEnd` (secondes
// epoch, `subscription.current_period_end` côté Stripe) sert d'ancre de
// renouvellement des crédits (voir leggendo-server/quota.mjs) — omis, le
// claim existant n'est pas modifié.
async function applyRole(uid, premium, role, periodEnd) {
  const auth = getAuth()
  const user = await auth.getUser(uid)
  await auth.setCustomUserClaims(uid, {
    ...(user.customClaims || {}),
    premium,
    ...(role ? { role } : {}),
    ...(periodEnd !== undefined ? { periodEnd } : {}),
  })
}

// Retrouve le rôle associé à une session Checkout via son (ses) Price ID —
// nécessite un appel séparé à l'API Stripe car `checkout.session.completed`
// ne contient pas les line items par défaut.
async function roleForSession(stripe, session) {
  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 })
    return roleForPriceId(lineItems.data[0]?.price?.id)
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
            let periodEnd
            // Recopie l'uid (et le rôle, pour la résiliation) sur
            // l'abonnement : customer.subscription.deleted ne reçoit que les
            // métadonnées de l'abonnement, pas celles de la session — sans
            // cela la résiliation ne retirerait jamais les droits. La même
            // réponse donne `current_period_end`, utilisé comme ancre de
            // renouvellement des crédits (voir leggendo-server/quota.mjs).
            if (session.subscription) {
              const sub = await stripe.subscriptions.update(session.subscription, {
                metadata: { firebaseUid: uid, ...(role ? { role } : {}) },
              })
              periodEnd = sub.current_period_end
            }
            await applyRole(uid, true, role, periodEnd)
          }
          break
        }
        // Renouvellement, changement de formule, etc. → resynchronise la fin
        // de période, seule donnée qui doit changer à chaque cycle réel de
        // l'abonnement (voir README_TARIFICATION.md, § Règles des crédits).
        case 'customer.subscription.updated': {
          const sub = event.data.object
          const uid = sub.metadata?.firebaseUid
          if (uid) await applyRole(uid, true, sub.metadata?.role, sub.current_period_end)
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

// Vérifie un achat Google Play (souscription) et pose le rôle correspondant
// — équivalent mobile de `stripeWebhook`, mais synchrone : le client appelle
// cette fonction juste après un achat approuvé par Play Billing
// (src/lib/billing.js), avant d'appeler `transaction.finish()`. La
// vérification interroge l'API Android Publisher (source de vérité, un
// jeton d'achat côté client n'est pas fiable en soi) plutôt que de faire
// confiance à ce que l'app envoie.
//
// Le renouvellement/l'annulation automatiques (sans que l'utilisateur rouvre
// l'app) ne sont PAS couverts ici : cela demande les Real-time Developer
// Notifications (Pub/Sub) côté Play Console, non configurées — voir
// apkdoc.md, § Limites connues. En l'état, le rôle est revérifié à chaque
// ouverture de l'app tant que la souscription est active côté client.
export const verifyPlayPurchase = onCall(
  { secrets: [GOOGLE_PLAY_SERVICE_ACCOUNT] },
  async (request) => {
    const uid = request.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.')

    const { productId, purchaseToken } = request.data || {}
    if (!productId || !purchaseToken) {
      throw new HttpsError('invalid-argument', 'productId et purchaseToken requis.')
    }

    const role = roleForProductId(productId)
    if (!role) {
      throw new HttpsError('invalid-argument', 'Produit inconnu : ' + productId)
    }

    const { google } = await import('googleapis')
    let credentials
    try {
      credentials = JSON.parse(GOOGLE_PLAY_SERVICE_ACCOUNT.value())
    } catch (err) {
      console.error('GOOGLE_PLAY_SERVICE_ACCOUNT invalide (pas un JSON) :', err)
      throw new HttpsError('internal', 'Vérification indisponible.')
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    })
    const androidpublisher = google.androidpublisher({ version: 'v3', auth })

    let expiryTimeMillis
    try {
      const { data } = await androidpublisher.purchases.subscriptions.get({
        packageName: ANDROID_PACKAGE_NAME,
        subscriptionId: productId,
        token: purchaseToken,
      })
      // paymentState 1 = paiement reçu ; 2 = essai gratuit ; 0 = en attente.
      if (data.paymentState !== 1 && data.paymentState !== 2) {
        throw new HttpsError('failed-precondition', 'Paiement non confirmé par Google Play.')
      }
      expiryTimeMillis = Number(data.expiryTimeMillis)
    } catch (err) {
      if (err instanceof HttpsError) throw err
      console.error('Vérification Google Play échouée :', err)
      throw new HttpsError('internal', 'Vérification Google Play impossible.')
    }

    const periodEnd = Math.floor(expiryTimeMillis / 1000)
    await applyRole(uid, true, role, periodEnd)

    return { ok: true, role, periodEnd }
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
// textes créés, le document de profil, les quotas/jobs de génération du VPS
// (même projet Firestore que leggendo-server, voir leggendo-server/jobs.mjs),
// puis le compte Firebase Auth lui-même. Les entrées `generationLogs` ne sont
// pas supprimées (mesure des coûts IA, README_TARIFICATION.md) mais sont
// anonymisées : uid et email retirés, seules les métriques agrégées restent.
// L'abonnement Stripe éventuel n'est pas résilié automatiquement (aucun
// identifiant client/abonnement n'est encore persisté côté serveur) — le
// client doit prévenir l'utilisateur.
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

  const [textsSnap, jobsSnap, logsSnap] = await Promise.all([
    db.collection('userTexts').where('owner', '==', uid).get(),
    db.collection('leggendoJobs').where('uid', '==', uid).get(),
    db.collection('generationLogs').where('uid', '==', uid).get(),
  ])

  // Firestore limite un batch à 500 écritures ; peu probable en pratique
  // (textes + jobs + logs d'un seul compte), mais on découpe par sécurité
  // plutôt que de supposer un volume borné.
  const writes = [
    ...textsSnap.docs.map((d) => ({ ref: d.ref, op: 'delete' })),
    ...jobsSnap.docs.map((d) => ({ ref: d.ref, op: 'delete' })),
    { ref: db.collection('users').doc(uid), op: 'delete' },
    { ref: db.collection('leggendoQuotas').doc(uid), op: 'delete' },
    ...logsSnap.docs.map((d) => ({ ref: d.ref, op: 'anonymize' })),
  ]
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch()
    writes.slice(i, i + 400).forEach(({ ref, op }) => {
      if (op === 'delete') batch.delete(ref)
      else batch.update(ref, { uid: null, email: null, anonymizedAt: Date.now() })
    })
    await batch.commit()
  }

  await auth.deleteUser(uid)

  return { ok: true }
})

// Valide un reçu StoreKit (achat ou restauration) auprès des serveurs Apple
// et pose le rôle correspondant, exactement comme `applyRole` le fait pour
// Stripe côté web. Utilise l'API historique `verifyReceipt` (simple, un seul
// secret requis) — à migrer vers l'App Store Server API (JWT + clé privée)
// si Apple retire définitivement ce point d'entrée.
//
// Appelée depuis src/lib/iap.js après un achat ou une restauration.
const APPLE_VERIFY_URL_PROD = 'https://buy.itunes.apple.com/verifyReceipt'
const APPLE_VERIFY_URL_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt'

async function verifyAppleReceipt(receiptData, sharedSecret, url = APPLE_VERIFY_URL_PROD) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'receipt-data': receiptData,
      password: sharedSecret,
      'exclude-old-transactions': true,
    }),
  })
  const body = await res.json()
  // 21007 : reçu sandbox envoyé par erreur à l'URL de prod (fréquent en
  // TestFlight) — on retente contre le bac à sable comme le recommande Apple.
  if (body.status === 21007 && url === APPLE_VERIFY_URL_PROD) {
    return verifyAppleReceipt(receiptData, sharedSecret, APPLE_VERIFY_URL_SANDBOX)
  }
  return body
}

export const validateAppleReceipt = onCall(
  { secrets: [APPLE_SHARED_SECRET] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Connexion requise.')
    }
    const { receiptData } = request.data || {}
    if (!receiptData) {
      throw new HttpsError('invalid-argument', 'Reçu manquant.')
    }

    const body = await verifyAppleReceipt(receiptData, APPLE_SHARED_SECRET.value())
    if (body.status !== 0) {
      console.error('Reçu Apple invalide, status', body.status)
      throw new HttpsError('failed-precondition', 'Reçu invalide.')
    }

    // `latest_receipt_info` liste tout l'historique d'abonnement ; on ne
    // garde que la transaction non expirée la plus récente.
    const entries = body.latest_receipt_info || []
    const now = Date.now()
    const active = entries
      .filter((e) => Number(e.expires_date_ms) > now)
      .sort((a, b) => Number(b.expires_date_ms) - Number(a.expires_date_ms))[0]

    const uid = request.auth.uid
    if (!active) {
      await applyRole(uid, false, 'gratuit')
      return { ok: true, active: false }
    }

    const role = roleForAppleProductId(active.product_id)
    await applyRole(uid, true, role, Math.floor(Number(active.expires_date_ms) / 1000))
    return { ok: true, active: true, role }
  }
)
