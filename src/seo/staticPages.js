// Source unique des métadonnées de route (titre, description, indexation).
// Importé à la fois par le router (SPA, dans le navigateur) et par les
// scripts de build (scripts/generate-sitemap.mjs, scripts/prerender.mjs,
// exécutés par Node) — pour ne jamais laisser les deux dériver.
// Ce fichier ne doit dépendre d'aucune API navigateur (pas de `window` /
// `document`) : il doit pouvoir être importé tel quel côté Node.

import { LEVEL_LANDING_PAGES } from './landingPages.js'

export const SITE_URL = 'https://leggendo.fr'

export const DEFAULT_TITLE = "Leggendo — Apprendre l'italien par la lecture"
export const DEFAULT_DESCRIPTION =
  "Apprenez l'italien en lisant : textes gradués A1 à C2 avec traduction française au clic et lecture audio. Méthode fondée sur la lecture extensive."

// prerender : une page HTML statique avec le vrai contenu est générée au
// build (scripts/prerender.mjs) — réservé aux pages où l'on dispose du
// contenu sous forme de données (catalogue, textes). Pour les autres pages
// indexables, seul le <head> (titre/description/canonical) est corrigé.
// noindex : exclue du sitemap et marquée <meta name="robots" content="noindex">.
export const ROUTES = [
  {
    path: '/',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    prerender: true,
  },
  {
    path: '/textes',
    title: 'Tous les textes — Leggendo',
    description:
      "Tous les textes gradués en italien, de A1 à C2 : histoires courtes, culture, voyages. Traduction française au clic et lecture audio.",
    prerender: true,
  },
  {
    path: '/classici',
    title: 'Classici del dominio pubblico — Leggendo',
    description:
      "Œuvres classiques italiennes du domaine public, en texte authentique : Pinocchio, Il Principe, Rosso Malpelo, Inferno... Traduction française au clic et lecture audio.",
    prerender: true,
  },
  // Pages par niveau (GPTanalyse.md, § 10) : source unique dans
  // landingPages.js, réutilisée aussi par LevelLandingView.vue.
  ...LEVEL_LANDING_PAGES.map((p) => ({
    path: p.path,
    title: p.title,
    description: p.description,
    prerender: true,
  })),
  {
    path: '/methode',
    title: "La méthode : apprendre l'italien par la lecture — Leggendo",
    description:
      "Lecture extensive, textes gradués, traduction au clic : la méthode de Leggendo expliquée, avec les recherches scientifiques qui la valident.",
  },
  {
    path: '/methodologie',
    title: "La méthodologie expliquée : l'italien par la lecture — Leggendo",
    description:
      "La méthode de Leggendo expliquée en détail par écrit : lecture extensive, zone idéale i+1, traduction au clic, audio et répétition en contexte.",
  },
  {
    path: '/a-propos',
    title: 'À propos — Leggendo',
    description:
      "Leggendo : un lecteur interactif pour apprendre l'italien par la lecture, développé en Suisse. Textes gradués, traduction française, audio.",
  },
  { path: '/contact', title: 'Contact — Leggendo' },
  {
    path: '/abonnement',
    title: 'Abonnement — Leggendo',
    description:
      "Accédez à tous les textes gradués en italien avec traduction française et audio. Découvrez les formules d'abonnement de Leggendo.",
  },
  {
    path: '/verbi',
    title: 'Verbi italiani — Leggendo',
    description:
      'Tous les verbes italiens du dictionnaire, avec leur table de conjugaison complète.',
  },
  {
    path: '/grammatica',
    title: 'Grammatica — grammaire et orthographe italiennes — Leggendo',
    description:
      "L'essentiel de la grammaire italienne expliqué en français : articles, pluriels, prépositions articulées, pronoms, orthographe et accents.",
  },
  {
    path: '/test-de-niveau',
    title: "Test de niveau d'italien gratuit (A1 à C2) — Leggendo",
    description:
      "Testez votre niveau d'italien en quelques questions : test adaptatif qui s'ajuste à vos réponses pour estimer votre niveau CECR, de A1 à C2.",
  },
  { path: '/mentions-legales', title: 'Mentions légales — Leggendo' },
  { path: '/confidentialite', title: 'Confidentialité — Leggendo' },
  { path: '/conditions', title: 'CGU / CGV — Leggendo' },
  { path: '/connexion', title: 'Connexion — Leggendo', noindex: true },
  { path: '/profil', title: 'Profil — Leggendo', noindex: true },
  {
    path: '/creer-son-texte',
    title: 'Créer son texte — Leggendo',
    noindex: true,
  },
  { path: '/mes-textes', title: 'Mes textes créés — Leggendo', noindex: true },
  { path: '/parole', title: 'Mes mots — Leggendo', noindex: true },
  { path: '/vocabolario', title: 'Mode vocabulaire — Leggendo', noindex: true },
  { path: '/admin', title: 'Administration — Leggendo', noindex: true },
  {
    path: '/admin/mots',
    title: 'Administration · Mots — Leggendo',
    noindex: true,
  },
  {
    path: '/admin/textes',
    title: 'Administration · Textes — Leggendo',
    noindex: true,
  },
  {
    path: '/admin/dizionario',
    title: 'Administration · Dizionario — Leggendo',
    noindex: true,
  },
]

export function findRoute(path) {
  return ROUTES.find((r) => r.path === path)
}
