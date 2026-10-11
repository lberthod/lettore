// Essai Premium IA de 10 jours (SEC-1) — logique pure/injectable, testée
// dans trial.test.mjs. L'essai n'est plus accordé à la création du compte
// (onUserCreated) : il faut un e-mail vérifié, sinon une boucle
// inscription → essai coûterait une génération IA par compte jetable.
//
// Contrat client : appeler le callable `startTrial` (sans argument) après la
// vérification de l'e-mail, puis rafraîchir le jeton (`getIdToken(true)`).
// Réponse : `{ ok: true, trialEnd }` (secondes epoch). Erreurs HttpsError :
//   failed-precondition : e-mail non vérifié, ou compte déjà payant ;
//   already-exists      : essai déjà consommé (par ce compte ou cet e-mail).

import { createHash } from 'node:crypto'
import { HttpsError } from 'firebase-functions/v2/https'
import { TRIAL_DAYS } from './roles.mjs'

export const TRIAL_GRANTS = 'trialGrants' // par uid
export const TRIAL_EMAILS = 'trialEmails' // par e-mail normalisé (hash)

// Normalise pour empêcher le contournement par alias : casse, +tag, et points
// des adresses Gmail (a.b@gmail.com == ab@gmail.com).
export function normalizeEmail(email) {
  const [rawLocal, rawDomain] = String(email || '').trim().toLowerCase().split('@')
  if (!rawLocal || !rawDomain) return ''
  let domain = rawDomain === 'googlemail.com' ? 'gmail.com' : rawDomain
  let local = rawLocal.split('+')[0]
  if (domain === 'gmail.com') local = local.replace(/\./g, '')
  return `${local}@${domain}`
}

export function emailKey(email) {
  return createHash('sha256').update(normalizeEmail(email)).digest('hex')
}

export async function startTrialFor({ db, auth, uid, token, now = Date.now() }) {
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.')
  if (token?.email_verified !== true || !normalizeEmail(token.email)) {
    throw new HttpsError(
      'failed-precondition',
      'Vérifiez votre adresse e-mail pour démarrer votre essai.'
    )
  }

  const user = await auth.getUser(uid)
  const claims = user.customClaims || {}
  const nowS = Math.floor(now / 1000)
  if (claims.periodEnd !== undefined || (claims.role && claims.role !== 'gratuit')) {
    // Abonné payant, ou essai déjà en cours (ancien octroi à l'inscription).
    if (claims.role === 'premium_plus' && claims.trialEnd > nowS && claims.periodEnd === undefined) {
      return { ok: true, trialEnd: claims.trialEnd }
    }
    throw new HttpsError('failed-precondition', 'Ce compte dispose déjà d’une formule.')
  }

  // Comptes en essai avant le déploiement : pas de trialGrants/trialEmails,
  // mais la clé trialEnd existe dans les claims (null après revertExpiredTrials).
  if ('trialEnd' in claims) {
    throw new HttpsError('already-exists', 'Votre essai a déjà été utilisé.')
  }

  const grantRef = db.collection(TRIAL_GRANTS).doc(uid)
  const emailRef = db.collection(TRIAL_EMAILS).doc(emailKey(token.email))
  const trialEnd = nowS + TRIAL_DAYS * 24 * 60 * 60

  const result = await db.runTransaction(async (tx) => {
    const [grant, emailDoc] = await Promise.all([tx.get(grantRef), tx.get(emailRef)])
    if (grant.exists) return { again: true, trialEnd: grant.data().trialEnd }
    if (emailDoc.exists) return { taken: true }
    tx.set(grantRef, { trialEnd, email: normalizeEmail(token.email), createdAt: now })
    tx.set(emailRef, { uid, trialEnd, createdAt: now })
    return { trialEnd }
  })

  if (result.taken) {
    throw new HttpsError('already-exists', 'L’essai a déjà été utilisé avec cette adresse e-mail.')
  }
  if (result.again && !(result.trialEnd > nowS)) {
    throw new HttpsError('already-exists', 'Votre essai a déjà été utilisé.')
  }

  // (Ré)applique les claims : sur un nouvel octroi, ou pour réparer un octroi
  // dont l'écriture des claims avait échoué (appel répété par le client).
  await auth.setCustomUserClaims(uid, {
    ...claims,
    role: 'premium_plus',
    premium: true,
    trialEnd: result.trialEnd,
  })
  return { ok: true, trialEnd: result.trialEnd }
}
