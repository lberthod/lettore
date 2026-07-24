// API « Créer son texte » de Leggendo — tourne sur le VPS derrière Caddy
// (api.loicberthod.ch/leggendo/*). Un utilisateur connecté (Firebase Auth)
// demande un texte sur mesure ; la génération GLM prenant plusieurs minutes,
// l'API fonctionne en mode job : POST /leggendo/generate → { jobId }, puis
// GET /leggendo/jobs/<id> jusqu'à status "done".
//
// Aucune dépendance npm : http natif + fetch (Node ≥ 18).

import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateUserText } from './generate.mjs'
import { LEVELS } from './schema.mjs'
import { GLM_MODEL } from './llm.mjs'

const PORT = Number(process.env.PORT || 8091)
// Clé web Firebase du projet leggendo-dbb84 (publique, sert uniquement à
// vérifier les ID tokens via l'API identitytoolkit).
const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY || 'AIzaSyDDRg8xkDgK92g5vogKKg8XVHZcv8DYD2k'

// Taxonomie genre × thème embarquée (copie de src/texts/category.json).
const HERE = path.dirname(fileURLToPath(import.meta.url))
const taxonomy = JSON.parse(fs.readFileSync(path.join(HERE, 'category.json'), 'utf8'))
const themeById = new Map(taxonomy.themes.map((t) => [t.id, t]))
const genreById = new Map(taxonomy.genres.map((g) => [g.id, g]))
const sizeById = new Map(taxonomy.sizes.map((s) => [s.id, s]))

// --- Vérification du token Firebase (sans SDK admin) ---
async function verifyIdToken(idToken) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  )
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  const user = data?.users?.[0]
  return user ? { uid: user.localId, email: user.email } : null
}

// --- Jobs en mémoire ---
const jobs = new Map() // jobId → { uid, status, createdAt, result?, error? }
const JOB_TTL_MS = 60 * 60 * 1000

function pruneJobs() {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id)
  }
}
setInterval(pruneJobs, 10 * 60 * 1000).unref()

// Filet de sécurité : un job actif depuis trop longtemps est considéré comme
// mort (en plus du timeout des appels GLM) — sinon il verrouillerait le compte
// définitivement, la génération étant limitée à un job à la fois par compte.
const JOB_STUCK_MS = 45 * 60 * 1000

function isActive(job) {
  if (job.status !== 'pending' && job.status !== 'running') return false
  if (Date.now() - job.createdAt > JOB_STUCK_MS) {
    job.status = 'error'
    job.error = 'Génération interrompue (délai maximal dépassé).'
    return false
  }
  return true
}

function activeJobFor(uid) {
  for (const [id, job] of jobs) {
    if (job.uid === uid && isActive(job)) return { id, job }
  }
  return null
}

// --- Helpers HTTP ---
function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
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

function slugify(title) {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return `${base || 'testo'}_${crypto.randomBytes(3).toString('hex')}`
}

// --- Validation de la demande ---
function parseRequest(body) {
  const errors = []
  const theme = themeById.get(body.theme)
  if (!theme) errors.push('thème inconnu')
  const genre = genreById.get(body.genre)
  if (!genre) errors.push('genre (sous-catégorie) inconnu')
  const size = sizeById.get(body.size)
  if (!size) errors.push('taille inconnue')
  const level = LEVELS.includes(body.level) ? body.level : null
  if (!level) errors.push('niveau CECR invalide')
  const title = String(body.title || '').trim()
  if (title.length < 3 || title.length > 120) errors.push('titre : 3 à 120 caractères')
  const summary = String(body.summary || '').trim()
  if (summary.length < 10 || summary.length > 1500)
    errors.push('résumé : 10 à 1500 caractères')
  if (genre && level && genre.levels && !genre.levels.includes(level))
    errors.push(`le genre « ${genre.name} » n'est pas proposé au niveau ${level}`)
  return { errors, theme, genre, size, level, title, summary }
}

const server = http.createServer(async (req, res) => {
  // CORS : l'app (Firebase Hosting / localhost dev) appelle depuis un autre
  // domaine ; l'accès est contrôlé par le token Firebase, pas par l'origine.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    })
    res.end()
    return
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  try {
    if (req.method === 'GET' && url.pathname === '/leggendo/health') {
      sendJson(res, 200, { ok: true, model: GLM_MODEL, jobs: jobs.size })
      return
    }

    if (req.method === 'GET' && url.pathname === '/leggendo/taxonomy') {
      // La page « Créer son texte » peut charger la taxonomie ici (une seule
      // source de vérité côté serveur).
      sendJson(res, 200, {
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
        sendJson(res, 401, { error: 'Connexion requise.' })
        return
      }
      const user = await verifyIdToken(idToken)
      if (!user) {
        sendJson(res, 401, { error: 'Session invalide ou expirée, reconnectez-vous.' })
        return
      }

      let body
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        sendJson(res, 400, { error: 'JSON invalide.' })
        return
      }
      const { errors, theme, genre, size, level, title, summary } = parseRequest(body)
      if (errors.length) {
        sendJson(res, 400, { error: errors.join(' ; ') })
        return
      }
      if (activeJobFor(user.uid)) {
        sendJson(res, 429, {
          error: 'Une génération est déjà en cours pour votre compte, patientez.',
        })
        return
      }

      const jobId = crypto.randomUUID()
      const job = { uid: user.uid, status: 'pending', createdAt: Date.now(), title }
      jobs.set(jobId, job)
      console.log(
        `[job ${jobId}] ${user.email || user.uid} — ${theme.id}/${genre.id} ${level} ${size.id} « ${title} »`
      )

      // Génération en tâche de fond ; le client sonde /leggendo/jobs/<id>.
      ;(async () => {
        job.status = 'running'
        try {
          const textData = await generateUserText({
            id: slugify(title),
            level,
            theme,
            genre,
            title,
            summary,
            size,
          })
          job.result = textData
          job.status = 'done'
          console.log(`[job ${jobId}] terminé (${textData.wordCount} mots)`)
        } catch (err) {
          job.error = err.message
          job.status = 'error'
          console.error(`[job ${jobId}] échec : ${err.message}`)
        }
      })()

      sendJson(res, 202, { jobId })
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
        sendJson(res, 401, { error: 'Connexion requise.' })
        return
      }
      const active = activeJobFor(user.uid)
      sendJson(
        res,
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
      const job = jobs.get(jobMatch[1])
      if (!job) {
        sendJson(res, 404, { error: 'Job inconnu ou expiré.' })
        return
      }
      sendJson(res, 200, {
        status: job.status,
        ...(job.status === 'done' ? { result: job.result } : {}),
        ...(job.status === 'error' ? { error: job.error } : {}),
      })
      return
    }

    sendJson(res, 404, { error: 'Route inconnue.' })
  } catch (err) {
    console.error('Erreur serveur :', err)
    sendJson(res, 500, { error: 'Erreur interne du serveur.' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`leggendo API sur http://127.0.0.1:${PORT} (modèle ${GLM_MODEL})`)
})
