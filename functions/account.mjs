// Effacement des données Firestore d'un compte (Cloud Function deleteAccount,
// functions/index.js). Séparé de index.js pour être testé sans émulateur
// (voir account.test.mjs).
//
// Tout ce qui est rattaché au compte est supprimé :
//   - users/{uid}                   profil, progression, favoris, jetons push
//   - userTexts (owner == uid)      textes créés
//   - leggendoJobs (uid)            tâches de génération
//   - leggendoQuotas/{uid}          crédits IA
//   - leggendoCorrections (uid)     écrits soumis à la correction (Scrivi)
//   - dialogueSessions (uid)        dialogues simulés (Dialogo)
//   - trialGrants/{uid}             octroi de l'essai
//   - trialEmails/{sha256(e-mail)}  verrou d'essai par e-mail
//   - purchaseTokens (uid)          liaisons d'achat (voir purchases.mjs)
// Seuls les generationLogs sont conservés, anonymisés (uid et e-mail retirés) :
// ce sont des métriques de coût sans contenu saisi par l'utilisateur.

import { emailKey, TRIAL_EMAILS, TRIAL_GRANTS } from './trial.mjs'
import { deletePurchaseTokensFor } from './purchases.mjs'

// Firestore limite un batch à 500 écritures : on découpe par 400.
const BATCH_SIZE = 400

export async function deleteUserData(db, { uid, email }) {
  const byUid = (name, field = 'uid') => db.collection(name).where(field, '==', uid).get()
  const [texts, jobs, corrections, dialogues, logs] = await Promise.all([
    byUid('userTexts', 'owner'),
    byUid('leggendoJobs'),
    byUid('leggendoCorrections'),
    byUid('dialogueSessions'),
    byUid('generationLogs'),
  ])

  const writes = [
    ...[texts, jobs, corrections, dialogues].flatMap((snap) =>
      snap.docs.map((d) => ({ ref: d.ref, op: 'delete' }))
    ),
    { ref: db.collection('users').doc(uid), op: 'delete' },
    { ref: db.collection('leggendoQuotas').doc(uid), op: 'delete' },
    { ref: db.collection(TRIAL_GRANTS).doc(uid), op: 'delete' },
    ...(email ? [{ ref: db.collection(TRIAL_EMAILS).doc(emailKey(email)), op: 'delete' }] : []),
    ...logs.docs.map((d) => ({ ref: d.ref, op: 'anonymize' })),
  ]
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = db.batch()
    writes.slice(i, i + BATCH_SIZE).forEach(({ ref, op }) => {
      if (op === 'delete') batch.delete(ref)
      else batch.update(ref, { uid: null, email: null, anonymizedAt: Date.now() })
    })
    await batch.commit()
  }

  await deletePurchaseTokensFor(db, uid)
}
