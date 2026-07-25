import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(root, relPath), 'utf8'))
}

// Doit rester synchronisé avec src/lib/access.js (pickExamples/EXAMPLE_COUNT)
// — même limite déjà dupliquée dans scripts/prerender.mjs pour la même
// raison (access.js importe des modules navigateur qui ne tournent pas sous
// Node, donc pas utilisable directement ici).
function pickFreeTextIds(count = 6) {
  const textsIndex = readJson('src/texts/index.json')
  const byLevel = {}
  for (const t of textsIndex) (byLevel[t.level] ??= []).push(t)
  const levels = Object.keys(byLevel).sort()
  const picks = []
  let i = 0
  while (picks.length < count) {
    let added = false
    for (const lv of levels) {
      const t = byLevel[lv][i]
      if (t) {
        picks.push(t.id)
        added = true
        if (picks.length === count) break
      }
    }
    if (!added) break
    i++
  }
  return picks
}

// Doit rester synchronisé avec src/lib/access.js (FREE_CLASSICI_BOOK_IDS /
// FREE_CLASSICI_PREVIEW_BOOK_IDS).
const FREE_CLASSICI_BOOK_IDS = ['cicala-formica', 'leone-topo']
const FREE_CLASSICI_PREVIEW_BOOK_IDS = [
  'pinocchio',
  'cenerentola',
  'il-principe',
  'mattia-pascal',
]

// N'installe (précache) au premier chargement que le contenu réellement
// accessible sans abonnement payant : le reste du catalogue et de Classici
// est chargé à la demande et mis en cache après un accès autorisé (voir
// runtimeCaching ci-dessous) — évite de télécharger tout le catalogue payant
// dès l'installation de la PWA (correctauditgpt.md, Sprint 9.2).
function lockedContentIgnorePatterns() {
  const freeTextIds = new Set(pickFreeTextIds())
  const textsIndex = readJson('src/texts/index.json')
  const booksIndex = readJson('src/books/index.json')
  const patterns = []
  for (const t of textsIndex) {
    if (!freeTextIds.has(t.id)) patterns.push(`assets/${t.id}-*.js`)
  }
  for (const book of booksIndex) {
    if (FREE_CLASSICI_BOOK_IDS.includes(book.id)) continue
    const skipFirstChapter = FREE_CLASSICI_PREVIEW_BOOK_IDS.includes(book.id)
    for (let n = 1; n <= book.chapterCount; n++) {
      if (skipFirstChapter && n === 1) continue
      patterns.push(`assets/${book.id}-${String(n).padStart(2, '0')}-*.js`)
    }
  }
  return patterns
}

export default defineConfig({
  plugins: [
    vue(),
    // Mode hors-ligne : l'app et les textes/chapitres accessibles sont mis
    // en cache localement (précache pour l'aperçu gratuit, cache à la
    // demande pour le reste — voir lockedContentIgnorePatterns ci-dessus).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Leggendo',
        short_name: 'Leggendo',
        description:
          'Lecture de textes en italien avec traduction des mots et des phrases.',
        lang: 'fr',
        display: 'standalone',
        theme_color: '#faf6f0',
        background_color: '#faf6f0',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        globIgnores: lockedContentIgnorePatterns(),
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Textes/chapitres non précachés : mis en cache dès leur premier
            // accès autorisé (le serveur/les règles Firestore restent la
            // vraie barrière, ceci ne fait que compléter l'offline).
            urlPattern: /\/assets\/.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'leggendo-content',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: Number(process.env.PORT) || 5173,
  },
})
