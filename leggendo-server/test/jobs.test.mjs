import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FakeFirestore } from './fake-firestore.mjs'
import { createJobStore, JOB_STUCK_MS } from '../jobs.mjs'
import { QuotaExceededError, MONTHLY_CREDITS } from '../quota.mjs'

function makeStore() {
  return createJobStore(new FakeFirestore())
}

test('reserveJob crée le job et consomme l\'essai gratuit dans la même opération', async () => {
  const store = makeStore()
  const user = { uid: 'u1', role: 'gratuit', premium: false }
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
  const user = { uid: 'u1', role: 'gratuit', premium: false }

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

test('refundCredit rembourse un crédit consommé (Premium IA) après un échec technique', async () => {
  const store = makeStore()
  const user = { uid: 'u3', role: 'premium_plus', premium: true }
  await store.reserveJob(user, store.jobsCollection.doc('job-1'), 'Titre', 'lungo')
  await store.refundCredit(user, 'lungo')

  const status = await store.getQuotaStatus(user)
  assert.equal(status.used, 0)
  assert.equal(status.remaining, MONTHLY_CREDITS.premium_plus)
})

test('refundCredit restaure l\'essai gratuit après un échec technique', async () => {
  const store = makeStore()
  const user = { uid: 'u1', role: 'gratuit', premium: false }
  await store.reserveJob(user, store.jobsCollection.doc('job-1'), 'Titre', 'corto')
  await store.refundCredit(user, 'corto')

  const status = await store.getQuotaStatus(user)
  assert.equal(status.remaining, 1)

  // L'essai est de nouveau utilisable après remboursement.
  await store.jobsCollection.doc('job-1').update({ status: 'done' })
  const q = await store.reserveJob(user, store.jobsCollection.doc('job-2'), 'Titre 2', 'corto')
  assert.equal(q.trialUsed, true)
})

test('getQuotaStatus n\'écrit rien et ne consomme aucun crédit', async () => {
  const store = makeStore()
  const user = { uid: 'u3', role: 'premium_plus', premium: true }
  const status = await store.getQuotaStatus(user)
  assert.deepEqual(status, { type: 'credits', limit: MONTHLY_CREDITS.premium_plus, used: 0, remaining: MONTHLY_CREDITS.premium_plus })
})

test('activeJobFor retrouve le job en cours puis ne retrouve plus rien une fois terminé', async () => {
  const store = makeStore()
  const user = { uid: 'u1', role: 'gratuit', premium: false }
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
