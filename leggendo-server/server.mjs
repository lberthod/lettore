// API « Créer son texte » de Leggendo — tourne sur le VPS derrière Caddy
// (api.loicberthod.ch/leggendo/*). Un utilisateur connecté (Firebase Auth)
// demande un texte sur mesure ; la génération GLM prenant plusieurs minutes,
// l'API fonctionne en mode job : POST /leggendo/generate → { jobId }, puis
// GET /leggendo/jobs/<id> jusqu'à status "done". Les jobs sont persistés dans
// Firestore (collection `leggendoJobs`) pour survivre à un redémarrage du VPS.
//
// Seule dépendance npm : firebase-admin (accès Firestore). Le reste tourne en
// http natif + fetch (Node ≥ 18).

import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { generateUserText } from './generate.mjs'
import { LEVELS } from './schema.mjs'
import { GLM_MODEL } from './llm.mjs'
import { QuotaExceededError, creditCost } from './quota.mjs'
import { createJobStore, ActiveJobError } from './jobs.mjs'
import { buildTaxonomyIndex, parseRequest, slugify } from './validate.mjs'

// Authentification du SDK Admin via un compte de service dédié (rôle Cloud
// Datastore User) — le VPS n'est pas un runtime GCP géré, donc pas de
// credentials implicites : voir README.md pour la procédure de génération.
// `verifyIdToken` ci-dessous ne nécessite aucun rôle IAM supplémentaire : la
// signature est vérifiée localement contre les clés publiques Google.
initializeApp({ credential: applicationDefault() })
const db = getFirestore()
const auth = getAuth()

const PORT = Number(process.env.PORT || 8091)

// Origines autorisées à appeler l'API (le token Firebase reste la vraie
// protection, mais on évite en plus qu'un site tiers embarque des appels
// authentifiés depuis le navigateur d'un utilisateur).
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  'https://leggendo-dbb84.web.app,https://leggendo-dbb84.firebaseapp.com,http://localhost:5173'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

function corsOrigin(req) {
  const origin = req.headers.origin
  return origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
}

// Taxonomie genre × thème embarquée (copie de src/texts/category.json).
const HERE = path.dirname(fileURLToPath(import.meta.url))
const taxonomy = JSON.parse(fs.readFileSync(path.join(HERE, 'category.json'), 'utf8'))
const { themeById, genreById, sizeById } = buildTaxonomyIndex(taxonomy)

// --- Vérification du token Firebase ---
// Le SDK admin vérifie la signature et relit les custom claims (role,
// premium — posés côté Cloud Functions, voir functions/index.js) en un seul
// appel local, sans round-trip vers identitytoolkit.
async function verifyIdToken(idToken) {
  try {
    const decoded = await auth.verifyIdToken(idToken)
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role || (decoded.premium ? 'premium' : 'gratuit'),
      premium: Boolean(decoded.premium),
    }
  } catch {
    return null
  }
}

// --- Quotas + jobs persistés dans Firestore (survivent à un redémarrage du
// VPS ; quota consommé et job créé dans la même transaction, voir jobs.mjs).
const jobStore = createJobStore(db)
setInterval(() => {
  jobStore.pruneJobs().catch((err) => console.error('Erreur purge des jobs :', err))
}, 10 * 60 * 1000).unref()

// --- Mesure des coûts IA (README_TARIFICATION.md, § Mesure des coûts IA) ---
// Estimation approximative, pas une facture exacte : le tarif réel dépend du
// fournisseur/modèle configuré (GLM_MODEL) et change dans le temps.
// Ajustable sans redéploiement de schéma via une variable d'env.
const ESTIMATED_COST_PER_1K_TOKENS_USD = Number(
  process.env.ESTIMATED_COST_PER_1K_TOKENS_USD || 0.003
)
const generationLogs = db.collection('generationLogs')

async function logGeneration({ user, size, level, jobId, status, startedAt, usage, error }) {
  const totalTokens = usage.reduce((sum, u) => sum + (u.total_tokens || 0), 0)
  const entry = {
    uid: user.uid,
    email: user.email || null,
    role: user.role,
    level,
    sizeId: size.id,
    creditsCost: creditCost(size.id),
    jobId,
    status,
    durationMs: Date.now() - startedAt,
    modelCalls: usage.length,
    totalTokens,
    estimatedCostUsd: Math.round((totalTokens / 1000) * ESTIMATED_COST_PER_1K_TOKENS_USD * 10000) / 10000,
    createdAt: Date.now(),
    ...(error ? { error } : {}),
  }
  try {
    await generationLogs.add(entry)
  } catch (err) {
    console.error(`[job ${jobId}] échec de journalisation du coût :`, err)
  }
  // Alerte simple (README_TARIFICATION.md) : le coût IA ne doit pas dépasser
  // 25 % du revenu Premium IA — seuil grossier faute d'agrégation en temps
  // réel, mais suffisant pour repérer une génération anormalement coûteuse.
  if (entry.estimatedCostUsd > 0.5) {
    console.warn(
      `[job ${jobId}] ⚠ coût estimé élevé pour une génération : $${entry.estimatedCostUsd} (${totalTokens} tokens, ${usage.length} appel(s))`
    )
  }
}

// --- Helpers HTTP ---
// En-têtes de durcissement communs à toutes les réponses (JSON comme
// préflight OPTIONS). Pas de CSP ici : cette API ne sert que du JSON, la CSP
// n'a de sens que pour les réponses HTML (voir firebase.json côté hosting).
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Resource-Policy': 'same-site',
}

function sendJson(res, status, body, origin) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin || ALLOWED_ORIGINS[0],
    Vary: 'Origin',
    ...SECURITY_HEADERS,
  })
  res.end(payload)
}

function readBody(req, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('Corps de requête trop volumineux'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  // CORS : restreint aux domaines connus de l'app (le token Firebase reste
  // la vraie protection, mais on évite qu'un site tiers rejoue les appels
  // authentifiés depuis le navigateur d'un utilisateur).
  const origin = corsOrigin(req)
  const send = (status, body) => sendJson(res, status, body, origin)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
      ...SECURITY_HEADERS,
    })
    res.end()
    return
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  try {
    if (req.method === 'GET' && url.pathname === '/leggendo/health') {
      send(200, { ok: true, model: GLM_MODEL })
      return
    }

    if (req.method === 'GET' && url.pathname === '/leggendo/taxonomy') {
      // La page « Créer son texte » peut charger la taxonomie ici (une seule
      // source de vérité côté serveur).
      send(200, {
        themes: taxonomy.themes,
        genres: taxonomy.genres,
        sizes: taxonomy.sizes,
        levels: LEVELS,
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/leggendo/generate') {
      const auth = req.headers.authorization || ''
      const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!idToken) {
        send(401, { error: 'Connexion requise.' })
        return
      }
      const user = await verifyIdToken(idToken)
      if (!user) {
        send(401, { error: 'Session invalide ou expirée, reconnectez-vous.' })
        return
      }

      let body
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        send(400, { error: 'JSON invalide.' })
        return
      }
      const { errors, theme, genre, size, level, title, summary } = parseRequest(body, {
        themeById,
        genreById,
        sizeById,
      })
      if (errors.length) {
        send(400, { error: errors.join(' ; ') })
        return
      }
      const jobId = crypto.randomUUID()
      const jobRef = jobStore.jobsCollection.doc(jobId)
      let q
      try {
        q = await jobStore.reserveJob(user, jobRef, title, size.id)
      } catch (err) {
        if (err instanceof QuotaExceededError || err instanceof ActiveJobError) {
          send(429, { error: err.message })
          return
        }
        throw err
      }
      console.log(
        `[job ${jobId}] ${user.email || user.uid} (${user.role}) — ${theme.id}/${genre.id} ${level} ${size.id} « ${title} » — crédits ${JSON.stringify(q)}`
      )
      const startedAt = Date.now()

      // Génération en tâche de fond ; le client sonde /leggendo/jobs/<id>.
      ;(async () => {
        await jobRef.update({ status: 'running' })
        const usage = []
        try {
          const textData = await generateUserText({
            id: slugify(title),
            level,
            theme,
            genre,
            title,
            summary,
            size,
            usage,
          })
          await jobRef.update({ status: 'done', result: textData })
          console.log(`[job ${jobId}] terminé (${textData.wordCount} mots)`)
          await logGeneration({ user, size, level, jobId, status: 'done', startedAt, usage })
        } catch (err) {
          await jobRef.update({ status: 'error', error: err.message })
          console.error(`[job ${jobId}] échec : ${err.message}`)
          // Une génération qui échoue pour une raison technique ne consomme
          // pas de crédit (README_TARIFICATION.md).
          await jobStore.refundCredit(user, size.id).catch((e) =>
            console.error(`[job ${jobId}] échec du remboursement de crédit :`, e)
          )
          await logGeneration({ user, size, level, jobId, status: 'error', startedAt, usage, error: err.message })
        }
      })()

      send(202, { jobId })
      return
    }

    // Solde de crédits de génération, à afficher avant de lancer une
    // génération (README_TARIFICATION.md, § Règles des crédits).
    if (req.method === 'GET' && url.pathname === '/leggendo/quota') {
      const authHeader = req.headers.authorization || ''
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      const user = idToken ? await verifyIdToken(idToken) : null
      if (!user) {
        send(401, { error: 'Connexion requise.' })
        return
      }
      send(200, await jobStore.getQuotaStatus(user))
      return
    }

    // Job actif de l'utilisateur : permet au client de se rattacher à une
    // génération en cours quand il a perdu le jobId (rechargement, autre
    // appareil) au lieu de rester bloqué sur « déjà en cours, patientez ».
    if (req.method === 'GET' && url.pathname === '/leggendo/my-job') {
      const auth = req.headers.authorization || ''
      const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      const user = idToken ? await verifyIdToken(idToken) : null
      if (!user) {
        send(401, { error: 'Connexion requise.' })
        return
      }
      const active = await jobStore.activeJobFor(user.uid)
      send(
        200,
        active
          ? {
              jobId: active.id,
              status: active.job.status,
              title: active.job.title || '',
              createdAt: active.job.createdAt,
            }
          : { jobId: null }
      )
      return
    }

    const jobMatch = url.pathname.match(/^\/leggendo\/jobs\/([a-f0-9-]{36})$/)
    if (req.method === 'GET' && jobMatch) {
      // Le résultat n'est remis qu'au propriétaire du job : token exigé
      const auth = req.headers.authorization || ''
      const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      const user = idToken ? await verifyIdToken(idToken) : null
      if (!user) {
        send(401, { error: 'Connexion requise.' })
        return
      }
      const job = await jobStore.jobFor(user.uid, jobMatch[1])
      if (!job) {
        send(404, { error: 'Job inconnu ou expiré.' })
        return
      }
      send(200, {
        status: job.status,
        ...(job.status === 'done' ? { result: job.result } : {}),
        ...(job.status === 'error' ? { error: job.error } : {}),
      })
      return
    }

    send(404, { error: 'Route inconnue.' })
  } catch (err) {
    console.error('Erreur serveur :', err)
    send(500, { error: 'Erreur interne du serveur.' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`leggendo API sur http://127.0.0.1:${PORT} (modèle ${GLM_MODEL})`)
})
