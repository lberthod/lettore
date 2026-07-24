// Cron VPS — génère UN texte d'actualité par exécution (planifié 3×/jour,
// voir crontab en bas de fichier), pour la formule Premium+. Pool partagé :
// un seul texte par niveau/run, pas un appel par abonné (voir
// PREMIUM_PLUS_ANALYSIS.md §2.2 sur l'impact coût de cette architecture).
//
// Usage : node news-cron.mjs
// Nécessite les mêmes variables d'environnement que server.mjs
// (GLM_API_KEY, GOOGLE_APPLICATION_CREDENTIALS).

import crypto from 'node:crypto'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { fetchAllFeeds } from './rss.mjs'
import { generateNewsText } from './news.mjs'

initializeApp({ credential: applicationDefault() })
const db = getFirestore()

const LEVELS_ROTATION = ['A2', 'B1', 'B2', 'C1']

function slugify(title) {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return `notizia_${base || 'testo'}_${crypto.randomBytes(3).toString('hex')}`
}

// Rotation déterministe des niveaux entre exécutions (compteur persisté),
// pour couvrir A2/B1/B2/C1 régulièrement plutôt qu'au hasard.
async function nextLevel() {
  const ref = db.collection('newsState').doc('counter')
  const level = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const value = (snap.exists ? snap.data().value : 0) + 1
    tx.set(ref, { value }, { merge: true })
    return LEVELS_ROTATION[value % LEVELS_ROTATION.length]
  })
  return level
}

// Choisit le premier article dont le lien n'a pas déjà été utilisé.
async function pickFreshItem(items) {
  for (const item of items) {
    if (!item.link) continue
    const snap = await db
      .collection('newsTexts')
      .where('sourceLink', '==', item.link)
      .limit(1)
      .get()
    if (snap.empty) return item
  }
  return null
}

async function main() {
  console.log('[news-cron] récupération des flux RSS…')
  const items = await fetchAllFeeds()
  if (!items.length) {
    console.error('[news-cron] aucun article récupéré, abandon.')
    process.exitCode = 1
    return
  }

  const item = await pickFreshItem(items)
  if (!item) {
    console.log('[news-cron] tous les articles récupérés ont déjà été traités, rien à faire.')
    return
  }

  const level = await nextLevel()
  const id = slugify(item.title)
  console.log(`[news-cron] génération niveau ${level} — « ${item.title} »`)

  const textData = await generateNewsText({ id, level, item })
  textData.sourceLink = item.link

  await db.collection('newsTexts').doc(id).set({
    ...textData,
    createdAt: Date.now(),
  })

  console.log(`[news-cron] terminé : ${id} (${textData.wordCount} mots, niveau ${level})`)
}

main().catch((err) => {
  console.error('[news-cron] échec :', err)
  process.exitCode = 1
})

// --- Déploiement VPS ---
// crontab -e (utilisateur dédié, même que leggendo-api.service) :
//   0 7,13,20 * * * cd /chemin/vers/leggendo-server && \
//     GLM_API_KEY=... GOOGLE_APPLICATION_CREDENTIALS=... \
//     /usr/bin/node news-cron.mjs >> /var/log/leggendo-news.log 2>&1
