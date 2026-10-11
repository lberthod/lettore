// Envoi de notifications push (FCM). Les jetons vivent dans
// users/{uid}.fcmTokens (voir src/lib/push.js et firestore.rules) — un
// appareil peut en avoir plusieurs (réinstallation, plusieurs appareils).
// Élague les jetons invalides directement sur l'erreur FCM (désinstallation,
// désenregistrement) plutôt que d'attendre un nettoyage périodique séparé.
//
// ATTENTION : ce fichier existe en DEUX copies strictement identiques,
// functions/push.mjs (Cloud Functions) et leggendo-server/push.mjs (VPS) —
// deux déploiements distincts, pas de code partagé. Toute modification doit
// être répercutée à l'identique (leggendo-server/test/push.test.mjs vérifie
// que `diff` est vide). `db` est injecté (instance Admin Firestore déjà
// initialisée par l'appelant) ; `messaging` l'est aussi pour les tests.

import { getMessaging } from 'firebase-admin/messaging'
import { FieldValue } from 'firebase-admin/firestore'

// Seuls ces codes prouvent que le jeton est définitivement mort. Surtout PAS
// `messaging/invalid-argument` : il signale aussi un message mal formé (titre
// trop long, donnée invalide…) et purgerait alors les jetons de tout le monde.
export const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
])

// Limite de l'API FCM : 500 jetons par appel multicast.
export const FCM_BATCH_SIZE = 500

export function isStaleTokenError(code) {
  return INVALID_TOKEN_CODES.has(code)
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

// Envoie la même notification à un ou plusieurs comptes (par uid), en lisant
// leurs jetons dans Firestore. `data` doit être un objet de chaînes (contrat
// FCM) — sert à router l'ouverture côté client (src/lib/push.js). Renvoie
// `{ sent, failed }` (nombre de jetons acceptés / refusés par FCM) ; un lot
// qui lève une exception compte ses jetons en échec sans interrompre les
// suivants.
export async function sendPushToUsers(db, uids, { title, body, data } = {}, { messaging } = {}) {
  const ids = [...new Set(uids)].filter(Boolean)
  if (!ids.length) return { sent: 0, failed: 0 }

  const snaps = await db.getAll(...ids.map((uid) => db.collection('users').doc(uid)))
  const tokenToUid = new Map()
  for (const snap of snaps) {
    const tokens = snap.exists ? snap.data().fcmTokens || [] : []
    for (const t of tokens) tokenToUid.set(t, snap.id)
  }
  const tokens = [...tokenToUid.keys()]
  if (!tokens.length) return { sent: 0, failed: 0 }

  const fcm = messaging || getMessaging()
  const payload = {
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
  }

  let sent = 0
  let failed = 0
  const staleByUid = new Map()
  for (const batch of chunk(tokens, FCM_BATCH_SIZE)) {
    let res
    try {
      res = await fcm.sendEachForMulticast({ tokens: batch, ...payload })
    } catch (err) {
      console.error('Envoi FCM impossible pour un lot :', err)
      failed += batch.length
      continue
    }
    res.responses.forEach((r, i) => {
      if (r.success) {
        sent += 1
        return
      }
      failed += 1
      if (!isStaleTokenError(r.error?.code)) return
      const uid = tokenToUid.get(batch[i])
      if (!staleByUid.has(uid)) staleByUid.set(uid, [])
      staleByUid.get(uid).push(batch[i])
    })
  }

  await Promise.all(
    [...staleByUid.entries()].map(([uid, stale]) =>
      db
        .collection('users')
        .doc(uid)
        .update({ fcmTokens: FieldValue.arrayRemove(...stale) })
        .catch((err) => console.error(`Élagage jetons FCM impossible pour ${uid} :`, err))
    )
  )
  return { sent, failed }
}

export function sendPushToUser(db, uid, notif, opts) {
  return sendPushToUsers(db, [uid], notif, opts)
}
