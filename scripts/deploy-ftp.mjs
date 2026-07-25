#!/usr/bin/env node
// Build le site puis envoie le contenu de dist/ sur l'hébergement FTP Infomaniak.
// Identifiants lus depuis scripts/.env.deploy (jamais commité, voir .env.deploy.example).

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
