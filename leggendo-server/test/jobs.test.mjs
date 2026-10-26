import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FakeFirestore } from './fake-firestore.mjs'
import { createJobStore, ActiveJobError, JOB_STUCK_MS } from '../jobs.mjs'
import { QuotaExceededError, MONTHLY_CREDITS } from '../quota.mjs'

function makeStore() {
  return createJobStore(new FakeFirestore())
}

test('reserveJob crée le job et consomme l\'essai gratuit dans la même opération', async () => {
  const store = makeStore()
  const user = { uid: 'u1', role: 'gratuit', premium: false, emailVerified: true }
  const jobRef = store.jobsCollection.doc('job-1')
  const q = await store.reserveJob(user, jobRef, 'Mon titre', 'corto')
  assert.equal(q.trialUsed, true)

  const jobDoc = await jobRef.get()
  assert.equal(jobDoc.exists, true)
  assert.equal(jobDoc.data().uid, 'u1')
  assert.equal(jobDoc.data().status, 'pending')
})

test('reserveJob refuse et ne crée rien quand l\'essai gratuit est déjà consommé', async () => {
  const store = makeStore()
  const user = { uid: 'u1', role: 'gratuit', premium: false, emailVerified: true }

  await store.reserveJob(user, store.jobsCollection.doc('job-0'), 'Titre 0', 'corto')
  await store.jobsCollection.doc('job-0').update({ status: 'done' })

  const jobRef = store.jobsCollection.doc('job-refused')
  await assert.rejects(() => store.reserveJob(user, jobRef, 'Titre refusé', 'corto'), QuotaExceededError)

  const jobDoc = await jobRef.get()
  assert.equal(jobDoc.exists, false, 'le job ne doit pas être créé si le quota est refusé')
})

test('reserveJob refuse toujours pour un compte Premium (sans IA)', async () => {
  const store = makeStore()
  const user = { uid: 'u2', role: 'premium', premium: true }
  await assert.rejects(
    () => store.reserveJob(user, store.jobsCollection.doc('job-1'), 'Titre', 'corto'),
    QuotaExceededError
  )
})

test('reserveJob consomme le coût en crédits selon la taille (Premium IA)', async () => {
  const store = makeStore()
  const user = { uid: 'u3', role: 'premium_plus', premium: true }
  const q = await store.reserveJob(user, store.jobsCollection.doc('job-1'), 'Titre', 'lungo')
  assert.equal(q.monthlyUsed, 3) // "lungo" coûte 3 crédits
})

test('failJob rembourse un crédit consommé (Premium IA) après un échec technique', async () => {
  const store = makeStore()
  const user = { uid: 'u3', role: 'premium_plus', premium: true }
  await store.reserveJob(user, store.jobsCollection.doc('job-1'), 'Titre', 'lungo')
  assert.equal(await store.failJob('job-1', 'GLM indisponible'), true)

  const status = await store.getQuotaStatus(user)
  assert.equal(status.used, 0)
  assert.equal(status.remaining, MONTHLY_CREDITS.premium_plus)

  const job = await store.jobsCollection.doc('job-1').get()
  assert.equal(job.data().status, 'error')
  assert.equal(job.data().error, 'GLM indisponible')
})

test('failJob restaure l\'essai gratuit après un échec technique', async () => {
  const store = makeStore()
  const user = { uid: 'u1', role: 'gratuit', premium: false, emailVerified: true }
  await store.reserveJob(user, store.jobsCollection.doc('job-1'), 'Titre', 'corto')
  await store.failJob('job-1', 'échec technique')

  const status = await store.getQuotaStatus(user)
  assert.equal(status.remaining, 1)

  // L'essai est de nouveau utilisable après remboursement.
  const q = await store.reserveJob(user, store.jobsCollection.doc('job-2'), 'Titre 2', 'corto')
  assert.equal(q.trialUsed, true)
})

test('failJob ne rembourse qu\'une fois, même appelé plusieurs fois', async () => {
  const store = makeStore()
  const user = { uid: 'u3', role: 'premium_plus', premium: true }
  await store.reserveJob(user, store.jobsCollection.doc('job-1'), 'Titre', 'lungo')

  assert.equal(await store.failJob('job-1', 'échec 1'), true)
  assert.equal(await store.failJob('job-1', 'échec 2'), false, 'le job est déjà clôturé')

  const status = await store.getQuotaStatus(user)
  assert.equal(status.used, 0, 'un seul remboursement, pas de crédit offert en plus')
  const job = await store.jobsCollection.doc('job-1').get()
  assert.equal(job.data().error, 'échec 1', 'le second appel ne réécrit pas le job')
})

test('finishJob livre le résultat tant que le job est actif', async () => {
  const store = makeStore()
  const user = { uid: 'u3', role: 'premium_plus', premium: true }
  await store.reserveJob(user, store.jobsCollection.doc('job-1'), 'Titre', 'lungo')

  assert.equal(await store.markRunning('job-1'), true)
  assert.equal(await store.finishJob('job-1', { text: 'ciao' }), true)

  const job = await store.jobsCollection.doc('job-1').get()
  assert.equal(job.data().status, 'done')
  assert.deepEqual(job.data().result, { text: 'ciao' })
})

test('finishJob ne livre pas le résultat d\'un job déjà clôturé et remboursé', async () => {
  const store = makeStore()
  const user = { uid: 'u3', role: 'premium_plus', premium: true }
  await store.reserveJob(user, store.jobsCollection.doc('job-1'), 'Titre', 'lungo')
  await store.markRunning('job-1')

  // Génération interminable : le job est déclaré bloqué et remboursé (par
  // /my-job ou par la demande suivante) pendant que GLM répond encore.
  await store.jobsCollection.doc('job-1').update({ createdAt: Date.now() - JOB_STUCK_MS - 1000 })
  assert.equal(await store.activeJobFor('u3'), null)
  assert.equal((await store.getQuotaStatus(user)).used, 0, 'le crédit a bien été rendu')

  assert.equal(await store.finishJob('job-1', { text: 'ciao' }), false)
  const job = await store.jobsCollection.doc('job-1').get()
  assert.equal(job.data().status, 'error', 'le job reste en erreur')
  assert.equal(job.data().result, undefined, 'aucun texte livré gratuitement')
})

test('markRunning ne réactive pas un job déjà clôturé', async () => {
  const store = makeStore()
  const user = { uid: 'u3', role: 'premium_plus', premium: true }
  await store.reserveJob(user, store.jobsCollection.doc('job-1'), 'Titre', 'lungo')
  await store.failJob('job-1', 'clôturé entre-temps')

  assert.equal(await store.markRunning('job-1'), false)
  const job = await store.jobsCollection.doc('job-1').get()
  assert.equal(job.data().status, 'error')
})

test('getQuotaStatus n\'écrit rien et ne consomme aucun crédit', async () => {
  const store = makeStore()
  const user = { uid: 'u3', role: 'premium_plus', premium: true }
  const status = await store.getQuotaStatus(user)
  assert.deepEqual(status, { type: 'credits', limit: MONTHLY_CREDITS.premium_plus, used: 0, remaining: MONTHLY_CREDITS.premium_plus })
})

test('activeJobFor retrouve le job en cours puis ne retrouve plus rien une fois terminé', async () => {
  const store = makeStore()
  const user = { uid: 'u1', role: 'gratuit', premium: false, emailVerified: true }
  const jobRef = store.jobsCollection.doc('job-1')
  await store.reserveJob(user, jobRef, 'Mon titre', 'corto')

  const active = await store.activeJobFor('u1')
  assert.equal(active.id, 'job-1')

  await jobRef.update({ status: 'done' })
  assert.equal(await store.activeJobFor('u1'), null)
})

test('activeJobFor marque en erreur puis ignore un job bloqué depuis trop longtemps', async () => {
  const store = makeStore()
  const jobRef = store.jobsCollection.doc('job-stuck')
  await jobRef.set({
    uid: 'u1',
    status: 'running',
    createdAt: Date.now() - JOB_STUCK_MS - 1000,
    title: 'Bloqué',
  })

  const active = await store.activeJobFor('u1')
  assert.equal(active, null)

  const job = await jobRef.get()
  assert.equal(job.data().status, 'error')
})

test('jobFor ne renvoie le job qu\'à son propriétaire', async () => {
  const store = makeStore()
  const jobRef = store.jobsCollection.doc('job-1')
  await jobRef.set({ uid: 'u1', status: 'done', title: 'Mon titre', result: { text: 'ciao' } })

  assert.deepEqual((await store.jobFor('u1', 'job-1')).uid, 'u1')
  assert.equal(await store.jobFor('u2', 'job-1'), null)
  assert.equal(await store.jobFor('u1', 'job-inconnu'), null)
})

test('reserveJob refuse une deuxième réservation tant que la première est active (même compte)', async () => {
  const store = makeStore()
  const user = { uid: 'u1', role: 'premium_plus', premium: true }

  await store.reserveJob(user, store.jobsCollection.doc('job-1'), 'Titre 1', 'corto')
  await assert.rejects(
    () => store.reserveJob(user, store.jobsCollection.doc('job-2'), 'Titre 2', 'corto'),
    ActiveJobError
  )

  const status = await store.getQuotaStatus(user)
  assert.equal(status.used, 1, 'un seul job doit avoir consommé du crédit')
})

test('reserveJob n\'empêche pas un autre compte de réserver un job en parallèle', async () => {
  const store = makeStore()
  const userA = { uid: 'uA', role: 'premium_plus', premium: true }
  const userB = { uid: 'uB', role: 'premium_plus', premium: true }

  await store.reserveJob(userA, store.jobsCollection.doc('job-a'), 'Titre A', 'corto')
  const q = await store.reserveJob(userB, store.jobsCollection.doc('job-b'), 'Titre B', 'corto')
  assert.equal(q.monthlyUsed, 1)
})

test('reserveJob clôture et rembourse un job bloqué du même compte, puis réserve normalement', async () => {
  const store = makeStore()
  const user = { uid: 'u1', role: 'premium_plus', premium: true }
  const stuckRef = store.jobsCollection.doc('job-stuck')
  await stuckRef.set({
    uid: 'u1',
    status: 'running',
    createdAt: Date.now() - JOB_STUCK_MS - 1000,
    title: 'Bloqué',
    sizeId: 'lungo',
    role: 'premium_plus',
  })
  const q = await store.reserveJob(user, store.jobsCollection.doc('job-new'), 'Nouveau titre', 'corto')

  const stuckDoc = await stuckRef.get()
  assert.equal(stuckDoc.data().status, 'error')
  assert.ok(stuckDoc.data().creditRefundedAt)
  // Aucun crédit n'avait encore été décompté pour ce job bloqué créé
  // directement par le test (le remboursement est borné à 0) ; seul le
  // nouveau job (1 crédit) est comptabilisé.
  assert.equal(q.monthlyUsed, 1)
})

test('activeJobFor clôture et rembourse un job bloqué une seule fois même appelé plusieurs fois', async () => {
  const store = makeStore()
  const jobRef = store.jobsCollection.doc('job-stuck')
  await jobRef.set({
    uid: 'u1',
    status: 'running',
    createdAt: Date.now() - JOB_STUCK_MS - 1000,
    title: 'Bloqué',
    sizeId: 'lungo',
    role: 'premium_plus',
  })

  assert.equal(await store.activeJobFor('u1'), null)
  const afterFirst = await store.getQuotaStatus({ uid: 'u1', role: 'premium_plus', premium: true })
  assert.equal(afterFirst.used, 0, 'le remboursement doit ramener la consommation à 0')

  // Rappel : le job est déjà en 'error', donc plus détecté comme actif —
  // mais on vérifie explicitement qu'un deuxième remboursement ne se
  // déclenche pas si on rejoue la clôture sur le même document.
  assert.equal(await store.activeJobFor('u1'), null)
  const afterSecond = await store.getQuotaStatus({ uid: 'u1', role: 'premium_plus', premium: true })
  assert.equal(afterSecond.used, 0, 'un deuxième passage ne doit pas rembourser une deuxième fois')
})
