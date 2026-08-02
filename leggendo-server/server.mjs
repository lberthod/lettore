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
import { getAppCheck } from 'firebase-admin/app-check'
import { generateUserText } from './generate.mjs'
import { correctUserText } from './correct.mjs'
import {
  scenarioById,
  openDialogue,
  dialogueTurn,
  dialogueFeedback,
} from './dialogue.mjs'
import { LEVELS } from './schema.mjs'
import { GLM_MODEL } from './llm.mjs'
import {
  QuotaExceededError,
  creditCost,
  CORRECTION_COST,
  DIALOGUE_COST,
  MAX_DIALOGUE_TURNS,
} from './quota.mjs'
import { createJobStore, ActiveJobError } from './jobs.mjs'
import {
  buildTaxonomyIndex,
  parseRequest,
  parseCorrectionRequest,
  parseDialogueRequest,
  parseDialogueTurnRequest,
  slugify,
} from './validate.mjs'
import { createAppCheckGuard } from './appcheck.mjs'
import { clientIp, createIpLimiter, createRateWindow } from './ratelimit.mjs'

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
  'https://leggendo.fr,https://leggendo-dbb84.web.app,https://leggendo-dbb84.firebaseapp.com,http://localhost:5173'
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
// premium, periodEnd — posés côté Cloud Functions, voir functions/index.js)
// en un seul appel local, sans round-trip vers identitytoolkit.
async function verifyIdToken(idToken) {
  try {
    const decoded = await auth.verifyIdToken(idToken)
    return {
      uid: decoded.uid,
      email: decoded.email,
      // Adresse confirmée par un clic sur le lien envoyé à l'inscription
      // (toujours vrai pour une connexion Google). Conditionne l'essai
      // gratuit, voir quota.mjs.
      emailVerified: decoded.email_verified === true,
      role: decoded.role || (decoded.premium ? 'premium' : 'gratuit'),
      premium: Boolean(decoded.premium),
      // Fin de la période d'abonnement Stripe en cours (secondes epoch) —
      // ancre le renouvellement des crédits sur la vraie date de
      // renouvellement plutôt que sur le mois civil, voir quota.mjs.
      periodEnd: decoded.periodEnd || null,
    }
  } catch {
    return null
  }
}

// --- Attestation App Check (appcheck.mjs) ---
// Prouve que la requête vient bien de notre application web, pas d'un script
// muni d'un compte valide. Désactivée par défaut : tant que la clé reCAPTCHA
// n'est pas créée en console Firebase, l'app n'envoie aucun jeton et
// l'enforcement bloquerait tout le trafic légitime. Séquence recommandée :
// `soft` (observation dans les logs) puis `enforce`.
const appCheckGuard = createAppCheckGuard({
  mode: process.env.APP_CHECK_MODE || 'off',
  verifyToken: (token) => getAppCheck().verifyToken(token),
})

// --- Limite complémentaire par IP (ratelimit.mjs) ---
// Le quota est par compte, et un compte gratuit se crée en quelques
// secondes : sans plafond par origine réseau, une boucle
// inscription → essai → inscription consomme le fournisseur LLM sans limite.
// `TRUST_PROXY=0` si le serveur n'est plus derrière Caddy (sinon un client
// pourrait choisir son IP via X-Forwarded-For).
const TRUST_PROXY = process.env.TRUST_PROXY !== '0'
const ipLimiter = createIpLimiter({
  windowMs: Number(process.env.IP_WINDOW_MS) || undefined,
  maxTrialAccounts: Number(process.env.MAX_TRIAL_ACCOUNTS_PER_IP) || undefined,
  maxGenerations: Number(process.env.MAX_GENERATIONS_PER_IP) || undefined,
})
setInterval(() => ipLimiter.sweep(), 10 * 60 * 1000).unref()

// --- Alerte « activité anormale » ---
// Ne refuse rien : signale dans les logs du service une rafale d'essais
// gratuits (le motif d'une ferme à comptes) pour qu'elle soit vue avant que
// la facture ne la révèle. À surveiller via `journalctl -u leggendo-api`.
const TRIAL_ALERT_PER_HOUR = Number(process.env.TRIAL_ALERT_PER_HOUR || 20)
const trialRate = createRateWindow({ windowMs: 60 * 60 * 1000 })

function watchTrialRate(user, ip) {
  if (user.role !== 'gratuit') return
  const count = trialRate.hit()
  if (count >= TRIAL_ALERT_PER_HOUR && count % TRIAL_ALERT_PER_HOUR === 0) {
    console.warn(
      `⚠ ALERTE ABUS : ${count} générations d'essai gratuites dans la dernière heure (seuil ${TRIAL_ALERT_PER_HOUR}) — dernière depuis ${ip}, compte ${user.email || user.uid}`
    )
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

// Journalise tout appel IA (génération comme correction) dans
// `generationLogs`, distingués par `kind` — même collection pour garder une
// vue unique des coûts. `id` = jobId (génération) ou correctionId.
async function logAiCall({
  user,
  kind,
  id,
  level = null,
  sizeId = null,
  creditsCost,
  status,
  startedAt,
  usage,
  error,
}) {
  const totalTokens = usage.reduce((sum, u) => sum + (u.total_tokens || 0), 0)
  const entry = {
    kind,
    uid: user.uid,
    email: user.email || null,
    role: user.role,
    level,
    sizeId,
    creditsCost,
    jobId: id,
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
    console.error(`[${kind} ${id}] échec de journalisation du coût :`, err)
  }
  // Alerte simple (README_TARIFICATION.md) : le coût IA ne doit pas dépasser
  // 25 % du revenu Premium IA — seuil grossier faute d'agrégation en temps
  // réel, mais suffisant pour repérer un appel anormalement coûteux.
  if (entry.estimatedCostUsd > 0.5) {
    console.warn(
      `[${kind} ${id}] ⚠ coût estimé élevé : $${entry.estimatedCostUsd} (${totalTokens} tokens, ${usage.length} appel(s))`
    )
  }
}

function logGeneration({ user, size, level, jobId, status, startedAt, usage, error }) {
  return logAiCall({
    user,
    kind: 'generation',
    id: jobId,
    level,
    sizeId: size.id,
    creditsCost: creditCost(size.id),
    status,
    startedAt,
    usage,
    error,
  })
}

// --- Correction synchrone (Phase 5) ---
// Une correction est bien plus courte qu'une génération : la réponse est
// renvoyée directement (pas de job à sonder). Ce délai borne uniquement la
// réponse HTTP — callLLM garde ses propres timeout/retries ; au-delà, le
// crédit est remboursé et le résultat éventuel du LLM est jeté (jamais livré).
const CORRECT_TIMEOUT_MS = Number(process.env.CORRECT_TIMEOUT_MS || 90 * 1000)

// --- Dialogue simulé (Phase 7), synchrone lui aussi ---
// Un tour de dialogue est une réponse courte (2-3 phrases) ; le bilan de
// clôture est à peine plus long qu'une correction. Même sémantique que
// CORRECT_TIMEOUT_MS : borne la réponse HTTP, au-delà le résultat éventuel
// du LLM est jeté.
const DIALOGUE_TIMEOUT_MS = Number(process.env.DIALOGUE_TIMEOUT_MS || 90 * 1000)

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // Le travail continue en arrière-plan : on neutralise juste son rejet
      // éventuel (sinon unhandledRejection) — son résultat ne sera pas livré.
      promise.catch(() => {})
      reject(new Error(message))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
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

// Contrôle d'accès commun à toutes les routes authentifiées : identité
// (ID token Firebase) *et* provenance (App Check). Renvoie `{ user }` ou
// `{ error: { status, message } }`, jamais les deux.
async function authenticate(req, route) {
  const header = req.headers.authorization || ''
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!idToken) {
    return { error: { status: 401, message: 'Connexion requise.' } }
  }
  const user = await verifyIdToken(idToken)
  if (!user) {
    return { error: { status: 401, message: 'Session invalide ou expirée, reconnectez-vous.' } }
  }
  const appCheckError = await appCheckGuard(req.headers['x-firebase-appcheck'], route)
  if (appCheckError) {
    return { error: { status: 401, message: appCheckError } }
  }
  return { user }
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Firebase-AppCheck',
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
      const { user, error: authError } = await authenticate(req, 'generate')
      if (authError) {
        send(authError.status, { error: authError.message })
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
      // Plafond par origine réseau, en plus du quota par compte : c'est lui
      // qui borne une boucle inscription → essai → inscription (voir
      // ratelimit.mjs). Vérifié avant la réservation, enregistré seulement
      // si celle-ci réussit — une demande refusée n'a rien coûté en IA.
      const ip = clientIp(req, { trustProxy: TRUST_PROXY })
      const isTrial = user.role === 'gratuit'
      const ipError = ipLimiter.check(ip, { uid: user.uid, trial: isTrial })
      if (ipError) {
        console.warn(
          `⚠ ALERTE ABUS : limite par IP atteinte pour ${ip} — ${user.email || user.uid} (${user.role}) : ${ipError}`
        )
        send(429, { error: ipError })
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
      ipLimiter.record(ip, { uid: user.uid, trial: isTrial })
      watchTrialRate(user, ip)
      console.log(
        `[job ${jobId}] ${user.email || user.uid} (${user.role}) — ${theme.id}/${genre.id} ${level} ${size.id} « ${title} » — crédits ${JSON.stringify(q)}`
      )
      const startedAt = Date.now()

      // Génération en tâche de fond ; le client sonde /leggendo/jobs/<id>.
      // Toutes les écritures de statut passent par jobStore : elles ne
      // s'appliquent que si le job est encore actif. Une génération qui
      // dépasse JOB_STUCK_MS (un appel GLM peut durer 8 min et être retenté,
      // voir llm.mjs) est clôturée et remboursée entre-temps par /my-job ou
      // par la demande suivante — elle ne doit alors ni écraser ce statut ni
      // livrer son résultat, qui serait offert.
      ;(async () => {
        if (!(await jobStore.markRunning(jobId))) {
          console.warn(`[job ${jobId}] déjà clôturé avant le démarrage — génération abandonnée`)
          return
        }
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
          if (await jobStore.finishJob(jobId, textData)) {
            console.log(`[job ${jobId}] terminé (${textData.wordCount} mots)`)
            await logGeneration({ user, size, level, jobId, status: 'done', startedAt, usage })
          } else {
            // Le crédit a déjà été rendu : le résultat est jeté plutôt que
            // livré gratuitement. Les tokens ont bien été consommés, donc la
            // génération reste journalisée (suivi des coûts).
            console.warn(`[job ${jobId}] clôturé entre-temps (délai dépassé) — résultat abandonné`)
            await logGeneration({
              user,
              size,
              level,
              jobId,
              status: 'discarded',
              startedAt,
              usage,
              error: 'Job clôturé et remboursé avant la fin de la génération.',
            })
          }
        } catch (err) {
          // Une génération qui échoue pour une raison technique ne consomme
          // pas de crédit (README_TARIFICATION.md) : failJob clôture le job
          // et rembourse dans la même transaction, sans jamais rembourser
          // deux fois si le job avait déjà été clôturé.
          await jobStore.failJob(jobId, err.message).catch((e) =>
            console.error(`[job ${jobId}] échec de la clôture/du remboursement :`, e)
          )
          console.error(`[job ${jobId}] échec : ${err.message}`)
          await logGeneration({ user, size, level, jobId, status: 'error', startedAt, usage, error: err.message })
        }
      })()

      send(202, { jobId })
      return
    }

    // Correction pédagogique d'une production écrite (Phase 5) — mêmes
    // garde-fous que /generate (auth + App Check + rate-limit IP + CORS),
    // mais synchrone : la réponse contient directement la correction.
    if (req.method === 'POST' && url.pathname === '/leggendo/correct') {
      const { user, error: authError } = await authenticate(req, 'correct')
      if (authError) {
        send(authError.status, { error: authError.message })
        return
      }

      let body
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        send(400, { error: 'JSON invalide.' })
        return
      }
      const { errors, text, goal } = parseCorrectionRequest(body)
      if (errors.length) {
        send(400, { error: errors.join(' ; ') })
        return
      }

      // Même plafond IP que la génération (compteur commun : ce qui compte,
      // c'est le nombre d'appels IA déclenchés depuis une origine réseau).
      // trial: false — la correction est réservée aux rôles à crédits, le
      // quota de sièges d'essai par IP ne la concerne pas.
      const ip = clientIp(req, { trustProxy: TRUST_PROXY })
      const ipError = ipLimiter.check(ip, { uid: user.uid, trial: false })
      if (ipError) {
        console.warn(
          `⚠ ALERTE ABUS : limite par IP atteinte pour ${ip} — ${user.email || user.uid} (${user.role}) : ${ipError} (correction)`
        )
        send(429, { error: ipError })
        return
      }

      const correctionId = crypto.randomUUID()
      const correctionRef = jobStore.correctionsCollection.doc(correctionId)
      try {
        await jobStore.reserveCorrection(user, correctionRef)
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          send(429, { error: err.message })
          return
        }
        throw err
      }
      ipLimiter.record(ip, { uid: user.uid, trial: false })
      console.log(
        `[correction ${correctionId}] ${user.email || user.uid} (${user.role}) — ${text.length} caractères`
      )
      const startedAt = Date.now()
      const usage = []
      const logCorrection = (status, error) =>
        logAiCall({
          user,
          kind: 'correction',
          id: correctionId,
          creditsCost: CORRECTION_COST,
          status,
          startedAt,
          usage,
          error,
        })

      let result
      try {
        result = await withTimeout(
          correctUserText({ text, goal, usage }),
          CORRECT_TIMEOUT_MS,
          'Correction interrompue (délai maximal dépassé).'
        )
      } catch (err) {
        // Échec technique ou timeout : le crédit est rendu (failCorrection,
        // clôture + remboursement dans la même transaction, jamais rejoués).
        await jobStore
          .failCorrection(correctionId, err.message)
          .catch((e) => console.error(`[correction ${correctionId}] échec du remboursement :`, e))
        console.error(`[correction ${correctionId}] échec : ${err.message}`)
        await logCorrection('error', err.message)
        send(502, {
          error: 'La correction a échoué, votre crédit n’a pas été consommé. Réessayez dans un instant.',
        })
        return
      }

      if (await jobStore.finishCorrection(correctionId)) {
        console.log(
          `[correction ${correctionId}] terminée (${result.errors.length} erreur(s), niveau estimé ${result.level_estimate})`
        )
        await logCorrection('done')
        send(200, result)
        return
      }
      // Clôturée entre-temps (crédit déjà rendu) : ne pas livrer gratuitement.
      console.warn(`[correction ${correctionId}] clôturée entre-temps — résultat abandonné`)
      await logCorrection('discarded', 'Correction clôturée et remboursée avant la fin.')
      send(502, {
        error: 'La correction a expiré, votre crédit n’a pas été consommé. Réessayez.',
      })
      return
    }

    // --- Dialogue simulé (Phase 7) ---
    // Ouverture de session : réserve 2 crédits (tarification à la session,
    // voir quota.mjs), crée dialogueSessions/{id} et renvoie directement la
    // première réplique du personnage. Mêmes garde-fous que /correct (auth +
    // App Check + rate-limit IP + CORS + timeout), synchrone (réponse courte).
    if (req.method === 'POST' && url.pathname === '/leggendo/dialogue') {
      const { user, error: authError } = await authenticate(req, 'dialogue')
      if (authError) {
        send(authError.status, { error: authError.message })
        return
      }

      let body
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        send(400, { error: 'JSON invalide.' })
        return
      }
      const { errors, scenario: scenarioId, level } = parseDialogueRequest(body, scenarioById)
      if (errors.length) {
        send(400, { error: errors.join(' ; ') })
        return
      }
      const scenario = scenarioById.get(scenarioId)

      // Même plafond IP que la génération/correction, compté à l'OUVERTURE
      // de session seulement (les tours suivants sont bornés par
      // MAX_DIALOGUE_TURNS, pas par le compteur IP). trial: false — le
      // dialogue est réservé aux rôles à crédits.
      const ip = clientIp(req, { trustProxy: TRUST_PROXY })
      const ipError = ipLimiter.check(ip, { uid: user.uid, trial: false })
      if (ipError) {
        console.warn(
          `⚠ ALERTE ABUS : limite par IP atteinte pour ${ip} — ${user.email || user.uid} (${user.role}) : ${ipError} (dialogue)`
        )
        send(429, { error: ipError })
        return
      }

      const sessionId = crypto.randomUUID()
      const sessionRef = jobStore.dialogueSessionsCollection.doc(sessionId)
      try {
        await jobStore.reserveDialogue(user, sessionRef, { scenario: scenarioId, level })
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          send(429, { error: err.message })
          return
        }
        throw err
      }
      ipLimiter.record(ip, { uid: user.uid, trial: false })
      console.log(
        `[dialogue ${sessionId}] ${user.email || user.uid} (${user.role}) — ouverture ${scenarioId} ${level}`
      )
      const startedAt = Date.now()
      const usage = []
      const logOpen = (status, error) =>
        logAiCall({
          user,
          kind: 'dialogue',
          id: sessionId,
          level,
          creditsCost: DIALOGUE_COST,
          status,
          startedAt,
          usage,
          error,
        })

      let out
      try {
        out = await withTimeout(
          openDialogue({ scenario, level, usage }),
          DIALOGUE_TIMEOUT_MS,
          'Ouverture du dialogue interrompue (délai maximal dépassé).'
        )
      } catch (err) {
        // Échec avant le premier échange complet : les 2 crédits sont rendus
        // (failDialogue, remboursement idempotent — voir jobs.mjs).
        await jobStore
          .failDialogue(sessionId, err.message)
          .catch((e) => console.error(`[dialogue ${sessionId}] échec du remboursement :`, e))
        console.error(`[dialogue ${sessionId}] échec à l'ouverture : ${err.message}`)
        await logOpen('error', err.message)
        send(502, {
          error: 'Le dialogue n’a pas pu démarrer, vos crédits n’ont pas été consommés. Réessayez dans un instant.',
        })
        return
      }

      const turns = await jobStore.appendDialogueTurns(
        sessionId,
        [{ role: 'assistant', text: out.reply }],
        { suggested_replies: out.suggested_replies }
      )
      if (!turns) {
        // Session clôturée entre-temps (cas limite) : crédit déjà rendu ou
        // session expirée — ne pas livrer la réplique.
        console.warn(`[dialogue ${sessionId}] clôturé avant la première réplique — abandonné`)
        await logOpen('discarded', 'Session clôturée avant la première réplique.')
        send(502, { error: 'La session a expiré, réessayez.' })
        return
      }
      await logOpen('done')
      send(200, {
        sessionId,
        reply: out.reply,
        suggested_replies: out.suggested_replies,
        turnsLeft: MAX_DIALOGUE_TURNS,
      })
      return
    }

    const dialogueTurnMatch = url.pathname.match(/^\/leggendo\/dialogue\/([a-f0-9-]{36})\/turn$/)
    if (req.method === 'POST' && dialogueTurnMatch) {
      const { user, error: authError } = await authenticate(req, 'dialogue-turn')
      if (authError) {
        send(authError.status, { error: authError.message })
        return
      }
      let body
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        send(400, { error: 'JSON invalide.' })
        return
      }
      const { errors, text } = parseDialogueTurnRequest(body)
      if (errors.length) {
        send(400, { error: errors.join(' ; ') })
        return
      }
      const sessionId = dialogueTurnMatch[1]
      // La session n'est remise qu'à son propriétaire (dialogueFor) — sinon
      // comme si elle n'existait pas.
      const session = await jobStore.dialogueFor(user.uid, sessionId)
      if (!session) {
        send(404, { error: 'Session inconnue ou expirée.' })
        return
      }
      if (session.status !== 'active') {
        send(409, { error: 'Cette session est terminée — ouvrez un nouveau dialogue.' })
        return
      }
      const userTurns = (session.turns || []).filter((t) => t.role === 'user').length
      if (userTurns >= MAX_DIALOGUE_TURNS) {
        // Plafond côté serveur : les 2 crédits de la session ne peuvent pas
        // déclencher plus de MAX_DIALOGUE_TURNS tours LLM.
        send(409, {
          error: 'Nombre maximal de tours atteint — terminez la session pour voir le bilan.',
          limitReached: true,
        })
        return
      }

      const scenario = scenarioById.get(session.scenario)
      if (!scenario) {
        send(409, { error: 'Scénario retiré — ouvrez un nouveau dialogue.' })
        return
      }
      const startedAt = Date.now()
      const usage = []
      const logTurn = (status, error) =>
        logAiCall({
          user,
          kind: 'dialogue',
          id: sessionId,
          level: session.level,
          creditsCost: 0, // la session a déjà été débitée à l'ouverture
          status,
          startedAt,
          usage,
          error,
        })

      let out
      try {
        out = await withTimeout(
          dialogueTurn({ scenario, level: session.level, turns: session.turns || [], userText: text, usage }),
          DIALOGUE_TIMEOUT_MS,
          'Tour de dialogue interrompu (délai maximal dépassé).'
        )
      } catch (err) {
        // Échec d'un tour en cours de session : la session reste active (pas
        // de remboursement — l'ouverture a déjà été livrée), l'élève retente.
        console.error(`[dialogue ${sessionId}] échec du tour : ${err.message}`)
        await logTurn('error', err.message)
        send(502, { error: 'La réponse a échoué, réessayez — votre session reste ouverte.' })
        return
      }

      // Dernier tour autorisé : le personnage conclut, quoi qu'il en pense.
      const done = out.done || userTurns + 1 >= MAX_DIALOGUE_TURNS
      const turns = await jobStore.appendDialogueTurns(
        sessionId,
        [
          { role: 'user', text },
          { role: 'assistant', text: out.reply },
        ],
        { suggested_replies: out.suggested_replies }
      )
      if (!turns) {
        console.warn(`[dialogue ${sessionId}] clôturé pendant le tour — réplique abandonnée`)
        await logTurn('discarded', 'Session clôturée pendant le tour.')
        send(409, { error: 'Cette session est terminée — ouvrez un nouveau dialogue.' })
        return
      }
      await logTurn('done')
      send(200, {
        reply: out.reply,
        suggested_replies: out.suggested_replies,
        done,
        turnsLeft: Math.max(0, MAX_DIALOGUE_TURNS - (userTurns + 1)),
      })
      return
    }

    // Clôture : un DERNIER appel LLM produit le bilan (corrections légères
    // des répliques de l'élève, en français), puis la session passe en
    // `closed`. Idempotent : re-clore une session déjà close renvoie le
    // bilan enregistré (utile après un rechargement au mauvais moment).
    const dialogueCloseMatch = url.pathname.match(/^\/leggendo\/dialogue\/([a-f0-9-]{36})\/close$/)
    if (req.method === 'POST' && dialogueCloseMatch) {
      const { user, error: authError } = await authenticate(req, 'dialogue-close')
      if (authError) {
        send(authError.status, { error: authError.message })
        return
      }
      const sessionId = dialogueCloseMatch[1]
      const session = await jobStore.dialogueFor(user.uid, sessionId)
      if (!session) {
        send(404, { error: 'Session inconnue ou expirée.' })
        return
      }
      if (session.status === 'closed') {
        send(200, { feedback: session.feedback || [] })
        return
      }
      if (session.status !== 'active') {
        send(409, { error: 'Cette session a échoué — ouvrez un nouveau dialogue.' })
        return
      }
      const turns = session.turns || []
      if (!turns.some((t) => t.role === 'user')) {
        // Rien à évaluer : clôture sans appel LLM, bilan vide.
        await jobStore.closeDialogue(sessionId, [])
        send(200, { feedback: [] })
        return
      }

      const scenario = scenarioById.get(session.scenario)
      const startedAt = Date.now()
      const usage = []
      const logClose = (status, error) =>
        logAiCall({
          user,
          kind: 'dialogue',
          id: sessionId,
          level: session.level,
          creditsCost: 0,
          status,
          startedAt,
          usage,
          error,
        })

      let out
      try {
        out = await withTimeout(
          dialogueFeedback({ scenario, level: session.level, turns, usage }),
          DIALOGUE_TIMEOUT_MS,
          'Bilan du dialogue interrompu (délai maximal dépassé).'
        )
      } catch (err) {
        // La session reste active : l'élève peut redemander le bilan (pas de
        // remboursement — les tours joués ont été livrés).
        console.error(`[dialogue ${sessionId}] échec du bilan : ${err.message}`)
        await logClose('error', err.message)
        send(502, { error: 'Le bilan a échoué, réessayez — votre session reste ouverte.' })
        return
      }
      await jobStore.closeDialogue(sessionId, out.feedback)
      console.log(
        `[dialogue ${sessionId}] clos (${turns.length} tours, ${out.feedback.length} point(s) de bilan)`
      )
      await logClose('done')
      send(200, { feedback: out.feedback })
      return
    }

    // Reprise après rechargement : historique complet + dernières
    // suggestions + bilan éventuel. Propriétaire uniquement (dialogueFor).
    const dialogueGetMatch = url.pathname.match(/^\/leggendo\/dialogue\/([a-f0-9-]{36})$/)
    if (req.method === 'GET' && dialogueGetMatch) {
      const { user, error: authError } = await authenticate(req, 'dialogue-get')
      if (authError) {
        send(authError.status, { error: authError.message })
        return
      }
      const session = await jobStore.dialogueFor(user.uid, dialogueGetMatch[1])
      if (!session) {
        send(404, { error: 'Session inconnue ou expirée.' })
        return
      }
      const userTurns = (session.turns || []).filter((t) => t.role === 'user').length
      send(200, {
        sessionId: dialogueGetMatch[1],
        scenario: session.scenario,
        level: session.level,
        status: session.status,
        turns: session.turns || [],
        suggested_replies: session.suggested_replies || [],
        feedback: session.feedback ?? null,
        turnsLeft: Math.max(0, MAX_DIALOGUE_TURNS - userTurns),
      })
      return
    }

    // Solde de crédits de génération, à afficher avant de lancer une
    // génération (README_TARIFICATION.md, § Règles des crédits).
    if (req.method === 'GET' && url.pathname === '/leggendo/quota') {
      const { user, error: authError } = await authenticate(req, 'quota')
      if (authError) {
        send(authError.status, { error: authError.message })
        return
      }
      send(200, await jobStore.getQuotaStatus(user))
      return
    }

    // Job actif de l'utilisateur : permet au client de se rattacher à une
    // génération en cours quand il a perdu le jobId (rechargement, autre
    // appareil) au lieu de rester bloqué sur « déjà en cours, patientez ».
    if (req.method === 'GET' && url.pathname === '/leggendo/my-job') {
      const { user, error: authError } = await authenticate(req, 'my-job')
      if (authError) {
        send(authError.status, { error: authError.message })
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
      const { user, error: authError } = await authenticate(req, 'jobs')
      if (authError) {
        send(authError.status, { error: authError.message })
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
