#!/usr/bin/env node
// Prérendu statique après le build (voir "postbuild" dans package.json).
//
// Vite produit une SPA pure (dist/index.html + un <div id="app"></div>
// vide) : les robots qui n'exécutent pas de JS (GPTBot, ClaudeBot,
// PerplexityBot…) et Googlebot en mode dégradé ne voient rien. Ce script
// génère, pour chaque URL importante, un fichier HTML statique contenant le
// vrai titre/description/canonical et — quand la donnée est disponible
// (catalogue, textes) — le vrai contenu visible. Vue s'hydrate ensuite
// par-dessus normalement pour l'interactivité (traduction au clic, audio…).
//
// Ce n'est PAS du SSR : pas de rendu des composants Vue, juste une
// génération manuelle de HTML à partir des données JSON déjà utilisées par
// l'app (src/texts/*.json). Fragile si le contenu d'une page comme
// MethodView.vue change en profondeur (ce script ne le reflète pas) — voir
// AVANT_DEPLOY.md pour les limites connues.
//
// Usage : node scripts/prerender.mjs (exécuté après "vite build")

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { SITE_URL, ROUTES } from '../src/seo/staticPages.js'
import { EXAMPLE_COUNT, pickExampleTexts } from '../src/lib/catalogAccess.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.join(root, '../src')
const distDir = path.join(root, '../dist')

if (!existsSync(distDir)) {
  console.error('dist/ introuvable — lancez "vite build" avant ce script.')
  process.exit(1)
}

const template = readFileSync(path.join(distDir, 'index.html'), 'utf8')
const textsIndex = JSON.parse(
  readFileSync(path.join(srcDir, 'texts/index.json'), 'utf8')
)

const FREE_IDS = new Set(pickExampleTexts(textsIndex, EXAMPLE_COUNT).map((t) => t.id))

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
function escapeAttr(str = '') {
  return escapeHtml(str).replace(/"/g, '&quot;')
}

function patchHead(html, { title, description, canonical, extraHead = '' }) {
  let out = html.replace(
    /<title>.*?<\/title>/s,
    `<title>${escapeHtml(title)}</title>`
  )
  out = out.replace(
    /<meta\s+name="description"[^>]*\/>/,
    `<meta name="description" content="${escapeAttr(description)}" />`
  )
  out = out.replace(
    /<meta\s+property="og:title"[^>]*\/>/,
    `<meta property="og:title" content="${escapeAttr(title)}" />`
  )
  out = out.replace(
    /<meta\s+property="og:description"[\s\S]*?\/>/,
    `<meta property="og:description" content="${escapeAttr(description)}" />`
  )
  out = out.replace(
    /<meta\s+property="og:url"[^>]*\/>/,
    `<meta property="og:url" content="${canonical}" />`
  )
  out = out.replace(
    /<meta\s+name="twitter:title"[^>]*\/>/,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`
  )
  out = out.replace(
    /<meta\s+name="twitter:description"[\s\S]*?\/>/,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`
  )
  out = out.replace(
    /<link rel="canonical"[^>]*\/>/,
    `<link rel="canonical" href="${canonical}" />`
  )
  out = out.replace('</head>', `${extraHead}  </head>`)
  return out
}

function withBody(html, bodyContent) {
  return html.replace(
    '<div id="app"></div>',
    `<div id="app">${bodyContent}</div>`
  )
}

function jsonLd(obj) {
  return `    <script type="application/ld+json">${JSON.stringify(obj)}</script>\n`
}

function writeRoute(routePath, html) {
  const slug = routePath.replace(/^\//, '')
  if (!slug) {
    writeFileSync(path.join(distDir, 'index.html'), html)
    return
  }
  const outPath = path.join(distDir, `${slug}.html`)
  mkdirSync(path.dirname(outPath), { recursive: true })
  writeFileSync(outPath, html)
}

let count = 0

// --- Pages statiques : correction du <head> pour toutes les pages indexables ---
// FAQ affichée dans MethodView.vue (slide 7) — dupliquée ici car ce script
// ne fait pas tourner Vue. Si le contenu de la FAQ change là-bas, le
// répercuter ici pour garder le FAQPage JSON-LD synchronisé.
const METHOD_FAQ = [
  {
    q: "Peut-on vraiment apprendre l'italien juste en lisant ?",
    a: "La compréhension et le vocabulaire, oui — c'est confirmé par plusieurs méta-analyses. Pour parler, il faut aussi pratiquer l'oral : la lecture extensive est le complément idéal d'un cours ou d'un tandem.",
  },
  {
    q: 'Quel niveau faut-il pour commencer ?',
    a: "Aucun. Les textes A1 sont accessibles dès les premiers jours, et le français partage trois quarts de son vocabulaire avec l'italien. La traduction au clic fait le reste.",
  },
  {
    q: 'Combien de temps par jour ?',
    a: "10 à 20 minutes par jour suffisent : la régularité compte plus que la durée. C'est le volume cumulé de lecture qui fait la différence.",
  },
  {
    q: 'Pourquoi la traduction en français ?',
    a: "Pour les débutants et intermédiaires, la recherche montre que les traductions en langue maternelle sont plus efficaces que les définitions en langue cible.",
  },
]

for (const route of ROUTES) {
  if (route.noindex) continue
  const canonical = `${SITE_URL}${route.path}`
  let extraHead = ''
  if (route.path === '/methode') {
    extraHead = jsonLd({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: METHOD_FAQ.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    })
  } else if (route.path === '/abonnement') {
    // Prix de référence EUR — src/lib/stripe.js ajuste l'affichage en CHF
    // pour les visiteurs suisses côté client, ce script (Node) ne peut pas
    // reproduire cette détection (dépend de `navigator`). À resynchroniser
    // à la main si les tarifs changent.
    extraHead = jsonLd({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Leggendo Premium',
      description:
        "Accès illimité à tous les textes gradués en italien (A1 à C2), traduction française au clic et lecture audio.",
      offers: {
        '@type': 'Offer',
        price: '6',
        priceCurrency: 'EUR',
        priceValidUntil: `${new Date().getUTCFullYear() + 1}-12-31`,
        url: canonical,
      },
    })
  }
  let html = patchHead(template, {
    title: route.title,
    description: route.description || route.title,
    canonical,
    extraHead,
  })

  // /textes : catalogue complet en HTML statique, groupé par niveau, avec un
  // vrai lien <a> vers chaque texte (découverte + maillage interne pour les
  // pages du catalogue, y compris pour les robots sans JS).
  if (route.path === '/textes') {
    const byLevel = {}
    for (const t of textsIndex) (byLevel[t.level] ??= []).push(t)
    const body = Object.keys(byLevel)
      .sort()
      .map(
        (lvl) => `<section>
    <h2>Niveau ${escapeHtml(lvl)}</h2>
    <ul>
${byLevel[lvl]
  .map(
    (t) =>
      `      <li><a href="/testo/${t.id}">${escapeHtml(t.title)}</a> — ${escapeHtml(t.excerpt)}</li>`
  )
  .join('\n')}
    </ul>
  </section>`
      )
      .join('\n  ')
    html = withBody(
      html,
      `<h1>Tous les textes en italien</h1>\n  ${body}`
    )
  }

  writeRoute(route.path, html)
  count++
}

// --- Pages de textes : /testo/<id> ---
for (const t of textsIndex) {
  const canonical = `${SITE_URL}/testo/${t.id}`
  const title = `${t.title} — texte en italien ${t.level} avec traduction française`
  const description = `« ${t.excerpt} » — Lisez ce texte en italien (niveau ${t.level}, ~${t.wordCount} mots) avec traduction française au clic et lecture audio.`
  const free = FREE_IDS.has(t.id)

  const extraHead = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: t.title,
    description: t.excerpt,
    inLanguage: 'it',
    learningResourceType: 'Texte de lecture graduée',
    educationalLevel: t.level,
    about: t.category,
    genre: t.genre,
    isAccessibleForFree: free,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'Leggendo', url: SITE_URL },
  })

  let html = patchHead(template, { title, description, canonical, extraHead })

  let bodyContent
  if (free) {
    // Texte de l'aperçu gratuit : le paragraphe complet peut être affiché,
    // il est de toute façon accessible sans compte dans l'app.
    let paragraphs = []
    try {
      const full = JSON.parse(
        readFileSync(path.join(srcDir, `texts/${t.id}.json`), 'utf8')
      )
      paragraphs = full.paragraphs || []
    } catch {
      // fichier introuvable (ne devrait pas arriver pour un texte du catalogue)
    }
    bodyContent = `<p><a href="/textes">← Tous les textes</a></p>
  <h1>${escapeHtml(t.title)}</h1>
  <p><strong>Niveau ${escapeHtml(t.level)}</strong> · ${escapeHtml(t.category)} · ${escapeHtml(t.genre)} · ~${t.wordCount} mots</p>
  ${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n  ')}
  <p><em>Traduction française au clic et lecture audio disponibles dans la version interactive ci-dessus.</em></p>`
  } else {
    bodyContent = `<p><a href="/textes">← Tous les textes</a></p>
  <h1>${escapeHtml(t.title)}</h1>
  <p><strong>Niveau ${escapeHtml(t.level)}</strong> · ${escapeHtml(t.category)} · ${escapeHtml(t.genre)} · ~${t.wordCount} mots</p>
  <p>${escapeHtml(t.excerpt)}</p>
  <p>Texte complet réservé aux abonné·es Leggendo.</p>
  <p><a href="/abonnement">Voir les formules d'abonnement</a> · <a href="/connexion">Se connecter</a></p>`
  }

  html = withBody(html, bodyContent)
  writeRoute(`/testo/${t.id}`, html)
  count++
}

console.log(`✓ ${count} pages prérendues dans dist/`)
