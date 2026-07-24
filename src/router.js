import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import textsIndex from './texts/index.json'
import { currentUser, authReady } from './lib/auth.js'
import { firebaseReady } from './lib/firebase.js'
import { EXAMPLE_TEXT_IDS, isAdmin } from './lib/access.js'
import { SITE_URL, DEFAULT_TITLE, DEFAULT_DESCRIPTION, findRoute } from './seo/staticPages.js'

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
        const inCatalog = textsIndex.some((t) => t.id === to.params.id)
        // Hors catalogue : peut être un texte créé par l'utilisateur
        // (chargé depuis Firestore par le lecteur) → connexion requise ;
        // le lecteur renvoie vers la bibliothèque s'il n'existe pas.
        // Les textes du catalogue hors aperçu sont réservés aux connectés.
        if (
          firebaseReady &&
          (!inCatalog || !EXAMPLE_TEXT_IDS.includes(to.params.id))
        ) {
          await authReady
          if (!currentUser.value) {
            return { name: 'login', query: { redirect: to.fullPath } }
          }
        }
        if (!inCatalog && !firebaseReady) {
          return { name: 'library' }
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

router.afterEach((to) => {
  let title = to.meta.title
  let description = to.meta.description

  // Le lecteur : titre et description tirés de l'index des textes
  if (to.name === 'reader') {
    const text = textsIndex.find((t) => t.id === to.params.id)
    if (text) {
      title = `${text.title} — texte en italien ${text.level} avec traduction française`
      description = `« ${text.excerpt} » — Lisez ce texte en italien (niveau ${text.level}, ~${text.wordCount} mots) avec traduction française au clic et lecture audio.`
    }
  }

  document.title = title || DEFAULT_TITLE
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', description || DEFAULT_DESCRIPTION)

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
