// Règles d'accès gratuit au catalogue, partagées entre le client
// (src/lib/access.js), le build PWA (vite.config.js) et le prérendu SEO
// (scripts/prerender.mjs). Module volontairement sans dépendance Vue/Firebase
// pour pouvoir tourner aussi bien dans le navigateur que sous Node — évite la
// triple duplication (et le risque de divergence) qui existait auparavant.

export const EXAMPLE_COUNT = 6

// Un livre entier gratuit par niveau A2, B2 et C2 (README_TARIFICATION.md,
// § Classici), pour donner un aperçu complet à chaque palier de difficulté —
// les fables A1 (« cicala-formica », « leone-topo »…) restent gratuites de
// toute façon puisqu'elles n'ont qu'un seul chapitre, couvert par la règle du
// premier chapitre ci-dessous.
export const FREE_CLASSICI_BOOK_IDS = ['cenerentola', 'rosso-malpelo', 'il-principe']

// Premier chapitre de CHAQUE livre du catalogue, en aperçu gratuit pour tout
// utilisateur connecté (README_TARIFICATION.md) — le reste du livre reste
// réservé à Premium et au-dessus, sauf les livres entièrement gratuits
// ci-dessus. Liste explicite (plutôt qu'un import de books/index.json) pour
// garder ce module sans I/O, utilisable tel quel sous Node comme dans le
// navigateur (voir scripts/lib/free-content.mjs).
export const FREE_CLASSICI_PREVIEW_BOOK_IDS = [
  'pinocchio',
  'cappuccetto-rosso',
  'gatto-con-gli-stivali',
  'cenerentola',
  'bella-bestia',
  'cicala-formica',
  'colomba-formica',
  'leone-topo',
  'rosso-malpelo',
  'il-principe',
  'pollicino',
  'pelle-asino',
  'inferno',
  'figlia-del-re',
  'novelle-della-nonna',
  'mattia-pascal',
]

// Aperçu gratuit : `count` textes proposés aux visiteurs non connectés,
// échantillonnés sur tous les niveaux pour montrer la variété.
export function pickExampleTexts(textsIndex, count = EXAMPLE_COUNT) {
  const byLevel = {}
  for (const t of textsIndex) {
    ;(byLevel[t.level] ??= []).push(t)
  }
  const levels = Object.keys(byLevel).sort()
  const picks = []
  let i = 0
  while (picks.length < count) {
    let added = false
    for (const lv of levels) {
      const t = byLevel[lv][i]
      if (t) {
        picks.push(t)
        added = true
        if (picks.length === count) break
      }
    }
    if (!added) break
    i++
  }
  return picks
}

export function isFreeClassiciChapter(bookId, chapterId) {
  if (FREE_CLASSICI_BOOK_IDS.includes(bookId)) return true
  return FREE_CLASSICI_PREVIEW_BOOK_IDS.includes(bookId) && chapterId === '01'
}
