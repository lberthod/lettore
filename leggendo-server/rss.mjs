// Récupération d'actualités italiennes via RSS — pas de dépendance npm
// (extraction par regex, suffisante pour du RSS 2.0 standard). Utilisé par
// news-cron.mjs pour la formule Premium+ (voir PREMIUM_PLUS_ANALYSIS.md, §4 :
// RSS choisi plutôt qu'une API news payante, pour rester en italien natif et
// éviter tout coût récurrent).

// Flux généralistes ANSA — pas de clé API requise.
export const RSS_FEEDS = [
  'https://www.ansa.it/sito/ansait_rss.xml',
  'https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml',
  'https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml',
]

function decodeEntities(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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

export async function fetchFeed(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Leggendo/1.0 (+https://leggendo-dbb84.web.app)' },
  })
  if (!res.ok) throw new Error(`Flux RSS ${url} : HTTP ${res.status}`)
  const xml = await res.text()
  return parseRss(xml)
}

// Agrège plusieurs flux, filtre les entrées sans titre/description exploitable,
// dédoublonne par lien.
export async function fetchAllFeeds(urls = RSS_FEEDS) {
  const results = await Promise.allSettled(urls.map(fetchFeed))
  const seen = new Set()
  const items = []
  for (const r of results) {
    if (r.status !== 'fulfilled') {
      console.warn('  ⚠ flux RSS indisponible :', r.reason?.message || r.reason)
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
