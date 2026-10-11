import path from 'node:path'
import { rmSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { freeContentIds, loadTextsIndex, ROOT } from './scripts/lib/free-content.mjs'
import { EXAMPLE_COUNT, pickExampleTexts } from './src/lib/catalogAccess.js'

// Le contenu réservé ne doit PAS exister dans dist/ : un chunk public reste
// téléchargeable par qui en connaît l'URL, quels que soient les gardes de
// route côté client. On ne peut donc pas se contenter d'un
// `import.meta.glob('../texts/*.json')` (qui embarque tout le catalogue) —
// ce module virtuel génère des `import()` explicites pour le seul aperçu
// gratuit, et rien d'autre n'entre dans le graphe de modules. Le reste du
// catalogue est servi depuis Firestore après vérification du rôle
// (voir src/lib/protectedContent.js et firestore.rules).
const VIRTUAL_ID = 'virtual:free-content'

// Exporté pour que vitest (vitest.config.js) résolve lui aussi
// `virtual:free-content`, importé par src/lib/protectedContent.js.
export function freeContentPlugin() {
  const resolvedId = `\0${VIRTUAL_ID}`
  return {
    name: 'leggendo-free-content',
    resolveId(id) {
      if (id === VIRTUAL_ID) return resolvedId
    },
    load(id) {
      if (id !== resolvedId) return
      const { texts, chapters } = freeContentIds()
      // `.then((m) => m.default)` : le contenu du JSON, pas le namespace du
      // module — même forme que l'ancien glob `{ import: 'default' }`.
      const entry = (key, importPath) =>
        `  ${JSON.stringify(key)}: () => import(${JSON.stringify(importPath)}).then((m) => m.default),`
      return [
        '// Généré par le plugin leggendo-free-content (vite.config.js).',
        'export const freeTexts = {',
        ...texts.map((id) => entry(id, `/src/texts/${id}.json`)),
        '}',
        'export const freeChapters = {',
        ...chapters.map(({ bookId, chapterId }) =>
          entry(
            `${bookId}__${chapterId}`,
            `/src/books/${bookId}/${bookId}-${chapterId}.json`
          )
        ),
        '}',
      ].join('\n')
    },
  }
}

// src/texts/index.json pèse 127 kB : le catalogue complet, résumé compris.
// Il était importé statiquement par le routeur, par access.js et par l'accueil,
// donc embarqué dans le bundle d'entrée — alors qu'aucun de ces trois modules
// n'a besoin du catalogue entier (le routeur veut des identifiants, l'accueil
// des totaux, access.js les six textes de l'aperçu).
//
// Ce module virtuel expose ces trois extraits sous forme de littéraux séparés :
// Rollup ne retient dans le bundle d'entrée que ceux réellement utilisés, et
// l'index complet reste réservé aux vues chargées à la demande (bibliothèque,
// lecteur, administration) qui l'importent normalement.
const CATALOG_ID = 'virtual:catalog'
const TEXTS_INDEX_FILE = path.join(ROOT, 'src/texts/index.json')

// Exporté pour vitest (vitest.config.js) : src/lib/access.js en dépend.
export function catalogPlugin() {
  const resolvedId = `\0${CATALOG_ID}`
  return {
    name: 'leggendo-catalog',
    resolveId(id) {
      if (id === CATALOG_ID) return resolvedId
    },
    load(id) {
      if (id !== resolvedId) return
      const texts = loadTextsIndex()
      const levels = [...new Set(texts.map((t) => t.level))].sort()
      const wordCounts = texts.map((t) => t.wordCount || 0)
      const stats = {
        count: texts.length,
        levels,
        levelRange: `${levels[0]} → ${levels[levels.length - 1]}`,
        categoryCount: new Set(texts.map((t) => t.category)).size,
        totalWords: wordCounts.reduce((sum, n) => sum + n, 0),
        minWords: Math.min(...wordCounts),
        maxWords: Math.max(...wordCounts),
      }
      const json = (value) => JSON.stringify(value)
      return [
        '// Généré par le plugin leggendo-catalog (vite.config.js).',
        `export const catalogIds = ${json(texts.map((t) => t.id))}`,
        `export const catalogStats = ${json(stats)}`,
        `export const exampleTexts = ${json(pickExampleTexts(texts, EXAMPLE_COUNT))}`,
      ].join('\n')
    },
    // Le module virtuel est dérivé d'un fichier que les scripts de génération
    // réécrivent : sans cela, un texte publié n'apparaîtrait qu'au prochain
    // redémarrage du serveur de développement.
    handleHotUpdate({ file, server }) {
      if (file !== TEXTS_INDEX_FILE) return
      const mod = server.moduleGraph.getModuleById(resolvedId)
      if (mod) server.moduleGraph.invalidateModule(mod)
    },
  }
}

// Chunks à tenir hors du précache PWA (voir plus bas) : chacun a un nom
// généré par défaut trop ambigu pour être ciblé sans risque dans la config
// Workbox (initiales seules pour les shards du dictionnaire, `index.esm-HASH`
// répété pour chaque sous-module Firebase). `chunkFileNames` leur donne un
// préfixe explicite selon le dossier source du module.
const DICT_DATA_DIR = path.join(ROOT, 'src', 'dictionary')
const DICT_DATA_PREFIX = 'dict-data'
// Séparateur générique (pas `path.sep`) : les ids de module Rollup restent en
// `/` même sous Windows.
const FIREBASE_SDK_RE = /[/\\](?:@firebase|firebase)[/\\]/
const FIREBASE_SDK_PREFIX = 'firebase-sdk'

const LAZY_CACHE_PREFIXES = [DICT_DATA_PREFIX, FIREBASE_SDK_PREFIX]

// PERF-1 : chunks volontairement hors du précache. Le précache servait
// ~2,1 Mio (162 entrées) à chaque installation/mise à jour du service worker ;
// on ne garde que le socle de l'app (entrée, routeur, catalogue, lecteur,
// accueil, bibliothèque, CSS). Tout le reste reste chargé à la demande et est
// mis en cache à la première utilisation par la route runtime ci-dessous
// (noms hashés = contenu immuable), donc disponible hors ligne après un
// premier accès.
//  - vues lourdes ou peu fréquentes (dialogues parlés 443 Ko, jeux, grammaire,
//    écriture, moteur du test de niveau) ;
//  - contenu gratuit d'aperçu (chapitres de livres, textes) : un chunk par
//    contenu, nommé d'après son identifiant (voir freeContentPlugin).
const LAZY_VIEW_CHUNKS = [
  'DialogoParloView',
  'DialogueView',
  'GameView',
  'GrammarView',
  'WriteView',
  'LevelTestView',
  'levelTestEngine',
  'CreateTextView',
  'MyTextsView',
  'AdminView',
  'AdminWordsView',
  'AdminTextsView',
  'AdminDictionaryView',
  'NotizieView',
]
const freeIds = freeContentIds()
const FREE_CONTENT_CHUNKS = [
  ...freeIds.texts,
  ...freeIds.chapters.map(({ bookId, chapterId }) => `${bookId}-${chapterId}`),
]
const PRECACHE_IGNORES = [
  ...LAZY_CACHE_PREFIXES,
  ...LAZY_VIEW_CHUNKS,
  ...FREE_CONTENT_CHUNKS,
].map((name) => `**/${name}-*`)

// Fichiers de public/ qui ne doivent pas partir en production (PWA-1,
// PERF-1) : l'ancien manifeste statique (chemins ../icons/ cassés, écrasé par
// celui que VitePWA génère) et la page de test audio. À retirer de public/
// (git rm) ; ce plugin évite en attendant qu'ils soient publiés.
function dropStalePublicFiles() {
  return {
    name: 'leggendo-drop-stale-public-files',
    apply: 'build',
    closeBundle: {
      order: 'pre',
      handler() {
        // VitePWA lit dist/ dans son propre closeBundle : on nettoie avant.
        const outDir = path.join(ROOT, 'dist')
        rmSync(path.join(outDir, 'audio-test.html'), { force: true })
      },
    },
  }
}

export default defineConfig({
  plugins: [
    freeContentPlugin(),
    catalogPlugin(),
    vue(),
    dropStalePublicFiles(),
    // Mode hors-ligne : l'app et l'aperçu gratuit sont précachés à
    // l'installation. Le contenu réservé n'est plus un asset du build (voir
    // freeContentPlugin ci-dessus) : il vient de Firestore, dont le cache
    // persistant assure la relecture hors connexion après un accès autorisé
    // (voir src/lib/firebase.js).
    //
    // Les shards du dictionnaire (~2,7 Mio) et les SDK Firebase (~1 Mio :
    // auth, firestore, functions, analytics) en sont volontairement exclus :
    // contrairement à l'aperçu gratuit, rien n'exige que le dictionnaire
    // (fonctionnalité pilote) ou les fonctions liées à un compte (connexion,
    // textes créés, progression synchronisée) soient disponibles dès
    // l'installation — ce sont déjà des `import()` chargés à la demande (voir
    // src/lib/firebase.js et src/lib/dictionary.js). Le runtimeCaching
    // ci-dessous les met en cache au premier accès, ce qui garde la lecture
    // hors ligne une fois utilisés, sans alourdir le précache initial.
    VitePWA({
      registerType: 'autoUpdate',
      // Enregistrement manuel (voir src/main.js) : dans l'app Capacitor, la
      // WebView sert déjà les fichiers locaux, un service worker n'a rien à
      // apporter et peut entrer en conflit avec le cache natif.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
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
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          // Version « maskable » (fond plein, logo dans la zone de sécurité) :
          // Android la découpe en cercle/squircle sans rogner le livre.
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
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
        globIgnores: [...PRECACHE_IGNORES, '**/audio-test.html'],
        navigateFallback: '/index.html',
        // Sans ça, le service worker intercepte AUSSI la navigation vers des
        // fichiers non-SPA servis à la racine (sitemap.xml, robots.txt,
        // llms.txt...) et sert index.html à la place — ce qui affiche la 404
        // Vue alors que le fichier existe bel et bien côté serveur (constaté
        // en marchant sur leggendo.fr/sitemap.xml avec un SW déjà installé).
        // Toute route SPA réelle est sans extension ; on exclut donc du
        // fallback tout chemin qui se termine par une extension de fichier.
        navigateFallbackDenylist: [/\.[^/]+$/],
        // Contenu statique versionné par son hash (voir chunkFileNames) :
        // une entrée en cache ne devient jamais périmée, seul son nom change.
        runtimeCaching: [
          ...LAZY_CACHE_PREFIXES.map((prefix) => ({
            urlPattern: new RegExp(`/assets/${prefix}-.*\\.js$`),
            handler: 'CacheFirst',
            options: {
              cacheName: prefix,
              expiration: { maxEntries: 200, maxAgeSeconds: 180 * 24 * 60 * 60 },
            },
          })),
          // Vues et contenus d'aperçu sortis du précache (PERF-1) : mis en
          // cache au premier accès. Les noms hashés rendent CacheFirst sûr.
          {
            urlPattern: new RegExp(
              `/assets/(?:${[...LAZY_VIEW_CHUNKS, ...FREE_CONTENT_CHUNKS]
                .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .join('|')})-[^/]*\\.(?:js|css)$`
            ),
            handler: 'CacheFirst',
            options: {
              cacheName: 'lazy-assets',
              expiration: { maxEntries: 200, maxAgeSeconds: 180 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        chunkFileNames(chunkInfo) {
          const source = chunkInfo.facadeModuleId || chunkInfo.moduleIds?.[0] || ''
          if (source.startsWith(DICT_DATA_DIR)) {
            return `assets/${DICT_DATA_PREFIX}-[name]-[hash].js`
          }
          if (FIREBASE_SDK_RE.test(source)) {
            return `assets/${FIREBASE_SDK_PREFIX}-[name]-[hash].js`
          }
          return 'assets/[name]-[hash].js'
        },
      },
    },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    // En dev, /leggendo est proxifié vers l'API de prod : les appels restent
    // en même origine, donc plus de contrainte CORS quel que soit le port local.
    proxy: {
      '/leggendo': {
        target: 'https://api.loicberthod.ch',
        changeOrigin: true,
      },
    },
  },
})
