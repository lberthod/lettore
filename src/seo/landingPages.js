// Pages « par niveau » (GPTanalyse.md, § 10 « Créer des pages par niveau et
// par intention ») — les 4 pages explicitement citées en priorité par le
// document : A1, A2, B1, B2. Les pages « par intention »
// (italien-pour-debutants, histoires-courtes-italien...) demandent un choix
// éditorial qui dépasse une décision technique et sont laissées pour un lot
// ultérieur, une fois ces 4 pages mesurées (voir le plan d'implémentation).
//
// Module Node-safe (pas d'API navigateur) : importé à la fois par
// src/views/LevelLandingView.vue (client) et par scripts/generate-sitemap.mjs
// / scripts/prerender.mjs (Node) — même source pour éviter toute divergence
// entre l'app et le prérendu (voir GPTanalyse.md, § « Architecture SEO
// recommandée »).

export const LEVEL_LANDING_PAGES = [
  {
    path: '/textes-italien-a1',
    level: 'A1',
    title: 'Textes italiens A1 pour débutants — lecture avec traduction — Leggendo',
    description:
      "Des textes courts en italien niveau A1 (débutant complet), avec traduction française au clic et lecture audio — pour commencer à lire sans se décourager.",
    heading: 'Textes italiens A1 — débuter par la lecture',
    audience:
      "Pour qui débute l'italien, ou vient de finir les toutes premières bases (salutations, présent de l'indicatif, vocabulaire du quotidien).",
    difficulties:
      "La difficulté à ce niveau vient du nombre de mots encore inconnus, pas de la grammaire : les phrases restent courtes et simples, essentiellement au présent.",
    order:
      "Commencez par les textes les plus courts (moins de 100 mots), puis allongez progressivement — la régularité compte plus que la longueur d'un seul texte.",
  },
  {
    path: '/textes-italien-a2',
    level: 'A2',
    title: 'Textes italiens A2 élémentaire — lecture avec traduction — Leggendo',
    description:
      "Des textes en italien niveau A2 (élémentaire) : petites histoires du quotidien, premiers passés composés, avec traduction française au clic et audio.",
    heading: 'Textes italiens A2 — consolider les bases',
    audience:
      "Pour qui a déjà les bases de l'italien (présent, vocabulaire courant) et veut lire des histoires un peu plus longues, avec un peu de passé.",
    difficulties:
      "Les temps du passé (passato prossimo, imperfetto) apparaissent progressivement ; le vocabulaire s'élargit à des situations concrètes (voyages, travail, famille).",
    order:
      "Alternez récits et dialogues pour varier les tournures ; relire un texte déjà lu au niveau A1 aide à mesurer les progrès.",
  },
  {
    path: '/textes-italien-b1',
    level: 'B1',
    title: 'Textes italiens B1 intermédiaire — lecture avec traduction — Leggendo',
    description:
      "Des textes en italien niveau B1 (intermédiaire) : récits et textes culturels plus riches, temps du passé variés, traduction française au clic.",
    heading: 'Textes italiens B1 — lire des récits complets',
    audience:
      "Pour qui comprend déjà des textes simples et veut passer à des récits plus longs, avec plus de nuances de temps et de vocabulaire.",
    difficulties:
      "Les temps du passé se combinent (passato prossimo, imperfetto, parfois passé simple dans les récits), et le vocabulaire devient plus abstrait.",
    order:
      "Privilégiez les textes qui vous intéressent réellement (voyages, culture, société) : à ce niveau, la motivation du sujet compte autant que la difficulté.",
  },
  {
    path: '/textes-italien-b2',
    level: 'B2',
    title: 'Textes italiens B2 avancé — lecture avec traduction — Leggendo',
    description:
      "Des textes en italien niveau B2 (avancé) : textes longs et complexes, passé simple, subjonctif, vocabulaire abstrait, traduction française au clic.",
    heading: 'Textes italiens B2 — lire comme un locuteur avancé',
    audience:
      "Pour qui lit déjà couramment des récits simples et veut aborder des textes proches de ceux écrits pour des locuteurs natifs.",
    difficulties:
      "Passé simple, subjonctif, vocabulaire abstrait et tournures idiomatiques apparaissent plus souvent ; les textes sont plus longs.",
    order:
      "À ce niveau, la lecture régulière (10-20 minutes par jour) prime sur la difficulté du texte choisi : le volume cumulé fait la différence.",
  },
]

export function findLevelLandingPage(level) {
  return LEVEL_LANDING_PAGES.find((p) => p.level === level)
}

// Sélection éditoriale de `count` textes du niveau demandé, répartis entre
// catégories pour varier les thèmes plutôt que d'empiler un seul genre —
// plus utile qu'une simple liste brute (GPTanalyse.md, § 10).
export function pickFeaturedTexts(textsIndex, level, count = 20) {
  const byCategory = new Map()
  for (const t of textsIndex) {
    if (t.level !== level) continue
    if (!byCategory.has(t.category)) byCategory.set(t.category, [])
    byCategory.get(t.category).push(t)
  }
  const categories = [...byCategory.keys()]
  const featured = []
  let i = 0
  while (featured.length < count && categories.some((c) => byCategory.get(c).length)) {
    const cat = categories[i % categories.length]
    const bucket = byCategory.get(cat)
    if (bucket.length) featured.push(bucket.shift())
    i++
  }
  return featured
}
