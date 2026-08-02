// Récupération d'actualités multi-pays via RSS — pas de dépendance npm
// (extraction par regex, suffisante pour du RSS 2.0 standard). Utilisé par
// news-cron.mjs pour la formule Premium+ : RSS choisi plutôt qu'une API news
// payante, pour rester gratuit/légal et sans clé API à gérer.
//
// Chaque source est un flux officiel d'un média public ou d'une agence de
// presse, gratuit et sans authentification. Le champ `language` indique la
// langue du flux source (le texte généré, lui, est toujours en italien —
// voir news.mjs qui traduit + reformule les sources non italiennes).

export const SOURCES = [
  // --- Italia — ANSA (agence de presse nationale) ---
  { id: 'ansa-cronaca', country: 'it', language: 'it', category: 'cronaca', label: 'ANSA', url: 'https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml' },
  { id: 'ansa-politica', country: 'it', language: 'it', category: 'politica', label: 'ANSA', url: 'https://www.ansa.it/sito/notizie/politica/politica_rss.xml' },
  { id: 'ansa-economia', country: 'it', language: 'it', category: 'economia', label: 'ANSA', url: 'https://www.ansa.it/sito/notizie/economia/economia_rss.xml' },
  { id: 'ansa-mondo', country: 'it', language: 'it', category: 'mondo', label: 'ANSA', url: 'https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml' },
  { id: 'ansa-tecnologia', country: 'it', language: 'it', category: 'tecnologia', label: 'ANSA', url: 'https://www.ansa.it/sito/notizie/tecnologia/tecnologia_rss.xml' },
  { id: 'ansa-sport', country: 'it', language: 'it', category: 'sport', label: 'ANSA', url: 'https://www.ansa.it/sito/notizie/sport/sport_rss.xml' },
  { id: 'ansa-cultura', country: 'it', language: 'it', category: 'cultura', label: 'ANSA', url: 'https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml' },

  // --- Svizzera — laRegione.ch (quotidien tessinois, rédaction italophone) ---
  { id: 'laregione-ticino', country: 'ch', language: 'it', category: 'cronaca', label: 'laRegione', url: 'https://media.laregione.ch/files/domains/laregione.ch/rss/rss_ticino.xml' },
  { id: 'laregione-svizzera', country: 'ch', language: 'it', category: 'politica', label: 'laRegione', url: 'https://media.laregione.ch/files/domains/laregione.ch/rss/rss_svizzera.xml' },
  { id: 'laregione-estero', country: 'ch', language: 'it', category: 'mondo', label: 'laRegione', url: 'https://media.laregione.ch/files/domains/laregione.ch/rss/rss_estero.xml' },
  { id: 'laregione-cultura', country: 'ch', language: 'it', category: 'cultura', label: 'laRegione', url: 'https://media.laregione.ch/files/domains/laregione.ch/rss/rss_culture.xml' },
  { id: 'laregione-economia', country: 'ch', language: 'it', category: 'economia', label: 'laRegione', url: 'https://media.laregione.ch/files/domains/laregione.ch/rss/rss_economia.xml' },

  // --- Francia — France Info (service public, francetvinfo.fr) ---
  { id: 'francetvinfo-politique', country: 'fr', language: 'fr', category: 'politica', label: 'France Info', url: 'https://www.francetvinfo.fr/politique.rss' },
  { id: 'francetvinfo-economie', country: 'fr', language: 'fr', category: 'economia', label: 'France Info', url: 'https://www.francetvinfo.fr/economie.rss' },
  { id: 'francetvinfo-culture', country: 'fr', language: 'fr', category: 'cultura', label: 'France Info', url: 'https://www.francetvinfo.fr/culture.rss' },
  { id: 'francetvinfo-sports', country: 'fr', language: 'fr', category: 'sport', label: 'France Info', url: 'https://www.francetvinfo.fr/sports.rss' },
  { id: 'francetvinfo-monde', country: 'fr', language: 'fr', category: 'mondo', label: 'France Info', url: 'https://www.francetvinfo.fr/monde.rss' },
]

export const COUNTRIES = ['it', 'ch', 'fr']
export const CATEGORIES = ['cronaca', 'politica', 'economia', 'mondo', 'tecnologia', 'sport', 'cultura']

function decodeEntities(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Entités numériques (&#233; / &#xE9;) : fréquentes dans les flux non
    // italiens (France Info échappe systématiquement les caractères
    // accentués), absentes des flux ANSA d'origine — d'où leur oubli initial.
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/<[^>]+>/g, ' ') // retire les balises HTML résiduelles (description en HTML)
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? decodeEntities(m[1]) : ''
}

// Parse minimal d'un flux RSS 2.0 : renvoie {title, description, link, pubDate}.
export function parseRss(xml) {
  const items = xml.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || []
  return items.map((block) => ({
    title: extractTag(block, 'title'),
    description: extractTag(block, 'description'),
    link: extractTag(block, 'link'),
    pubDate: extractTag(block, 'pubDate'),
  }))
}

export async function fetchFeed(source) {
  const res = await fetch(source.url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Leggendo/1.0 (+https://leggendo-dbb84.web.app)' },
  })
  if (!res.ok) throw new Error(`Flux RSS ${source.url} : HTTP ${res.status}`)
  const xml = await res.text()
  return parseRss(xml).map((item) => ({
    ...item,
    country: source.country,
    language: source.language,
    category: source.category,
    sourceName: source.label,
  }))
}

// Agrège toutes les sources, filtre les entrées sans titre/description
// exploitable, dédoublonne par lien. Chaque item porte country/category/
// language/sourceName hérités de sa source.
export async function fetchAllFeeds(sources = SOURCES) {
  const results = await Promise.allSettled(sources.map(fetchFeed))
  const seen = new Set()
  const items = []
  for (const [i, r] of results.entries()) {
    if (r.status !== 'fulfilled') {
      console.warn(`  ⚠ flux RSS indisponible (${sources[i].id}) :`, r.reason?.message || r.reason)
      continue
    }
    for (const item of r.value) {
      if (!item.title || !item.description || seen.has(item.link)) continue
      seen.add(item.link)
      items.push(item)
    }
  }
  return items
}
