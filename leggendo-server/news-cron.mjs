// Cron VPS — génère UN texte d'actualité par exécution (planifié toutes les
// 30 minutes, voir crontab en bas de fichier), pour la formule Premium+. Pool
// partagé : un seul texte par run, pas un appel par abonné. Deux garde-fous :
// - lock fichier (acquireLock/releaseLock) : une génération avec retries peut
//   dépasser l'intervalle du cron, le lock évite deux runs simultanés qui
//   doubleraient le volume produit ;
// - quota horaire dur (MAX_PER_HOUR = 1, voir countLastHour) : au-delà, un
//   run ne fait rien même s'il trouve un article frais.
// Cible : 1 texte par heure maximum (volume réduit ~8x par rapport à
// l'ancienne cible de 4-7/heure).
//
// Usage : node news-cron.mjs
// Nécessite les mêmes variables d'environnement que server.mjs
// (GLM_API_KEY, GOOGLE_APPLICATION_CREDENTIALS).

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { fetchAllFeeds, COUNTRIES } from './rss.mjs'
import { generateNewsText } from './news.mjs'

initializeApp({ credential: applicationDefault() })
const db = getFirestore()

// Verrou fichier anti-chevauchement : une génération (avec ses retries sur
// troncature du LLM) peut dépasser 5 minutes, or le cron tourne toutes les
// 5-10 minutes — sans verrou, deux exécutions tournent en parallèle et
// doublent le volume de textes produits. Un lock périmé (process mort sans
// nettoyage, ex. kill -9) est ignoré au bout de 20 minutes.
const LOCK_PATH = path.join(os.tmpdir(), 'leggendo-news-cron.lock')
const LOCK_STALE_MS = 20 * 60 * 1000

function acquireLock() {
  try {
    const stat = fs.statSync(LOCK_PATH)
    if (Date.now() - stat.mtimeMs < LOCK_STALE_MS) return false
    fs.unlinkSync(LOCK_PATH)
  } catch {
    // pas de lock existant, on continue
  }
  try {
    fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: 'wx' })
    return true
  } catch {
    return false
  }
}

function releaseLock() {
  try {
    fs.unlinkSync(LOCK_PATH)
  } catch {
    // déjà supprimé, rien à faire
  }
}

const LEVELS_ROTATION = ['A2', 'B1', 'B2', 'C1']
// Une news jugée "similaire" à une des 50 dernières (même si le lien diffère
// — ex. deux dépêches différentes sur le même événement) est écartée : on
// évite de publier deux textes quasi identiques à quelques minutes d'écart.
const RECENT_WINDOW = 50
const SIMILARITY_THRESHOLD = 0.5

// Cadence cible : 1 news par heure maximum (quota strict, voir
// countLastHour). Le cron tourne toutes les 30 minutes (2 exécutions/heure) ;
// ce plafond est le garde-fou qui empêche de dépasser 1 même si plusieurs
// runs consécutifs trouvent chacun un article frais.
const MAX_PER_HOUR = 1
const HOUR_MS = 60 * 60 * 1000

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

// Nombre de news publiées durant la dernière heure glissante (createdAt >=
// now - 1h). Sert de garde-fou dur : au-delà de MAX_PER_HOUR, on n'écrit
// plus rien, quelle que soit la fraîcheur des articles trouvés.
async function countLastHour() {
  const since = Date.now() - HOUR_MS
  const snap = await db.collection('newsTexts').where('createdAt', '>=', since).get()
  return snap.size
}

async function main() {
  const publishedLastHour = await countLastHour()
  if (publishedLastHour >= MAX_PER_HOUR) {
    console.log(
      `[news-cron] quota horaire atteint (${publishedLastHour}/${MAX_PER_HOUR}), rien à faire.`
    )
    return
  }

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

if (!acquireLock()) {
  console.log('[news-cron] une autre exécution est déjà en cours (lock), on saute ce run.')
  process.exitCode = 0
} else {
  main()
    .catch((err) => {
      console.error('[news-cron] échec :', err)
      process.exitCode = 1
    })
    .finally(releaseLock)
}

// --- Déploiement VPS ---
// crontab -e (utilisateur dédié, même que leggendo-api.service) :
//   */30 * * * * cd /chemin/vers/leggendo-server && \
//     GLM_API_KEY=... GOOGLE_APPLICATION_CREDENTIALS=... \
//     /usr/bin/node news-cron.mjs >> /var/log/leggendo-news.log 2>&1
//
// Chaque run ne génère un texte que si un article assez frais et distinct
// des 50 derniers a été trouvé (voir isFresh) ET si le quota horaire
// (MAX_PER_HOUR = 1, voir countLastHour) n'est pas déjà atteint. À 2
// exécutions/heure, le volume réel est au maximum 1 texte/heure (~8x moins
// que l'ancienne cible de 4-7/heure).
