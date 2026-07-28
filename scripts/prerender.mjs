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
import {
  EXAMPLE_COUNT,
  pickExampleTexts,
  isFreeClassiciChapter,
} from '../src/lib/catalogAccess.js'
// Module Node-safe (voir src/lib/stripe.js : isSwitzerland() protège son
// accès à `navigator` par un try/catch) — permet de générer les vraies
// cartes de prix ici plutôt que de dupliquer les montants à la main.
import { plans } from '../src/lib/stripe.js'
import { loadBooksIndex, loadBookManifest } from './lib/free-content.mjs'
import { getSeoDictionaryEntries } from '../src/seo/dictionaryPages.js'
import { getSeoConjugations } from '../src/seo/conjugationPages.js'
import { LEVEL_LANDING_PAGES, findLevelLandingPage, pickFeaturedTexts } from '../src/seo/landingPages.js'

// Les shards de conjugaison ne sont pas tous générés dans le même format
// (constaté en pratique) : certains verbes utilisent des clés camelCase avec
// un objet {personne: forme} (ex. "avere"), d'autres des clés snake_case
// avec un tableau aligné sur PERSONS (ex. "essere") — normalizeTense()
// ramène les deux formats à un objet {personne: forme} unique.
const TENSE_ALIASES = {
  presente: ['presente'],
  passatoProssimo: ['passatoProssimo', 'passato_prossimo'],
  imperfetto: ['imperfetto'],
  futuro: ['futuro'],
  congiuntivoPresente: ['congiuntivoPresente', 'congiuntivo_presente'],
  condizionale: ['condizionale'],
  imperativo: ['imperativo'],
}
const TENSE_LABELS = {
  presente: 'Presente',
  passatoProssimo: 'Passato prossimo',
  imperfetto: 'Imperfetto',
  futuro: 'Futuro',
  congiuntivoPresente: 'Congiuntivo presente',
  condizionale: 'Condizionale',
  imperativo: 'Imperativo',
}
const PERSONS = ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro']
const IMPERATIVE_PERSONS = ['tu', 'lei', 'noi', 'voi', 'loro']

function normalizeTense(value) {
  if (!value) return null
  if (Array.isArray(value)) {
    const persons = value.length === IMPERATIVE_PERSONS.length ? IMPERATIVE_PERSONS : PERSONS
    return Object.fromEntries(persons.map((p, i) => [p, value[i]]))
  }
  return typeof value === 'object' ? value : null
}

function findTense(conjugation, canonicalKey) {
  for (const key of TENSE_ALIASES[canonicalKey]) {
    if (conjugation[key]) return normalizeTense(conjugation[key])
  }
  return null
}

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
const booksIndex = loadBooksIndex()

// Mêmes totaux que virtual:catalog (vite.config.js, plugin leggendo-catalog),
// recalculés ici à partir de la même source (texts/index.json) : ce script
// tourne en Node, il ne peut pas importer un module virtuel Vite.
const sortedLevels = [...new Set(textsIndex.map((t) => t.level))].sort()
const wordCounts = textsIndex.map((t) => t.wordCount).filter(Boolean)
const catalogStats = {
  count: textsIndex.length,
  levelRange: `${sortedLevels[0]} → ${sortedLevels[sortedLevels.length - 1]}`,
  categoryCount: new Set(textsIndex.map((t) => t.category)).size,
  minWords: Math.min(...wordCounts),
  maxWords: Math.max(...wordCounts),
}

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
    // Prix de référence EUR (le premier plan payant) — src/lib/stripe.js
    // ajuste l'affichage en CHF pour les visiteurs suisses côté client ;
    // Stripe lui-même choisit la devise réellement facturée au paiement.
    const premium = plans.find((p) => p.id === 'premium')
    extraHead = jsonLd({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Leggendo Premium',
      description:
        "Accès illimité à tous les textes gradués en italien (A1 à C2), traduction française au clic et lecture audio.",
      offers: {
        '@type': 'Offer',
        price: (premium?.monthly.price.match(/[\d,.]+/)?.[0] || '').replace(',', '.'),
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

  // --- Contenu réel pour les pages marketing (GPTanalyse.md, § 3) ---
  // Duplication volontaire et courte de la proposition de valeur de
  // HomeView.vue / AboutView.vue — voir le commentaire d'en-tête de ce
  // script pour les limites de cette approche (pas un vrai SSR).
  if (route.path === '/') {
    html = withBody(
      html,
      `<h1>Leggendo — apprendre l'italien en lisant</h1>
  <p>Des histoires à votre niveau, la traduction française d'un survol, l'audio d'un clic. Rien d'autre entre vous et la langue.</p>
  <p>${catalogStats.categoryCount} catégories · niveaux ${escapeHtml(catalogStats.levelRange)} · ${catalogStats.minWords}–${catalogStats.maxWords} mots par texte.</p>
  <ul>
    <li>Lisez : des textes courts écrits pour votre niveau, de A1 à C2.</li>
    <li>Comprenez tout : survolez un mot, cliquez une phrase, la traduction apparaît.</li>
    <li>Écoutez l'italien : chaque texte se lit à voix haute, phrase par phrase.</li>
  </ul>
  <p><a href="/textes">Commencer à lire</a> · <a href="/methode">La méthode</a></p>`
    )
  } else if (route.path === '/methode') {
    html = withBody(
      html,
      `<h1>La méthode Leggendo</h1>
  <p>Leggendo s'appuie sur la lecture extensive : lire beaucoup, à un niveau où l'on comprend l'essentiel (~95 %) tout en rencontrant du vocabulaire nouveau — la zone où l'on progresse le plus (input compréhensible, Krashen).</p>
  <ul>
    <li>Choisissez un texte gradué de A1 à C2, classé selon le CECR.</li>
    <li>Survolez les mots : la traduction française apparaît instantanément.</li>
    <li>Cliquez une phrase (ou sa ponctuation) pour la traduire entièrement.</li>
    <li>Écoutez le texte en même temps que vous le lisez, pour une double trace en mémoire.</li>
  </ul>
  <h2>Questions fréquentes</h2>
  ${METHOD_FAQ.map((f) => `<h3>${escapeHtml(f.q)}</h3>\n  <p>${escapeHtml(f.a)}</p>`).join('\n  ')}`
    )
  } else if (route.path === '/abonnement') {
    html = withBody(
      html,
      `<h1>Abonnements Leggendo</h1>
  <p>Soutenez le projet et débloquez tous les textes avec la formule Premium.</p>
  ${plans
    .map((p) => {
      const monthly = `${p.monthly.price}${p.monthly.period ? ' ' + p.monthly.period : ''}`
      const annual = `${p.annual.price}${p.annual.period ? ' ' + p.annual.period : ''}`
      const price = p.annual.price === p.monthly.price ? monthly : `${monthly} (ou ${annual})`
      return `<section>
    <h2>${escapeHtml(p.name)}</h2>
    <p>${escapeHtml(price)}</p>
    <ul>${p.features.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
  </section>`
    })
    .join('\n  ')}
  <p>Paiement sécurisé par Stripe. Résiliable à tout moment.</p>`
    )
  } else if (route.path === '/classici') {
    const body = booksIndex
      .map(
        (b) =>
          `<li><a href="/classici/${b.id}/01">${escapeHtml(b.title)}</a> — ${escapeHtml(b.author)}, niveau ${escapeHtml(b.level)} (${b.chapterCount} chapitre${b.chapterCount > 1 ? 's' : ''})</li>`
      )
      .join('\n    ')
    html = withBody(
      html,
      `<h1>Classici del dominio pubblico</h1>
  <p>Des œuvres classiques italiennes du domaine public, en texte authentique (non simplifié) — traduction au clic, lecture audio et quiz de compréhension, chapitre par chapitre.</p>
  <ul>\n    ${body}\n  </ul>`
    )
  } else if (route.path === '/a-propos') {
    html = withBody(
      html,
      `<h1>À propos de Leggendo</h1>
  <p>Leggendo est né d'un constat simple : on apprend une langue en la lisant beaucoup, à un niveau où l'on comprend l'essentiel. ${catalogStats.count} textes gradués, de ${escapeHtml(catalogStats.levelRange)}, avec traduction française au clic et lecture audio.</p>
  <p><a href="/methode">Découvrir la méthode</a> · <a href="/textes">Voir les textes</a></p>`
    )
  } else if (LEVEL_LANDING_PAGES.some((p) => p.path === route.path)) {
    // Pages par niveau (GPTanalyse.md, § 10) — même sélection éditoriale que
    // src/views/LevelLandingView.vue (src/seo/landingPages.js).
    const page = findLevelLandingPage(LEVEL_LANDING_PAGES.find((p) => p.path === route.path).level)
    const featured = pickFeaturedTexts(textsIndex, page.level, 20)
    html = withBody(
      html,
      `<h1>${escapeHtml(page.heading)}</h1>
  <p>${escapeHtml(page.audience)}</p>
  <p>${escapeHtml(page.difficulties)}</p>
  <p>${escapeHtml(page.order)}</p>
  <ul>
${featured.map((t) => `    <li><a href="/testo/${t.id}">${escapeHtml(t.title)}</a> — ${escapeHtml(t.excerpt)}</li>`).join('\n')}
  </ul>
  <p><a href="/textes">Voir tous les textes ${escapeHtml(page.level)}</a></p>`
    )
  }

  writeRoute(route.path, html)
  count++
}

// --- Pages de chapitres Classici : /classici/<bookId>/<chapterId> ---
// Même logique que /testo/<id> : corps complet pour un chapitre gratuit,
// extrait + paywall balisé sinon (voir isFreeClassiciChapter, la même
// fonction que côté client dans src/router.js/BookReaderView.vue).
for (const b of booksIndex) {
  const manifest = loadBookManifest(b.id)
  manifest.chapters.forEach((chapter, i) => {
    const canonical = `${SITE_URL}/classici/${b.id}/${chapter.id}`
    const title = `${chapter.title} — ${manifest.title} (Leggendo)`
    const free = isFreeClassiciChapter(b.id, chapter.id)
    const description = `${chapter.title} — chapitre ${i + 1}/${manifest.chapters.length} de « ${manifest.title} » (${manifest.author}), niveau ${manifest.level}. Traduction française au clic et lecture audio.`

    const extraHead = jsonLd({
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      name: `${manifest.title} — ${chapter.title}`,
      description,
      inLanguage: 'it',
      learningResourceType: 'Classique italien adapté',
      educationalLevel: manifest.level,
      author: manifest.author,
      isAccessibleForFree: free,
      url: canonical,
      isPartOf: { '@type': 'WebSite', name: 'Leggendo', url: SITE_URL },
      ...(free
        ? {}
        : {
            hasPart: {
              '@type': 'WebPageElement',
              isAccessibleForFree: false,
              cssSelector: '.paywall',
            },
          }),
    })

    let html = patchHead(template, { title, description, canonical, extraHead })

    let bodyContent
    if (free) {
      let paragraphs = []
      try {
        const full = JSON.parse(
          readFileSync(
            path.join(srcDir, `books/${b.id}/${b.id}-${chapter.id}.json`),
            'utf8'
          )
        )
        paragraphs = full.paragraphs || []
      } catch {
        // fichier introuvable (ne devrait pas arriver pour un chapitre gratuit)
      }
      bodyContent = `<p><a href="/classici">← Tutti i classici</a></p>
  <h1>${escapeHtml(manifest.title)}</h1>
  <p><strong>${escapeHtml(chapter.title)}</strong> · ${escapeHtml(manifest.author)} · niveau ${escapeHtml(manifest.level)}</p>
  ${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n  ')}
  <p><em>Traduction française au clic et lecture audio disponibles dans la version interactive ci-dessus.</em></p>`
    } else {
      bodyContent = `<p><a href="/classici">← Tutti i classici</a></p>
  <h1>${escapeHtml(manifest.title)}</h1>
  <p><strong>${escapeHtml(chapter.title)}</strong> · ${escapeHtml(manifest.author)} · niveau ${escapeHtml(manifest.level)}</p>
  <div class="paywall">
    <p>Ce chapitre fait partie du catalogue Classici complet, réservé aux abonné·es Premium IA et Enseignant.</p>
    <p><a href="/abonnement">Voir les formules d'abonnement</a> · <a href="/connexion">Se connecter</a></p>
  </div>`
    }

    html = withBody(html, bodyContent)
    writeRoute(`/classici/${b.id}/${chapter.id}`, html)
    count++
  })
}

// --- Dictionnaire : /dizionario/<lemma> (premier lot, voir dictionaryPages.js) ---
for (const entry of getSeoDictionaryEntries()) {
  const canonical = `${SITE_URL}/dizionario/${encodeURIComponent(entry.lemma)}`
  const title = `${entry.lemma} en italien : traduction, définition et exemples — Leggendo`
  const description = `« ${entry.lemma} » (${entry.pos}) : ${entry.fr}. Définition, exemples et conjugaison sur Leggendo.`

  const extraHead = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: entry.lemma,
    description: entry.definition_it,
    inDefinedTermSet: `${SITE_URL}/verbi`,
    url: canonical,
  })

  let html = patchHead(template, { title, description, canonical, extraHead })
  const examplesHtml = entry.examples
    .map((ex) => `<li>${escapeHtml(ex.it)} — <em>${escapeHtml(ex.fr)}</em></li>`)
    .join('\n    ')
  const synonymsHtml = entry.synonyms?.length
    ? `<p>Synonymes : ${entry.synonyms.map(escapeHtml).join(', ')}</p>`
    : ''
  const conjugationLink = entry.isVerb
    ? `<p><a href="/coniugazione/${encodeURIComponent(entry.lemma)}">Voir la conjugaison de « ${escapeHtml(entry.lemma)} »</a></p>`
    : ''

  html = withBody(
    html,
    `<p><a href="/verbi">← Dizionario</a></p>
  <h1>${escapeHtml(entry.lemma)}</h1>
  <p><strong>${escapeHtml(entry.pos)}</strong> — ${escapeHtml(entry.fr)}</p>
  <p>${escapeHtml(entry.definition_it)}</p>
  <ul>\n    ${examplesHtml}\n  </ul>
  ${synonymsHtml}
  ${conjugationLink}`
  )
  writeRoute(`/dizionario/${entry.lemma}`, html)
  count++
}

// --- Conjugaisons : /coniugazione/<verbo> (premier lot, voir conjugationPages.js) ---
for (const { lemma, fr, conjugation } of getSeoConjugations()) {
  const canonical = `${SITE_URL}/coniugazione/${encodeURIComponent(lemma)}`
  const title = `Conjugaison de ${lemma} en italien — tableaux et exemples — Leggendo`
  const description = `Conjugaison complète du verbe italien « ${lemma} » (${fr}) : présent, passé composé, imparfait, futur, conditionnel, subjonctif, impératif.`

  const html = patchHead(template, { title, description, canonical, extraHead: '' })
  const tables = Object.keys(TENSE_LABELS)
    .map((tense) => ({ tense, forms: findTense(conjugation, tense) }))
    .filter(({ forms }) => forms)
    .map(({ tense, forms }) => {
      const persons = tense === 'imperativo' ? IMPERATIVE_PERSONS : PERSONS
      const rows = persons
        .map((p) => `<li>${escapeHtml(p)} : ${escapeHtml(forms[p] || '—')}</li>`)
        .join('')
      return `<section>
    <h2>${TENSE_LABELS[tense]}</h2>
    <ul>${rows}</ul>
  </section>`
    })
    .join('\n  ')

  writeRoute(
    `/coniugazione/${lemma}`,
    withBody(
      html,
      `<p><a href="/dizionario/${encodeURIComponent(lemma)}">← Fiche « ${escapeHtml(lemma)} »</a></p>
  <h1>Conjugaison de ${escapeHtml(lemma)}</h1>
  <p>${escapeHtml(lemma)} — ${escapeHtml(fr)}</p>
  ${tables}`
    )
  )
  count++
}

// --- Page 404 : servie par public/.htaccess (ErrorDocument 404 /404.html)
// pour les vraies URL inexistantes ; la route Vue « not-found » gère le cas
// où le SPA est déjà chargé et navigue elle-même vers une URL inconnue.
{
  const html404 = patchHead(template, {
    title: 'Page introuvable — Leggendo',
    description: "Cette page n'existe pas ou plus.",
    canonical: `${SITE_URL}/404`,
    extraHead: '    <meta name="robots" content="noindex, follow" />\n',
  })
  writeRoute(
    '/404',
    withBody(
      html404,
      `<h1>Page introuvable</h1>
  <p>Cette page n'existe pas ou plus.</p>
  <p><a href="/textes">Voir les textes gratuits</a> · <a href="/dizionario">Ouvrir le dictionnaire</a></p>`
    )
  )
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
    // Balise le paywall (GPTanalyse.md, § 2) : le sélecteur cible la même
    // classe que src/components/ContentPaywall.vue côté client.
    ...(free
      ? {}
      : {
          hasPart: {
            '@type': 'WebPageElement',
            isAccessibleForFree: false,
            cssSelector: '.paywall',
          },
        }),
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
  <div class="paywall">
    <p>Ce texte fait partie du catalogue complet, réservé aux abonné·es Leggendo.</p>
    <p><a href="/abonnement">Voir les formules d'abonnement</a> · <a href="/connexion">Se connecter</a></p>
  </div>`
  }

  html = withBody(html, bodyContent)
  writeRoute(`/testo/${t.id}`, html)
  count++
}

console.log(`✓ ${count} pages prérendues dans dist/`)
