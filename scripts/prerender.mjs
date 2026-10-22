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
// Page « Gratuit » (/abonnement) : fonctionnalités et FAQ partagées avec
// PricingView.vue — module sans dépendance Vue/Firebase.
import { FREE_FEATURES, FREE_FAQ } from '../src/seo/freePage.js'
import { loadBooksIndex, loadBookManifest } from './lib/free-content.mjs'
import { getSeoDictionaryEntries } from '../src/seo/dictionaryPages.js'
import { getSeoConjugations } from '../src/seo/conjugationPages.js'
import { LEVEL_LANDING_PAGES, findLevelLandingPage, pickFeaturedTexts } from '../src/seo/landingPages.js'
import { STATIC_PAGE_CONTENT, NAV_LINKS, FOOTER_LINKS } from '../src/seo/staticContent.js'

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
// Shell SPA vide (SEO-1) : repli du serveur (Caddyfile) pour les routes de
// l'application sans page prérendue (/connexion, /profil...). Distinct de
// index.html, qui est écrasé plus bas par la page d'accueil prérendue —
// servir l'accueil pour /connexion donnerait un contenu et un canonical faux.
writeFileSync(path.join(distDir, 'spa.html'), template)

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

function patchHead(html, { title, description, canonical, extraHead = '', ogType = 'website' }) {
  let out = html.replace(
    /<title>.*?<\/title>/s,
    `<title>${escapeHtml(title)}</title>`
  )
  out = out.replace(
    /<meta\s+name="description"[^>]*\/>/,
    `<meta name="description" content="${escapeAttr(description)}" />`
  )
  out = out.replace(
    /<meta\s+property="og:type"[^>]*\/>/,
    `<meta property="og:type" content="${ogType}" />`
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

// Navigation et pied de page statiques (SEO-6) : chaque page prérendue
// expose ≥ 8 liens internes crawlables, y compris pour les robots sans JS.
// Vue remplace tout le contenu de #app au montage (createApp().mount, pas
// d'hydratation), donc aucune divergence à gérer avec le DOM client.
const linkList = (links) =>
  links.map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`).join(' · ')
const SEO_HEADER = `<header><nav aria-label="Navigation principale"><a href="/">Leggendo</a> — ${linkList(NAV_LINKS.slice(1))}</nav></header>`
const SEO_FOOTER = `<footer><nav aria-label="Pied de page">${linkList(FOOTER_LINKS)}</nav><p>© Leggendo — apprendre l'italien par la lecture, avec traduction française au clic et audio.</p></footer>`

function withBody(html, bodyContent) {
  return html.replace(
    '<div id="app"></div>',
    () => `<div id="app">${SEO_HEADER}<main>${bodyContent}</main>${SEO_FOOTER}</div>`
  )
}

function jsonLd(obj) {
  return `    <script type="application/ld+json">${JSON.stringify(obj)}</script>\n`
}

// BreadcrumbList : fil d'Ariane structuré pour les pages profondes
// (testo, classici/chapitre, dizionario, coniugazione) — voir ROADMAP_SEO_GEO.md.
function breadcrumbJsonLd(items) {
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  })
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

// Rendu générique des pages à contenu statique (src/seo/staticContent.js).
function renderStaticContent(page, routePath) {
  const sections = page.sections
    .map(
      (sec) =>
        `<section>\n    <h2>${escapeHtml(sec.h2)}</h2>\n` +
        (sec.p || []).map((p) => `    <p>${escapeHtml(p)}</p>\n`).join('') +
        (sec.ul ? `    <ul>${sec.ul.map((li) => `<li>${escapeHtml(li)}</li>`).join('')}</ul>\n` : '') +
        '  </section>'
    )
    .join('\n  ')
  // /dizionario : sélection de fiches (même lot que le sitemap).
  const dictList =
    routePath === '/dizionario'
      ? `<section>
    <h2>Fiches du dictionnaire</h2>
    <ul>
${getSeoDictionaryEntries()
  .map(
    (e) =>
      `      <li><a href="/dizionario/${encodeURIComponent(e.lemma)}">${escapeHtml(e.lemma)}</a> (${escapeHtml(e.pos)}) — ${escapeHtml(e.fr)}</li>`
  )
  .join('\n')}
    </ul>
  </section>`
      : ''
  const links = page.links?.length ? `<p>${linkList(page.links)}</p>` : ''
  return `<h1>${escapeHtml(page.h1)}</h1>
  ${page.intro.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n  ')}
  ${sections}
  ${dictList}
  ${links}`
}

// Descriptions CECR (niveau de lecture) — texte éditorial générique, utilisé
// pour enrichir les pages de textes et de chapitres à partir des seules
// métadonnées publiques (niveau, catégorie, genre, titre, extrait).
const LEVEL_BLURB = {
  A1: "niveau débutant : phrases courtes et simples, vocabulaire du quotidien, essentiellement au présent. Idéal pour prendre confiance dans la lecture dès les premiers jours.",
  A2: "niveau élémentaire : histoires du quotidien un peu plus longues, premiers temps du passé, vocabulaire qui s'élargit aux voyages, au travail et à la famille.",
  B1: "niveau intermédiaire : récits plus riches, temps variés, idées plus abstraites. On lit pour comprendre l'essentiel d'un texte authentique et gagner en aisance.",
  B2: "niveau intermédiaire avancé : textes plus denses, nuances de vocabulaire, constructions plus complexes. On lit couramment et on affine sa compréhension fine.",
  C1: "niveau avancé : style soutenu, tournures idiomatiques et implicites culturels. On lit des textes exigeants avec peu de recours à la traduction.",
  C2: "niveau maîtrise : textes littéraires et registres variés, jeux de langue et références. Le niveau des lecteurs très à l'aise avec l'italien écrit.",
}
const READING_WPM = 120 // vitesse indicative d'un apprenant qui consulte les traductions
const levelPageOf = (level) =>
  LEVEL_LANDING_PAGES.find((p) => p.level === level)?.path || '/textes'

// Bloc de lecture « à propos » + textes liés pour une page de texte.
function relatedBlock(t) {
  const sameLevel = textsIndex.filter((x) => x.level === t.level && x.id !== t.id)
  const idx = textsIndex.filter((x) => x.level === t.level).findIndex((x) => x.id === t.id)
  const rotate = (arr, n) => (arr.length ? [...arr.slice(n % arr.length), ...arr.slice(0, n % arr.length)] : arr)
  const sameCat = sameLevel.filter((x) => x.category === t.category)
  const others = sameLevel.filter((x) => x.category !== t.category)
  const picks = [
    ...rotate(sameCat, idx).slice(0, 4),
    ...rotate(others, idx * 7).slice(0, 4),
  ]
  const minutes = Math.max(1, Math.round((t.wordCount || 0) / READING_WPM))
  const levelPage = levelPageOf(t.level)
  return `<section>
    <h2>À propos de ce texte</h2>
    <p>« ${escapeHtml(t.title)} » est un texte de type « ${escapeHtml(t.genre)} » sur le thème « ${escapeHtml(t.category)} », d'environ ${t.wordCount} mots. Comptez environ ${minutes} minute${minutes > 1 ? 's' : ''} de lecture, traductions comprises.</p>
    <p>Niveau ${escapeHtml(t.level)} du CECR — ${escapeHtml(LEVEL_BLURB[t.level] || '')}</p>
    <h2>Comment lire ce texte</h2>
    <p>Lisez d'abord le texte en entier sans chercher à tout traduire, pour saisir le sens général. Cliquez ensuite sur les mots ou les phrases qui vous échappent pour afficher la traduction française, puis relisez en écoutant l'audio afin d'associer l'écrit et le son.</p>
  </section>
  <section>
    <h2>Autres textes de niveau ${escapeHtml(t.level)}</h2>
    <ul>
${picks.map((x) => `      <li><a href="/testo/${x.id}">${escapeHtml(x.title)}</a> (${escapeHtml(x.category)}) — ${escapeHtml(x.excerpt)}</li>`).join('\n')}
    </ul>
    <p><a href="${levelPage}">Tous les textes ${escapeHtml(t.level)}</a> · <a href="/textes">Catalogue complet</a> · <a href="/test-de-niveau">Tester mon niveau</a></p>
  </section>`
}

// Bloc d'enrichissement d'une page de chapitre Classici.
function chapterBlock(b, manifest, chapter) {
  const levelPage = levelPageOf(manifest.level)
  const toc = manifest.chapters.slice(0, 40)
  const sameLevel = booksIndex.filter((x) => x.level === b.level && x.id !== b.id).slice(0, 6)
  return `<section>
    <h2>À propos de cette œuvre</h2>
    <p>« ${escapeHtml(manifest.title)} » de ${escapeHtml(manifest.author)} est proposé sur Leggendo en italien, en ${manifest.chapters.length} chapitre${manifest.chapters.length > 1 ? 's' : ''}, au niveau ${escapeHtml(manifest.level)} du CECR${manifest.levelNote ? ` (${escapeHtml(manifest.levelNote.toLowerCase())})` : ''}. Vous lisez actuellement le chapitre « ${escapeHtml(chapter.title)} ».</p>
    <p>Niveau ${escapeHtml(manifest.level)} — ${escapeHtml(LEVEL_BLURB[manifest.level] || '')}</p>
    <h2>Comment lire un classique</h2>
    <p>Lisez chaque chapitre d'une traite pour suivre l'histoire, puis cliquez sur les mots et les phrases difficiles pour afficher la traduction française. L'audio permet de lire en écoutant, et le quiz de compréhension en fin de chapitre vérifie que le sens général est acquis.</p>
  </section>
  <section>
    <h2>Sommaire de « ${escapeHtml(manifest.title)} »</h2>
    <ol>
${toc.map((c) => `      <li><a href="/classici/${b.id}/${c.id}">${escapeHtml(c.title)}</a></li>`).join('\n')}
    </ol>
  </section>
  <section>
    <h2>Autres classiques de niveau ${escapeHtml(manifest.level)}</h2>
    <ul>
${sameLevel.map((x) => `      <li><a href="/classici/${x.id}/01">${escapeHtml(x.title)}</a> — ${escapeHtml(x.author)}</li>`).join('\n')}
    </ul>
    <p><a href="/classici">Tous les classiques</a> · <a href="${levelPage}">Textes ${escapeHtml(manifest.level)}</a></p>
  </section>`
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
    extraHead = jsonLd({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FREE_FAQ.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    })
  } else if (route.path === '/grammatica') {
    extraHead = jsonLd({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Grammatica — grammaire et orthographe italiennes',
      description: route.description,
      inLanguage: 'fr',
      about: { '@type': 'Thing', name: 'Grammaire italienne' },
      url: canonical,
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
  <h2>Comment ça marche</h2>
  <p>Leggendo est un lecteur interactif pour apprendre l'italien par la lecture extensive. Vous choisissez un texte de votre niveau (CECR), vous lisez à votre rythme et vous ne quittez jamais la page : un survol donne la traduction française d'un mot, un clic traduit la phrase entière, et le bouton audio la fait entendre en italien.</p>
  <p>Les ${catalogStats.count} textes gradués couvrent la vie quotidienne, les voyages, la culture et l'histoire. Les classiques italiens du domaine public (Pinocchio, Il Principe, Inferno…) sont proposés en texte authentique, chapitre par chapitre, avec des quiz de compréhension.</p>
  <h2>Pour réviser</h2>
  <p>Un <a href="/dizionario">dictionnaire italien-français</a>, des <a href="/verbi">tables de conjugaison</a>, une page de <a href="/grammatica">grammaire</a>, quinze <a href="/giochi">jeux</a> et un <a href="/test-de-niveau">test de niveau gratuit</a> complètent la lecture.</p>
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
      `<h1>Leggendo est gratuit</h1>
  <p>Tout le site, sans abonnement, sans essai limité, sans carte bancaire. Un compte suffit, et il est gratuit lui aussi.</p>
  <ul>
  ${FREE_FEATURES.map((f) => `<li><strong>${escapeHtml(f.title)}</strong> — ${escapeHtml(f.text)}</li>`).join('\n  ')}
  </ul>
  <p><a href="/connexion">Créer mon compte gratuit</a> · <a href="/methode">Comment ça marche</a></p>
  <h2>Questions fréquentes</h2>
  ${FREE_FAQ.map((f) => `<h3>${escapeHtml(f.q)}</h3>\n  <p>${escapeHtml(f.a)}</p>`).join('\n  ')}`
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
  <h2>Ce que propose Leggendo</h2>
  <ul>
    <li>Des textes gradués de A1 à C2, classés selon le Cadre européen commun de référence pour les langues, sur des thèmes variés : vie quotidienne, voyages, culture, histoire.</li>
    <li>Des classiques italiens du domaine public (Pinocchio, Il Principe, Rosso Malpelo, Inferno…) en texte authentique, chapitre par chapitre.</li>
    <li>Une traduction française au clic sur chaque mot et chaque phrase, et une lecture audio pour associer l'écrit et le son.</li>
    <li>Un dictionnaire, des tables de conjugaison, une page de grammaire et quinze jeux pour réviser.</li>
  </ul>
  <p>Leggendo est développé en Suisse. Une question ou une idée de texte ? <a href="/contact">Écrivez-nous</a>.</p>
  <p><a href="/methode">Découvrir la méthode</a> · <a href="/textes">Voir les textes</a> · <a href="/test-de-niveau">Tester mon niveau</a></p>`
    )
  } else if (route.path === '/verbi') {
    html = withBody(
      html,
      `<h1>Verbi italiani</h1>
  <p>Tout verbe italien appartient à l'un des trois groupes, reconnaissables à la terminaison de l'infinitif : <strong>-are</strong> (parlare, amare — le plus régulier), <strong>-ere</strong> (credere, prendere — souvent irrégulier au participe) et <strong>-ire</strong> (dormire, ou finire avec l'infixe <em>-isc-</em>).</p>
  <p>Les temps composés se forment avec un auxiliaire : <em>avere</em> pour la plupart des verbes, <em>essere</em> pour les verbes de mouvement, d'état et les réfléchis.</p>
  <h2>Les exceptions : verbes irréguliers essentiels</h2>
  <p>Auxiliaires : <a href="/coniugazione/essere">essere</a>, <a href="/coniugazione/avere">avere</a>. Modaux : <a href="/coniugazione/potere">potere</a>, <a href="/coniugazione/dovere">dovere</a>, <a href="/coniugazione/volere">volere</a>, <a href="/coniugazione/sapere">sapere</a>. Mouvement et état : <a href="/coniugazione/andare">andare</a>, <a href="/coniugazione/venire">venire</a>, <a href="/coniugazione/stare">stare</a>, <a href="/coniugazione/uscire">uscire</a>, <a href="/coniugazione/salire">salire</a>, <a href="/coniugazione/rimanere">rimanere</a>. Autres incontournables : <a href="/coniugazione/fare">fare</a>, <a href="/coniugazione/dire">dire</a>, <a href="/coniugazione/dare">dare</a>, <a href="/coniugazione/bere">bere</a>, <a href="/coniugazione/tenere">tenere</a>, <a href="/coniugazione/scegliere">scegliere</a>, <a href="/coniugazione/mettere">mettere</a>, <a href="/coniugazione/prendere">prendere</a>, <a href="/coniugazione/vedere">vedere</a>, <a href="/coniugazione/conoscere">conoscere</a>, <a href="/coniugazione/vivere">vivere</a>, <a href="/coniugazione/morire">morire</a>.</p>
  <h2>Les temps à connaître</h2>
  <p>Chaque fiche de conjugaison présente le présent, le passé composé, l'imparfait, le futur, le conditionnel, le subjonctif et l'impératif. Pour débuter, on commence par le présent, puis le passé composé (auxiliaire + participe passé : <em>ho mangiato</em>, <em>sono andato</em>) et l'imparfait (<em>mangiavo</em>), qui décrit les habitudes et le décor d'une histoire.</p>
  <p>Retrouvez ces verbes en contexte dans les <a href="/textes">textes gradués</a> et cherchez n'importe quelle forme dans le <a href="/dizionario">dictionnaire</a>.</p>
  <p>Pour les articles, les pluriels, les prépositions et l'orthographe : <a href="/grammatica">voir la page Grammatica</a>.</p>`
    )
  } else if (route.path === '/grammatica') {
    html = withBody(
      html,
      `<h1>Grammatica</h1>
  <p>L'essentiel de la grammaire et de l'orthographe italiennes, expliqué en français. Pour les verbes et leurs conjugaisons, voir la <a href="/verbi">page Verbi</a>.</p>
  <h2>Le nom : genre et pluriel</h2>
  <p>Le pluriel se forme en changeant la voyelle finale, jamais avec un « s » : -o → -i (libro → libri), -a → -e (casa → case), -e → -i pour les deux genres (cane → cani, notte → notti). Invariables : mots accentués sur la finale (città, caffè) et mots étrangers (film). Pièges classiques : il problema/il programma/il poeta sont masculins malgré le -a ; la mano est féminin ; l'uovo → le uova et il braccio → le braccia changent de genre au pluriel.</p>
  <h2>Les articles</h2>
  <p>L'article s'accorde en genre et en nombre, mais aussi selon la première lettre du mot qui suit — c'est la grande différence avec le français : <em>il libro, lo studente, l'amico, la casa, l'amica</em> au singulier ; <em>i libri, gli studenti, gli amici, le case, le amiche</em> au pluriel ; <em>un libro, uno studente, un amico, una casa, un'amica</em> à l'indéfini.</p>
  <h2>L'adjectif</h2>
  <p>Il s'accorde avec le nom (ragazzo italiano → ragazzi italiani, ragazza italiana → ragazze italiane) ; les adjectifs en -e n'ont que deux formes. Contrairement au français, l'adjectif se place le plus souvent après le nom : una macchina rossa. Quelques adjectifs courts et fréquents (bello, buono, grande, piccolo, giovane, vecchio, nuovo, stesso, altro) se placent avant.</p>
  <h2>Les possessifs</h2>
  <p>Le possessif s'accorde avec la chose possédée et se fait précéder de l'article : il mio libro, la mia casa, i miei amici. Devant un nom de famille au singulier non affectueux, l'article disparaît : mia madre, tuo fratello.</p>
  <h2>Les démonstratifs : questo et quello</h2>
  <p>Questo (ce, celui-ci) est régulier. Quello (ce, celui-là) se décline comme les prépositions articulées ci-dessous : quel libro, quello studente, quell'amico, quella casa.</p>
  <h2>Les prépositions articulées</h2>
  <p>Les prépositions di, a, da, in, su fusionnent obligatoirement avec l'article défini : del/dello/dell'/della/dei/degli/delle (di), al/allo/all'/alla/ai/agli/alle (a), dal/dallo/dall'/dalla/dai/dagli/dalle (da), nel/nello/nell'/nella/nei/negli/nelle (in), sul/sullo/sull'/sulla/sui/sugli/sulle (su). Tra et fra (entre, parmi) ne fusionnent jamais avec l'article.</p>
  <h2>Piacere et les verbes à construction inversée</h2>
  <p>Piacere (aimer, plaire) fonctionne à l'envers du français : la chose aimée est sujet, la personne est un complément indirect — Mi piace la pizza (littéralement « la pizza me plaît »), Mi piacciono i libri.</p>
  <h2>Les pronoms personnels compléments</h2>
  <p>Directs : mi, ti, lo, la, ci, vi, li, le. Indirects : mi, ti, gli, le, ci, vi, gli. Ne (en) et ci (y) : Ne prendo due, Ci vado domani. Le pronom se soude à l'infinitif et à l'impératif : vederlo, dimmi.</p>
  <h2>La négation</h2>
  <p>Non se place avant le verbe : Non parlo italiano. Avec mai, niente, nessuno placés après le verbe, l'italien double la négation : Non ho visto nessuno, Non capisco niente.</p>
  <h2>Comparatif et superlatif</h2>
  <p>Più/meno... di ou che pour comparer ; il/la più... di pour le superlatif relatif ; le suffixe -issimo/-issima pour le superlatif absolu (bello → bellissimo).</p>
  <h2>Molto, tanto, poco, troppo : adjectif ou adverbe ?</h2>
  <p>Adjectifs (accordés, devant un nom) : molti libri, poche idee. Adverbes (invariables, devant un adjectif) : molto bello, troppo stanco.</p>
  <h2>L'interrogation</h2>
  <p>Pas d'inversion sujet-verbe : Parli italiano? Mots interrogatifs courants : che/cosa, chi, come, dove, quando, perché, quanto (qui s'accorde, contrairement au français).</p>
  <h2>Orthographe : les sons c et g</h2>
  <p>La lettre suivante décide de la prononciation, et le h sert à « durcir » : ca/co/cu/che/chi = [k] dur (casa, perché), ce/ci = [tch] doux (cena, ciao), ga/go/gu/ghe/ghi = [g] dur (gatto, ghiaccio), ge/gi = [dj] doux (gelato, giorno), gn comme dans agneau (gnocchi, bagno), gli « l mouillé » (famiglia), sce/sci = [ch] (pesce, sciare).</p>
  <h2>Orthographe : consonnes doubles et accents</h2>
  <p>Les consonnes doubles se prononcent réellement plus longues et changent le sens (pala/palla, caro/carro, sono/sonno). L'accent écrit n'apparaît que sur la voyelle finale (città, però, caffè) et distingue des mots courts (è/e, là/la, sì/si, dà/da). L'élision se marque par l'apostrophe devant voyelle (l'amico, un'ora, c'è). Le h est toujours muet, sauf à l'écrit de avere (ho, hai, ha, hanno).</p>
  <p>Explorez les <a href="/textes">textes gradués</a>, la liste des <a href="/verbi">verbes avec conjugaison complète</a> et le <a href="/dizionario">dictionnaire</a>.</p>`
    )
  } else if (STATIC_PAGE_CONTENT[route.path]) {
    html = withBody(html, renderStaticContent(STATIC_PAGE_CONTENT[route.path], route.path))
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

    const extraHead =
      jsonLd({
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
      }) +
      breadcrumbJsonLd([
        { name: 'Leggendo', url: SITE_URL },
        { name: 'Classici', url: `${SITE_URL}/classici` },
        { name: manifest.title, url: `${SITE_URL}/classici/${b.id}/${manifest.chapters[0].id}` },
        { name: chapter.title, url: canonical },
      ])

    let html = patchHead(template, { title, description, canonical, extraHead, ogType: 'article' })

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
    <p>Ce chapitre fait partie du catalogue Classici complet, ouvert à tous les membres : créez un compte gratuit pour lire la suite.</p>
    <p><a href="/connexion">Créer mon compte gratuit</a> · <a href="/abonnement">Pourquoi c'est gratuit</a></p>
  </div>`
    }

    html = withBody(html, bodyContent + '\n  ' + chapterBlock(b, manifest, chapter))
    writeRoute(`/classici/${b.id}/${chapter.id}`, html)
    count++
  })
}

// --- Dictionnaire : /dizionario/<lemma> (premier lot, voir dictionaryPages.js) ---
for (const entry of getSeoDictionaryEntries()) {
  const canonical = `${SITE_URL}/dizionario/${encodeURIComponent(entry.lemma)}`
  const title = `${entry.lemma} en italien : traduction, définition et exemples — Leggendo`
  const description = `« ${entry.lemma} » (${entry.pos}) : ${entry.fr}. Définition, exemples et conjugaison sur Leggendo.`

  const extraHead =
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'DefinedTerm',
      name: entry.lemma,
      description: entry.definition_it,
      inDefinedTermSet: `${SITE_URL}/dizionario`,
      url: canonical,
    }) +
    breadcrumbJsonLd([
      { name: 'Leggendo', url: SITE_URL },
      { name: 'Dizionario', url: `${SITE_URL}/dizionario` },
      { name: entry.lemma, url: canonical },
    ])

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
    `<p><a href="/dizionario">← Dizionario</a></p>
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

  const extraHead = breadcrumbJsonLd([
    { name: 'Leggendo', url: SITE_URL },
    { name: 'Verbi', url: `${SITE_URL}/verbi` },
    { name: lemma, url: canonical },
  ])
  const html = patchHead(template, { title, description, canonical, extraHead })
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

// --- Page 404 : servie par le Caddyfile (handle_errors / respond 404, voir
// Caddyfile à la racine) pour les vraies URL inexistantes ; la route Vue « not-found » gère le cas
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

  const extraHead =
    jsonLd({
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
    }) +
    breadcrumbJsonLd([
      { name: 'Leggendo', url: SITE_URL },
      { name: 'Tous les textes', url: `${SITE_URL}/textes` },
      { name: t.title, url: canonical },
    ])

  let html = patchHead(template, { title, description, canonical, extraHead, ogType: 'article' })

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
    <p>Ce texte fait partie du catalogue complet, ouvert à tous les membres : créez un compte gratuit pour le lire.</p>
    <p><a href="/connexion">Créer mon compte gratuit</a> · <a href="/abonnement">Pourquoi c'est gratuit</a></p>
  </div>`
  }

  html = withBody(html, bodyContent + '\n  ' + relatedBlock(t))
  writeRoute(`/testo/${t.id}`, html)
  count++
}

console.log(`✓ ${count} pages prérendues dans dist/`)
