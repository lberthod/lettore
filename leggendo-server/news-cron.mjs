// Cron VPS — génère UN texte d'actualité par exécution (planifié toutes les
// 5 minutes, voir crontab en bas de fichier), pour la formule Premium+. Pool
// partagé : un seul texte par run, pas un appel par abonné (impact coût
// direct de cette architecture — à ce rythme, jusqu'à ~288 exécutions/jour,
// chacune ne génère un texte QUE si un article réellement nouveau et
// suffisamment différent des 50 derniers a été trouvé).
//
// Usage : node news-cron.mjs
// Nécessite les mêmes variables d'environnement que server.mjs
// (GLM_API_KEY, GOOGLE_APPLICATION_CREDENTIALS).

import crypto from 'node:crypto'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { fetchAllFeeds, COUNTRIES } from './rss.mjs'
import { generateNewsText } from './news.mjs'

initializeApp({ credential: applicationDefault() })
const db = getFirestore()

const LEVELS_ROTATION = ['A2', 'B1', 'B2', 'C1']
// Une news jugée "similaire" à une des 50 dernières (même si le lien diffère
// — ex. deux dépêches différentes sur le même événement) est écartée : on
// évite de publier deux textes quasi identiques à quelques minutes d'écart.
const RECENT_WINDOW = 50
const SIMILARITY_THRESHOLD = 0.5

function slugify(title) {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return `notizia_${base || 'testo'}_${crypto.randomBytes(3).toString('hex')}`
}

// Rotation déterministe des niveaux ET des pays entre exécutions (un seul
// compteur monotone, deux rotations de longueurs différentes dérivées de la
// même valeur — pas besoin de deux transactions Firestore séparées).
async function nextRotation() {
  const ref = db.collection('newsState').doc('counter')
  const value = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const next = (snap.exists ? snap.data().value : 0) + 1
    tx.set(ref, { value: next }, { merge: true })
    return next
  })
  return {
    level: LEVELS_ROTATION[value % LEVELS_ROTATION.length],
    country: COUNTRIES[value % COUNTRIES.length],
  }
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3)
}

// Similarité de Jaccard sur les tokens des titres (indépendante de la
// langue source puisqu'on compare les titres RSS bruts entre eux, pas les
// titres italiens générés).
function titleSimilarity(a, b) {
  const setA = new Set(normalizeTitle(a))
  const setB = new Set(normalizeTitle(b))
  if (!setA.size || !setB.size) return 0
  let intersection = 0
  for (const w of setA) if (setB.has(w)) intersection++
  const union = setA.size + setB.size - intersection
  return union ? intersection / union : 0
}

// Les 50 derniers textes publiés (lien source + titre source) — sert à la
// fois au filtre "lien déjà utilisé" et au filtre "trop similaire".
async function loadRecentHistory() {
  const snap = await db
    .collection('newsTexts')
    .orderBy('createdAt', 'desc')
    .limit(RECENT_WINDOW)
    .get()
  const links = new Set()
  const titles = []
  for (const doc of snap.docs) {
    const data = doc.data()
    if (data.sourceLink) links.add(data.sourceLink)
    if (data.sourceTitle) titles.push(data.sourceTitle)
  }
  return { links, titles }
}

function isFresh(item, history) {
  if (!item.link || history.links.has(item.link)) return false
  return !history.titles.some((t) => titleSimilarity(item.title, t) >= SIMILARITY_THRESHOLD)
}

// Choisit le premier article frais (lien inédit + pas trop proche des 50
// derniers), en priorisant le pays de la rotation courante ; à défaut,
// n'importe quel pays.
function pickFreshItem(items, history, preferredCountry) {
  const preferred = items.filter((i) => i.country === preferredCountry)
  return preferred.find((i) => isFresh(i, history)) || items.find((i) => isFresh(i, history)) || null
}

async function main() {
  console.log('[news-cron] récupération des flux RSS (IT/CH/FR)…')
  const items = await fetchAllFeeds()
  if (!items.length) {
    console.error('[news-cron] aucun article récupéré, abandon.')
    process.exitCode = 1
    return
  }

  const { level, country } = await nextRotation()
  const history = await loadRecentHistory()
  const item = pickFreshItem(items, history, country)
  if (!item) {
    console.log('[news-cron] aucun article assez frais/distinct des 50 derniers, rien à faire.')
    return
  }

  const id = slugify(item.title)
  console.log(
    `[news-cron] génération niveau ${level} — [${item.country}/${item.category}] « ${item.title} » (${item.sourceName})`
  )

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
//   */5 * * * * cd /chemin/vers/leggendo-server && \
//     GLM_API_KEY=... GOOGLE_APPLICATION_CREDENTIALS=... \
//     /usr/bin/node news-cron.mjs >> /var/log/leggendo-news.log 2>&1
//
// À ce rythme, chaque run ne génère un texte que si un article assez frais
// et distinct des 50 derniers a été trouvé (voir isFresh) : le volume réel
// dépend de la cadence de publication des flux sources, pas d'un texte
// garanti toutes les 5 minutes. Si le coût LLM à ce rythme devient trop
// élevé, augmenter l'intervalle cron est le seul levier à changer (aucune
// autre modification nécessaire).
