// Achats in-app (SEC-2) : anti-rejeu, contrôles Apple, appel Apple borné.
// Logique injectable (db, fetch) pour des tests sans réseau.

import { createHash } from 'node:crypto'
import { HttpsError } from 'firebase-functions/v2/https'

export const PURCHASE_TOKENS = 'purchaseTokens'
// Bundle ID iOS (ios/App/App.xcodeproj : PRODUCT_BUNDLE_IDENTIFIER).
export const APPLE_BUNDLE_ID = 'com.leggendo.app'
export const APPLE_TIMEOUT_MS = 10_000

export function purchaseKey(platform, id) {
  return createHash('sha256').update(`${platform}|${id}`).digest('hex')
}

// Lie un jeton d'achat (Play) ou une transaction d'origine (Apple) à un uid.
// Un même achat ne peut débloquer qu'un compte : la restauration par le même
// uid reste acceptée, un second uid est refusé (permission-denied).
export async function claimPurchase(db, platform, id, uid, now = Date.now()) {
  if (!id) throw new HttpsError('invalid-argument', 'Identifiant d’achat manquant.')
  const ref = db.collection(PURCHASE_TOKENS).doc(purchaseKey(platform, id))
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists) {
      if (snap.data().uid !== uid) {
        throw new HttpsError('permission-denied', 'Cet achat est déjà associé à un autre compte.')
      }
      return
    }
    tx.set(ref, { uid, platform, createdAt: now })
  })
}

// Google Play : `obfuscatedExternalAccountId` (lu dans la réponse de l'API
// Play, pas fourni par le client) doit correspondre à l'uid. Formes acceptées :
// uid en clair, SHA-256 hex, et MD5 hex — ce dernier est ce que
// cordova-plugin-purchase (obfuscator 'legacy', défaut) pose sur Google Play à
// partir de store.applicationUsername (store.js obfuscateUsername). Absent
// (achat d'un ancien client sans applicationUsername) : accepté, on s'appuie
// sur la liaison jeton <-> uid de claimPurchase, qui interdit de rejouer le
// jeton depuis un autre compte.
export function checkPlayAccount(data, uid) {
  const id = data?.obfuscatedExternalAccountId
  if (!id) return
  const accepted = [
    uid,
    createHash('sha256').update(uid).digest('hex'),
    createHash('md5').update(uid).digest('hex'),
  ]
  if (!accepted.includes(id)) {
    throw new HttpsError('permission-denied', 'Cet achat appartient à un autre compte.')
  }
}

// Supprime les liaisons d'achat d'un uid (suppression de compte), afin qu'un
// abonné qui recrée son compte puisse restaurer son achat. Les verrous d'essai
// (trialGrants/trialEmails) ne sont volontairement pas touchés.
export async function deletePurchaseTokensFor(db, uid) {
  const snap = await db.collection(PURCHASE_TOKENS).where('uid', '==', uid).get()
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch()
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
  return snap.docs.length
}

// Apple `verifyReceipt` avec délai maximal et contrôle HTTP.
export async function verifyAppleReceipt(
  receiptData,
  sharedSecret,
  { url, sandboxUrl, fetchImpl = fetch, timeoutMs = APPLE_TIMEOUT_MS } = {}
) {
  const prod = url
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res
  try {
    res = await fetchImpl(prod, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'receipt-data': receiptData,
        password: sharedSecret,
        'exclude-old-transactions': true,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      throw new HttpsError('unavailable', 'Serveur Apple indisponible, réessayez plus tard.')
    }
    const body = await res.json()
    // 21007 : reçu sandbox envoyé à la prod (TestFlight) — on retente en sandbox.
    if (body.status === 21007 && sandboxUrl && prod !== sandboxUrl) {
      clearTimeout(timer)
      return verifyAppleReceipt(receiptData, sharedSecret, {
        url: sandboxUrl,
        sandboxUrl,
        fetchImpl,
        timeoutMs,
      })
    }
    return body
  } catch (err) {
    if (err instanceof HttpsError) throw err
    const timedOut = err?.name === 'AbortError'
    throw new HttpsError(
      timedOut ? 'deadline-exceeded' : 'unavailable',
      timedOut ? 'Apple n’a pas répondu à temps, réessayez.' : 'Serveur Apple injoignable.'
    )
  } finally {
    clearTimeout(timer)
  }
}

// Contrôle le bundle du reçu et retient la transaction active la plus récente.
export function pickActiveAppleTransaction(body, now = Date.now()) {
  const bundle = body?.receipt?.bundle_id
  if (bundle !== APPLE_BUNDLE_ID) {
    throw new HttpsError('permission-denied', 'Reçu émis pour une autre application.')
  }
  const entries = body.latest_receipt_info || []
  return (
    entries
      .filter((e) => Number(e.expires_date_ms) > now)
      .sort((a, b) => Number(b.expires_date_ms) - Number(a.expires_date_ms))[0] || null
  )
}
