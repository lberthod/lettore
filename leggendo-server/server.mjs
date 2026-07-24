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
const themeById = new Map(taxonomy.themes.map((t) => [t.id, t]))
const genreById = new Map(taxonomy.genres.map((g) => [g.id, g]))
const sizeById = new Map(taxonomy.sizes.map((s) => [s.id, s]))

// Décode les custom claims (role, premium) embarqués dans le payload du JWT.
// La signature du token a déjà été vérifiée par l'appel à accounts:lookup
// ci-dessous ; on ne fait que relire les claims qu'il contient.
function decodeClaims(idToken) {
  try {
    const payload = idToken.split('.')[1]
    const json = Buffer.from(payload, 'base64url').toString('utf8')
    const claims = JSON.parse(json)
    return {
      role: claims.role || (claims.premium ? 'premium' : 'gratuit'),
      premium: Boolean(claims.premium),
    }
  } catch {
    return { role: 'gratuit', premium: false }
  }
}

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
  if (!user) return null
  const { role, premium } = decodeClaims(idToken)
  return { uid: user.localId, email: user.email, role, premium }
}

// --- Quotas de génération (persistés sur disque : survivent aux redémarrages) ---
// Gratuit  : 3 générations « de bienvenue » (cumulées, tous les jours confondus),
//            puis 1 génération par jour une fois ce capital épuisé.
// Payant / enseignant : 10 générations par jour, 100 par mois.
const QUOTA_FILE = path.join(HERE, 'quotas.json')
const FREE_STARTER_CREDITS = 3
const FREE_DAILY_LIMIT = 1
const PAID_DAILY_LIMIT = 10
const PAID_MONTHLY_LIMIT = 100

let quotas = {}
try {
  quotas = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8'))
} catch {
  quotas = {}
}

let saveQuotasPending = false
function saveQuotas() {
  if (saveQuotasPending) return
  saveQuotasPending = true
  setImmediate(() => {
    saveQuotasPending = false
    fs.writeFile(QUOTA_FILE, JSON.stringify(quotas), () => {})
  })
}

function todayKey() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}
function monthKey() {
  return new Date().toISOString().slice(0, 7) // YYYY-MM
}

function getQuota(uid) {
  let q = quotas[uid]
  if (!q) {
    q = { totalCount: 0, dailyCount: 0, dailyDate: todayKey(), monthlyCount: 0, monthlyMonth: monthKey() }
    quotas[uid] = q
  }
  if (q.dailyDate !== todayKey()) {
    q.dailyDate = todayKey()
    q.dailyCount = 0
  }
  if (q.monthlyMonth !== monthKey()) {
    q.monthlyMonth = monthKey()
    q.monthlyCount = 0
  }
  return q
}

// Vérifie le quota de l'utilisateur sans le consommer (pour messages d'erreur
// clairs) ; l'incrémentation n'a lieu que si la génération est bien lancée.
function checkQuota(user) {
  const isPaid = user.role === 'premium' || user.role === 'enseignant' || user.premium
  const q = getQuota(user.uid)

  if (isPaid) {
    if (q.monthlyCount >= PAID_MONTHLY_LIMIT) {
      return { ok: false, error: `Quota mensuel atteint (${PAID_MONTHLY_LIMIT} générations/mois).` }
    }
    if (q.dailyCount >= PAID_DAILY_LIMIT) {
      return { ok: false, error: `Quota journalier atteint (${PAID_DAILY_LIMIT} générations/jour).` }
    }
    return { ok: true }
  }

  if (q.totalCount < FREE_STARTER_CREDITS) return { ok: true }
  if (q.dailyCount < FREE_DAILY_LIMIT) return { ok: true }
  return {
    ok: false,
    error: 'Quota gratuit atteint pour aujourd’hui (1 génération/jour), revenez demain ou passez en compte payant.',
  }
}

function consumeQuota(user) {
  const q = getQuota(user.uid)
  q.totalCount += 1
  q.dailyCount += 1
  q.monthlyCount += 1
  saveQuotas()
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
function sendJson(res, status, body, origin) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin || ALLOWED_ORIGINS[0],
    Vary: 'Origin',
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
    })
    res.end()
    return
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  try {
    if (req.method === 'GET' && url.pathname === '/leggendo/health') {
      send(200, { ok: true, model: GLM_MODEL, jobs: jobs.size })
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
      const { errors, theme, genre, size, level, title, summary } = parseRequest(body)
      if (errors.length) {
        send(400, { error: errors.join(' ; ') })
        return
      }
      if (activeJobFor(user.uid)) {
        send(429, {
          error: 'Une génération est déjà en cours pour votre compte, patientez.',
        })
        return
      }
      const quota = checkQuota(user)
      if (!quota.ok) {
        send(429, { error: quota.error })
        return
      }
      consumeQuota(user)

      const jobId = crypto.randomUUID()
      const job = { uid: user.uid, status: 'pending', createdAt: Date.now(), title }
      jobs.set(jobId, job)
      const q = getQuota(user.uid)
      console.log(
        `[job ${jobId}] ${user.email || user.uid} (${user.role}) — ${theme.id}/${genre.id} ${level} ${size.id} « ${title} » — quota jour ${q.dailyCount}, mois ${q.monthlyCount}, total ${q.totalCount}`
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

      send(202, { jobId })
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
      const active = activeJobFor(user.uid)
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
      const job = jobs.get(jobMatch[1])
      if (!job || job.uid !== user.uid) {
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
