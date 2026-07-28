import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
// Seuls les identifiants, pas le catalogue complet : le routeur est dans le
// bundle d'entrée (voir le plugin leggendo-catalog dans vite.config.js).
import { catalogIds } from 'virtual:catalog'
import { currentUser, authReady } from './lib/auth.js'
import { firebaseReady } from './lib/firebase.js'
import { isAdmin } from './lib/access.js'
import { SITE_URL, DEFAULT_TITLE, DEFAULT_DESCRIPTION, findRoute } from './seo/staticPages.js'
import { LEVEL_LANDING_PAGES } from './seo/landingPages.js'
import { trackPageView } from './lib/analytics.js'

const catalogIdSet = new Set(catalogIds)

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: findRoute('/'),
    },
    {
      path: '/textes',
      name: 'library',
      component: () => import('./views/LibraryView.vue'),
      meta: findRoute('/textes'),
    },
    {
      path: '/testo/:id',
      name: 'reader',
      // Chargée à la demande : la page d'accueil n'embarque pas le lecteur
      component: () => import('./views/ReaderView.vue'),
      props: true,
      beforeEnter: async (to) => {
        // Texte du catalogue : toujours accessible, connecté ou non — les
        // métadonnées publiques (titre, niveau, extrait) et un paywall
        // s'affichent si le rôle ne permet pas la lecture complète (voir
        // ReaderView.vue, qui traite le refus de Firestore comme un état
        // d'affichage, pas comme une redirection). Bon pour le SEO : Google
        // et tout visiteur anonyme voient une vraie page, jamais /connexion.
        if (catalogIdSet.has(to.params.id)) return
        if (!firebaseReady) return { name: 'not-found' }
        // Hors catalogue (texte créé par un utilisateur, actualité) :
        // connexion requise ; le rôle exact reste vérifié par les règles
        // Firestore (ex. Notizie réservé à premium_plus/enseignant).
        await authReady
        if (!currentUser.value) {
          return { name: 'login', query: { redirect: to.fullPath } }
        }
      },
    },
    {
      path: '/classici',
      name: 'books',
      component: () => import('./views/BooksView.vue'),
      meta: findRoute('/classici'),
    },
    {
      path: '/classici/:bookId/:chapterId',
      name: 'book-reader',
      component: () => import('./views/BookReaderView.vue'),
      props: true,
      // Chapitre Classici : toujours accessible, comme /testo/:id ci-dessus —
      // BookReaderView affiche les métadonnées publiques (titre, auteur,
      // niveau) et un paywall quand la lecture complète n'est pas autorisée.
    },
    {
      path: '/condividi/:id',
      name: 'shared-text',
      // Lecture publique d'un texte créé et partagé (formule Enseignant) :
      // aucun compte requis, les règles Firestore autorisent la lecture des
      // documents marqués `public: true`.
      component: () => import('./views/ReaderView.vue'),
      props: true,
      meta: { title: 'Texte partagé — Leggendo' },
    },
    ...LEVEL_LANDING_PAGES.map((p) => ({
      path: p.path,
      name: `level-${p.level.toLowerCase()}`,
      component: () => import('./views/LevelLandingView.vue'),
      props: { level: p.level },
      meta: findRoute(p.path),
    })),
    {
      path: '/a-propos',
      name: 'about',
      component: () => import('./views/AboutView.vue'),
      meta: findRoute('/a-propos'),
    },
    {
      path: '/methode',
      name: 'method',
      component: () => import('./views/MethodView.vue'),
      meta: findRoute('/methode'),
    },
    {
      path: '/methodologie',
      name: 'method-text',
      component: () => import('./views/MethodTextView.vue'),
      meta: findRoute('/methodologie'),
    },
    {
      path: '/contact',
      name: 'contact',
      component: () => import('./views/ContactView.vue'),
      meta: findRoute('/contact'),
    },
    {
      path: '/abonnement',
      name: 'pricing',
      component: () => import('./views/PricingView.vue'),
      meta: findRoute('/abonnement'),
    },
    {
      path: '/connexion',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
      meta: findRoute('/connexion'),
    },
    {
      path: '/profil',
      name: 'profile',
      component: () => import('./views/ProfileView.vue'),
      meta: { ...findRoute('/profil'), requiresAuth: true },
    },
    {
      path: '/mentions-legales',
      name: 'legal',
      component: () => import('./views/LegalView.vue'),
      meta: findRoute('/mentions-legales'),
    },
    {
      path: '/confidentialite',
      name: 'privacy',
      component: () => import('./views/PrivacyView.vue'),
      meta: findRoute('/confidentialite'),
    },
    {
      path: '/conditions',
      name: 'terms',
      component: () => import('./views/TermsView.vue'),
      meta: findRoute('/conditions'),
    },
    {
      path: '/creer-son-texte',
      name: 'create-text',
      component: () => import('./views/CreateTextView.vue'),
      meta: { ...findRoute('/creer-son-texte'), requiresAuth: true },
    },
    {
      path: '/notizie',
      name: 'news',
      component: () => import('./views/NotizieView.vue'),
      meta: {
        title: 'Notizie — Leggendo',
        description:
          "Textes d'actualité italienne générés chaque jour et adaptés à votre niveau — formule Premium+.",
        requiresAuth: true,
      },
    },
    {
      path: '/mes-textes',
      name: 'my-texts',
      component: () => import('./views/MyTextsView.vue'),
      meta: { ...findRoute('/mes-textes'), requiresAuth: true },
    },
    {
      path: '/parole',
      name: 'words',
      component: () => import('./views/WordsView.vue'),
      meta: { ...findRoute('/parole'), requiresAuth: true },
    },
    {
      path: '/vocabolario',
      name: 'vocabulary',
      component: () => import('./views/VocabularyView.vue'),
      meta: { ...findRoute('/vocabolario'), requiresAuth: true },
    },
    {
      path: '/dizionario/:word?',
      name: 'dictionary',
      component: () => import('./views/DictionaryView.vue'),
      props: true,
      meta: {
        title: 'Dizionario — Leggendo',
        description:
          'Dictionnaire italien-français : définition, nature grammaticale, exemples et conjugaison pour chaque mot.',
      },
    },
    {
      path: '/coniugazione/:verbo',
      name: 'conjugation',
      component: () => import('./views/ConjugationView.vue'),
      props: true,
      meta: {
        title: 'Coniugazione — Leggendo',
        description: 'Tableau de conjugaison complet des verbes italiens.',
      },
    },
    {
      path: '/verbi',
      name: 'verbs',
      component: () => import('./views/VerbsView.vue'),
      meta: {
        title: 'Verbi italiani — Leggendo',
        description: 'Tous les verbes italiens du dictionnaire, avec leur table de conjugaison complète.',
      },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('./views/AdminView.vue'),
      meta: { ...findRoute('/admin'), requiresAuth: true },
      beforeEnter: async () => {
        await authReady
        if (!isAdmin()) return { name: 'home' }
      },
    },
    {
      path: '/admin/mots',
      name: 'admin-words',
      component: () => import('./views/AdminWordsView.vue'),
      meta: { ...findRoute('/admin/mots'), requiresAuth: true },
      beforeEnter: async () => {
        await authReady
        if (!isAdmin()) return { name: 'home' }
      },
    },
    {
      path: '/admin/textes',
      name: 'admin-texts',
      component: () => import('./views/AdminTextsView.vue'),
      meta: { ...findRoute('/admin/textes'), requiresAuth: true },
      beforeEnter: async () => {
        await authReady
        if (!isAdmin()) return { name: 'home' }
      },
    },
    {
      path: '/admin/dizionario',
      name: 'admin-dictionary',
      component: () => import('./views/AdminDictionaryView.vue'),
      meta: { ...findRoute('/admin/dizionario'), requiresAuth: true },
      beforeEnter: async () => {
        await authReady
        if (!isAdmin()) return { name: 'home' }
      },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('./views/NotFoundView.vue'),
      meta: {
        title: 'Page introuvable — Leggendo',
        description: "Cette page n'existe pas ou plus.",
        noindex: true,
      },
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth || !firebaseReady) return
  // Attendre que Firebase ait restauré la session avant de décider
  await authReady
  if (!currentUser.value) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
})

function setMeta(title, description) {
  document.title = title || DEFAULT_TITLE
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', description || DEFAULT_DESCRIPTION)
}

// Le lecteur : titre et description tirés de l'index des textes. L'index
// complet (127 kB) est chargé à la demande — il n'entre pas dans le bundle
// d'entrée, et le chunk est de toute façon déjà demandé par ReaderView, qui
// l'importe pour la navigation entre textes. La page prérendue porte déjà les
// bonnes balises : cette mise à jour ne sert qu'à la navigation interne.
async function applyReaderMeta(to) {
  const { default: textsIndex } = await import('./texts/index.json')
  const text = textsIndex.find((t) => t.id === to.params.id)
  // Une autre navigation a pu aboutir pendant le chargement : ne pas écraser
  // le titre de la page réellement affichée.
  if (!text || router.currentRoute.value.fullPath !== to.fullPath) return
  setMeta(
    `${text.title} — texte en italien ${text.level} avec traduction française`,
    `« ${text.excerpt} » — Lisez ce texte en italien (niveau ${text.level}, ~${text.wordCount} mots) avec traduction française au clic et lecture audio.`
  )
}

router.afterEach((to) => {
  setMeta(to.meta.title, to.meta.description)
  if (to.name === 'reader') applyReaderMeta(to)
  // Analytics ne collecte pas automatiquement les navigations d'une SPA (pas
  // de rechargement de page) — seule la toute première vue peut être comptée
  // deux fois (collecte automatique du SDK + cet appel) : à vérifier en
  // GA4 DebugView (voir GPTanalyse.md, § 5).
  trackPageView(to.path, to.meta.title || DEFAULT_TITLE)

  // URL canonique : évite le contenu dupliqué (query strings, redirections)
  // et donne aux moteurs une adresse stable même si le domaine de dev diffère.
  let canonical = document.querySelector('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.appendChild(canonical)
  }
  canonical.setAttribute('href', `${SITE_URL}${to.path}`)

  // Pages privées (compte, admin…) : jamais indexées.
  let robotsTag = document.querySelector('meta[name="robots"]')
  if (to.meta.requiresAuth || to.meta.noindex) {
    if (!robotsTag) {
      robotsTag = document.createElement('meta')
      robotsTag.setAttribute('name', 'robots')
      document.head.appendChild(robotsTag)
    }
    robotsTag.setAttribute('content', 'noindex, nofollow')
  } else if (robotsTag) {
    robotsTag.remove()
  }
})

export default router
