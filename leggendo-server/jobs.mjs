// Jobs de génération persistés dans Firestore (survivent à un redémarrage du
// VPS). Prend `db` en paramètre plutôt qu'un import global : permet de
// brancher un faux Firestore dans les tests (voir test/jobs.test.mjs).

import { QuotaExceededError, freshQuota, resetIfStale, quotaError, quotaStatus, creditCost } from './quota.mjs'

export const JOB_TTL_MS = 60 * 60 * 1000
// Filet de sécurité : un job actif depuis trop longtemps est considéré comme
// mort (en plus du timeout des appels GLM) — sinon il verrouillerait le
// compte définitivement, la génération étant limitée à un job à la fois par
// compte.
export const JOB_STUCK_MS = 45 * 60 * 1000

export function createJobStore(db) {
  const jobsCollection = db.collection('leggendoJobs')
  const quotasCollection = db.collection('leggendoQuotas')

  // Vérifie et consomme le crédit (barème par taille, voir quota.mjs), et
  // crée le job, en une seule transaction Firestore : soit tout réussit,
  // soit rien n'est modifié.
  async function reserveJob(user, jobRef, title, sizeId) {
    const quotaRef = quotasCollection.doc(user.uid)
    return db.runTransaction(async (tx) => {
      const quotaDoc = await tx.get(quotaRef)
      const q = resetIfStale(quotaDoc.exists ? quotaDoc.data() : freshQuota())
      const error = quotaError(user, q, sizeId)
      if (error) throw new QuotaExceededError(error)

      if (user.role === 'premium_plus' || user.role === 'enseignant') {
        q.monthlyUsed += creditCost(sizeId)
      } else {
        q.trialUsed = true
      }
      tx.set(quotaRef, q)
      tx.set(jobRef, { uid: user.uid, status: 'pending', createdAt: Date.now(), title })
      return q
    })
  }

  // Rembourse le crédit consommé par `reserveJob` quand la génération
  // échoue pour une raison technique (README_TARIFICATION.md : « une
  // génération qui échoue [...] ne consomme pas de crédit »). Une nouvelle
  // tentative automatique interne (retry GLM) ne compte pas comme une
  // génération séparée — elle fait partie du même job, donc du même coût.
  async function refundCredit(user, sizeId) {
    const quotaRef = quotasCollection.doc(user.uid)
    await db.runTransaction(async (tx) => {
      const quotaDoc = await tx.get(quotaRef)
      if (!quotaDoc.exists) return
      const q = quotaDoc.data()
      if (user.role === 'premium_plus' || user.role === 'enseignant') {
        q.monthlyUsed = Math.max(0, (q.monthlyUsed || 0) - creditCost(sizeId))
      } else {
        q.trialUsed = false
      }
      tx.set(quotaRef, q)
    })
  }

  // Solde à afficher côté client (GET /leggendo/quota) sans consommer ni
  // écrire — la période en cours n'est réinitialisée en base qu'à la
  // prochaine vraie réservation.
  async function getQuotaStatus(user) {
    const quotaDoc = await quotasCollection.doc(user.uid).get()
    const q = resetIfStale(quotaDoc.exists ? quotaDoc.data() : freshQuota())
    return quotaStatus(user, q)
  }

  async function pruneJobs() {
    const cutoff = Date.now() - JOB_TTL_MS
    const stale = await jobsCollection.where('createdAt', '<', cutoff).get()
    if (stale.empty) return
    const batch = db.batch()
    stale.docs.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()
  }

  async function isActive(id, job) {
    if (job.status !== 'pending' && job.status !== 'running') return false
    if (Date.now() - job.createdAt > JOB_STUCK_MS) {
      const error = 'Génération interrompue (délai maximal dépassé).'
      await jobsCollection.doc(id).update({ status: 'error', error })
      return false
    }
    return true
  }

  // Nécessite un index composite Firestore (uid ASC, status ASC, createdAt
  // DESC) — Firestore fournit le lien de création au premier appel si absent.
  async function activeJobFor(uid) {
    const snap = await jobsCollection
      .where('uid', '==', uid)
      .where('status', 'in', ['pending', 'running'])
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()
    if (snap.empty) return null
    const doc = snap.docs[0]
    const job = doc.data()
    return (await isActive(doc.id, job)) ? { id: doc.id, job } : null
  }

  // Ne renvoie le job que s'il appartient à l'utilisateur — sinon comme s'il
  // n'existait pas (pas de fuite d'information sur les jobs d'un autre uid).
  async function jobFor(uid, jobId) {
    const jobDoc = await jobsCollection.doc(jobId).get()
    const job = jobDoc.exists ? jobDoc.data() : null
    return job && job.uid === uid ? job : null
  }

  return { jobsCollection, reserveJob, refundCredit, getQuotaStatus, pruneJobs, activeJobFor, jobFor }
}
