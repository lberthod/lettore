#!/usr/bin/env node
// Synchronise le contenu réservé vers Firestore, build le site, puis envoie le
// contenu de dist/ sur l'hébergement FTP Infomaniak.
// Identifiants lus depuis scripts/.env.deploy (jamais commité, voir .env.deploy.example).
//
// Les trois étapes forment un tout : depuis que le catalogue réservé a quitté
// le build (plugin `virtual:free-content`, vite.config.js), le site déployé va
// chercher ses textes dans Firestore. Uploader dist/ sans avoir synchronisé
// laisse un déploiement techniquement valide mais sans catalogue — d'où
// l'enchaînement automatique ici plutôt qu'une étape manuelle à ne pas oublier.
//
// Usage :
//   node scripts/deploy-ftp.mjs [--skip-build] [--skip-sync] [--prune]
//
//   --skip-build  réutilise le dist/ existant
//   --skip-sync   n'écrit pas dans Firestore (build/upload seuls)
//   --prune       supprime aussi les documents Firestore devenus orphelins

import { existsSync, readFileSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { Client } from 'basic-ftp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const envFile = path.join(__dirname, '.env.deploy')

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {}
  const env = {}
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

const fileEnv = loadEnvFile(envFile)
const config = {
  host: process.env.FTP_HOST || fileEnv.FTP_HOST,
  user: process.env.FTP_USER || fileEnv.FTP_USER,
  password: process.env.FTP_PASSWORD || fileEnv.FTP_PASSWORD,
  remoteDir: process.env.FTP_REMOTE_DIR || fileEnv.FTP_REMOTE_DIR || '/',
  secure: (process.env.FTP_SECURE || fileEnv.FTP_SECURE || 'true') !== 'false',
}

for (const key of ['host', 'user', 'password']) {
  if (!config[key]) {
    console.error(
      `Identifiant FTP manquant : ${key}. Renseigne-le dans scripts/.env.deploy (voir scripts/.env.deploy.example) ou en variable d'environnement FTP_${key.toUpperCase()}.`
    )
    process.exit(1)
  }
}

const skipBuild = process.argv.includes('--skip-build')
const skipSync = process.argv.includes('--skip-sync')
const prune = process.argv.includes('--prune')

// La synchronisation passe en premier : le catalogue doit être en place dans
// Firestore avant que le nouveau build ne soit servi, et un problème
// d'identifiants doit interrompre le déploiement avant le coût d'un build.
if (!skipSync) {
  // Le compte de service peut être déclaré dans scripts/.env.deploy comme les
  // identifiants FTP, plutôt que d'imposer un export dans chaque terminal.
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && fileEnv.GOOGLE_APPLICATION_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = fileEnv.GOOGLE_APPLICATION_CREDENTIALS
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "GOOGLE_APPLICATION_CREDENTIALS non défini : impossible de synchroniser le\n" +
        'contenu réservé vers Firestore. Renseigne-le dans scripts/.env.deploy ou en\n' +
        "variable d'environnement (voir scripts/README.md).\n" +
        'Pour déployer malgré tout un contenu déjà synchronisé : --skip-sync.'
    )
    process.exit(1)
  }
  console.log('→ npm run sync:content')
  execSync(`node scripts/sync-content.mjs${prune ? ' --prune' : ''}`, {
    cwd: rootDir,
    stdio: 'inherit',
  })
} else {
  console.warn('⚠ --skip-sync : le contenu réservé de Firestore n’est pas mis à jour.')
}

if (!skipBuild) {
  console.log('→ npm run build')
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' })
}

if (!existsSync(distDir)) {
  console.error(`Dossier introuvable : ${distDir}. Lance le build avant de déployer.`)
  process.exit(1)
}

const MAX_ATTEMPTS = 5
const RETRY_DELAY_MS = 500

async function withRetry(fn) {
  let lastErr
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (err.code !== 'ENOENT' || attempt === MAX_ATTEMPTS) throw err
      await sleep(RETRY_DELAY_MS)
    }
  }
  throw lastErr
}

// Remplace client.uploadFromDir : ce dernier échoue définitivement si un
// fichier disparaît momentanément (indexation Spotlight/iCloud) pendant le
// parcours de dist/, alors qu'un simple nouvel essai suffit.
async function uploadDirWithRetry(client, localDirPath) {
  const entries = await withRetry(() => readdir(localDirPath))
  for (const entry of entries) {
    const fullPath = path.join(localDirPath, entry)
    const stats = await withRetry(() => stat(fullPath))
    if (stats.isDirectory()) {
      await client.ensureDir(entry)
      await uploadDirWithRetry(client, fullPath)
      await client.cdup()
    } else if (stats.isFile()) {
      await withRetry(() => client.uploadFrom(fullPath, entry))
    }
  }
}

async function deploy() {
  const client = new Client()
  client.ftp.verbose = false
  // Le serveur annonce une adresse IPv6 injoignable pour le mode passif ;
  // on force IPv4 pour les connexions de données.
  client.ftp.ipFamily = 4
  try {
    console.log(`→ Connexion à ${config.host}...`)
    await client.access({
      host: config.host,
      user: config.user,
      password: config.password,
      secure: config.secure,
    })

    console.log(`→ Upload de dist/ vers ${config.remoteDir}`)
    await client.ensureDir(config.remoteDir)
    await client.clearWorkingDir()
    await uploadDirWithRetry(client, distDir)

    console.log('✓ Déploiement terminé.')
  } finally {
    client.close()
  }
}

deploy().catch((err) => {
  console.error('✗ Échec du déploiement FTP :', err.message)
  process.exit(1)
})
