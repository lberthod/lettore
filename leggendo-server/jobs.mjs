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

const STUCK_JOB_ERROR = 'Génération interrompue (délai maximal dépassé).'

// Levée par reserveJob quand un job actif (non bloqué) existe déjà pour ce
// compte — distincte de QuotaExceededError pour que server.mjs renvoie le
// bon message/status (429 « patientez » plutôt que « quota dépassé »).
export class ActiveJobError extends Error {}

export function createJobStore(db) {
  const jobsCollection = db.collection('leggendoJobs')
  const quotasCollection = db.collection('leggendoQuotas')

  function activeJobQuery(uid) {
    return jobsCollection
      .where('uid', '==', uid)
      .where('status', 'in', ['pending', 'running'])
      .orderBy('createdAt', 'desc')
      .limit(1)
  }

  // Recrédite dans `q` (objet quota déjà lu, pas encore réécrit) le coût
  // d'un job qu'on s'apprête à clôturer — utilisé aussi bien par
  // reserveJob (job bloqué détecté au passage) que par failJob.
  function refundInto(q, role, sizeId) {
    if (role === 'premium_plus' || role === 'enseignant') {
      q.monthlyUsed = Math.max(0, (q.monthlyUsed || 0) - creditCost(sizeId))
    } else {
      q.trialUsed = false
    }
  }

  // Vérifie qu'aucun job n'est déjà actif, consomme le crédit (barème par
  // taille, voir quota.mjs) et crée le job, en une seule transaction
  // Firestore : soit tout réussit, soit rien n'est modifié. Un job actif
  // bloqué depuis plus de JOB_STUCK_MS appartenant au même compte est
  // clôturé et remboursé dans cette même transaction (même document
  // quotasCollection/{uid}) ; un job encore valide fait échouer la
  // réservation (ActiveJobError) au lieu de laisser deux requêtes
  // concurrentes passer le contrôle.
  async function reserveJob(user, jobRef, title, sizeId) {
    const quotaRef = quotasCollection.doc(user.uid)
    const query = activeJobQuery(user.uid)
    return db.runTransaction(async (tx) => {
      const [quotaDoc, activeSnap] = await Promise.all([tx.get(quotaRef), tx.get(query)])
      const q = resetIfStale(user, quotaDoc.exists ? quotaDoc.data() : freshQuota(user))

      if (!activeSnap.empty) {
        const activeDoc = activeSnap.docs[0]
        const activeJob = activeDoc.data()
        if (Date.now() - activeJob.createdAt <= JOB_STUCK_MS) {
          throw new ActiveJobError('Une génération est déjà en cours pour votre compte, patientez.')
        }
        tx.update(activeDoc.ref, { status: 'error', error: STUCK_JOB_ERROR, creditRefundedAt: Date.now() })
        if (!activeJob.creditRefundedAt && activeJob.sizeId) {
          refundInto(q, activeJob.role, activeJob.sizeId)
        }
      }

      const error = quotaError(user, q, sizeId)
      if (error) throw new QuotaExceededError(error)

      if (user.role === 'premium_plus' || user.role === 'enseignant') {
        q.monthlyUsed += creditCost(sizeId)
      } else {
        q.trialUsed = true
      }
      tx.set(quotaRef, q)
      tx.set(jobRef, {
        uid: user.uid,
        status: 'pending',
        createdAt: Date.now(),
        title,
        sizeId,
        role: user.role,
      })
      return q
    })
  }

  // Clôture un job en erreur et rembourse son crédit dans la même
  // transaction (README_TARIFICATION.md : « une génération qui échoue [...]
  // ne consomme pas de crédit »). Une nouvelle tentative automatique interne
  // (retry GLM) ne compte pas comme une génération séparée — elle fait partie
  // du même job, donc du même coût.
  //
  // Deux garde-fous, tous deux nécessaires :
  //  - la clôture n'a lieu que si le job est encore actif, sinon une
  //    génération très longue viendrait écraser un job déjà clôturé ;
  //  - le remboursement est borné par `creditRefundedAt`, posé dans la même
  //    transaction, donc jamais rejoué (y compris si reserveJob a clôturé ce
  //    job entre-temps).
  // Renvoie true si c'est bien cet appel qui a clôturé le job.
  async function failJob(jobId, message) {
    const jobRef = jobsCollection.doc(jobId)
    return db.runTransaction(async (tx) => {
      const jobDoc = await tx.get(jobRef)
      if (!jobDoc.exists) return false
      const job = jobDoc.data()
      if (job.status !== 'pending' && job.status !== 'running') return false
      // Toutes les lectures avant la moindre écriture : Firestore refuse un
      // tx.get() qui suit un tx.update() dans la même transaction.
      const refundable = Boolean(!job.creditRefundedAt && job.sizeId && job.uid)
      const quotaRef = refundable ? quotasCollection.doc(job.uid) : null
      const quotaDoc = refundable ? await tx.get(quotaRef) : null
      tx.update(jobRef, { status: 'error', error: message, creditRefundedAt: Date.now() })
      if (quotaDoc && quotaDoc.exists) {
        const q = quotaDoc.data()
        // Le rôle enregistré à la réservation, pas celui du token courant :
        // c'est lui qui a déterminé le débit, donc lui qui détermine le
        // remboursement (un changement d'abonnement entre-temps ne doit pas
        // recréditer la mauvaise ligne).
        refundInto(q, job.role, job.sizeId)
        tx.set(quotaRef, q)
      }
      return true
    })
  }

  // Symétrique de failJob pour le succès : n'écrit le résultat que si le job
  // est encore actif. Un job déjà clôturé a vu son crédit remboursé — le
  // repasser en `done` livrerait la génération gratuitement.
  async function finishJob(jobId, result) {
    const jobRef = jobsCollection.doc(jobId)
    return db.runTransaction(async (tx) => {
      const jobDoc = await tx.get(jobRef)
      if (!jobDoc.exists) return false
      const job = jobDoc.data()
      if (job.status !== 'pending' && job.status !== 'running') return false
      tx.update(jobRef, { status: 'done', result, finishedAt: Date.now() })
      return true
    })
  }

  // Passe le job en `running` au démarrage effectif de la génération — même
  // condition que ci-dessus : un job clôturé entre la réservation et le
  // démarrage ne doit pas redevenir actif (il reverrouillerait le compte).
  async function markRunning(jobId) {
    const jobRef = jobsCollection.doc(jobId)
    return db.runTransaction(async (tx) => {
      const jobDoc = await tx.get(jobRef)
      if (!jobDoc.exists || jobDoc.data().status !== 'pending') return false
      tx.update(jobRef, { status: 'running' })
      return true
    })
  }

  // Solde à afficher côté client (GET /leggendo/quota) sans consommer ni
  // écrire — la période en cours n'est réinitialisée en base qu'à la
  // prochaine vraie réservation.
  async function getQuotaStatus(user) {
    const quotaDoc = await quotasCollection.doc(user.uid).get()
    const q = resetIfStale(user, quotaDoc.exists ? quotaDoc.data() : freshQuota(user))
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
      // Job bloqué détecté en dehors du chemin reserveJob (ex. lu via
      // /my-job) : même clôture conditionnelle + remboursement idempotent.
      await failJob(id, STUCK_JOB_ERROR)
      return false
    }
    return true
  }

  // Nécessite un index composite Firestore (uid ASC, status ASC, createdAt
  // DESC) — Firestore fournit le lien de création au premier appel si absent.
  async function activeJobFor(uid) {
    const snap = await activeJobQuery(uid).get()
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

  return {
    jobsCollection,
    reserveJob,
    markRunning,
    finishJob,
    failJob,
    getQuotaStatus,
    pruneJobs,
    activeJobFor,
    jobFor,
  }
}
