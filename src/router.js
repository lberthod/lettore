import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
// Seuls les identifiants, pas le catalogue complet : le routeur est dans le
// bundle d'entrée (voir le plugin leggendo-catalog dans vite.config.js).
import { catalogIds } from 'virtual:catalog'
import { currentUser, authReady } from './lib/auth.js'
import { firebaseReady } from './lib/firebase.js'
import {
  EXAMPLE_TEXT_IDS,
  isAdmin,
  hasCatalogAccess,
  hasClassiciAccess,
  isFreeClassiciChapter,
} from './lib/access.js'
import { SITE_URL, DEFAULT_TITLE, DEFAULT_DESCRIPTION, findRoute } from './seo/staticPages.js'

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
        const inCatalog = catalogIdSet.has(to.params.id)
        const isExample = EXAMPLE_TEXT_IDS.includes(to.params.id)
        if (!firebaseReady) {
          if (!inCatalog) return { name: 'library' }
          return
        }
        // Aperçu gratuit : toujours accessible, même sans compte.
        if (inCatalog && isExample) return
        // Hors aperçu : connexion requise (texte du catalogue réservé aux
        // formules payantes, ou texte créé par l'utilisateur/actualité — le
        // lecteur et les règles Firestore gèrent ce dernier cas).
        await authReady
        if (!currentUser.value) {
          return { name: 'login', query: { redirect: to.fullPath } }
        }
        // Catalogue complet : réservé à Premium et au-dessus (README_TARIFICATION.md) —
        // un compte gratuit connecté ne suffit pas.
        if (inCatalog && !(await hasCatalogAccess())) {
          return { name: 'pricing', query: { redirect: to.fullPath } }
        }
      },
    },
    {
      path: '/classici',
      name: 'books',
      component: () => import('./views/BooksView.vue'),
      meta: { title: 'Classici del dominio pubblico — Leggendo' },
    },
    {
      path: '/classici/:bookId/:chapterId',
      name: 'book-reader',
      component: () => import('./views/BookReaderView.vue'),
      props: true,
      beforeEnter: async (to) => {
        if (!firebaseReady) return
        // Classici (Premium IA/Enseignant) : connexion requise, sauf aperçu
        // gratuit (deux livres entiers + premier chapitre de quelques autres).
        await authReady
        if (!currentUser.value) {
          return { name: 'login', query: { redirect: to.fullPath } }
        }
        if (isFreeClassiciChapter(to.params.bookId, to.params.chapterId)) return
        if (!(await hasClassiciAccess())) {
          return { name: 'pricing', query: { redirect: to.fullPath } }
        }
      },
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
    { path: '/:pathMatch(.*)*', redirect: '/' },
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
