// Règles d'accès gratuit au catalogue, partagées entre le client
// (src/lib/access.js), le build PWA (vite.config.js) et le prérendu SEO
// (scripts/prerender.mjs). Module volontairement sans dépendance Vue/Firebase
// pour pouvoir tourner aussi bien dans le navigateur que sous Node — évite la
// triple duplication (et le risque de divergence) qui existait auparavant.

export const EXAMPLE_COUNT = 6

// Deux fables courtes en entier, et le premier chapitre de quelques livres
// plus longs, en aperçu gratuit pour tout utilisateur connecté
// (README_TARIFICATION.md) — reste réservé à Premium IA/Enseignant sinon.
export const FREE_CLASSICI_BOOK_IDS = ['cicala-formica', 'leone-topo']
export const FREE_CLASSICI_PREVIEW_BOOK_IDS = ['pinocchio', 'cenerentola', 'il-principe', 'mattia-pascal']

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
