import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import textsIndex from './texts/index.json'
import { currentUser, authReady } from './lib/auth.js'
import { firebaseReady } from './lib/firebase.js'

const DEFAULT_TITLE = "Leggendo — Apprendre l'italien par la lecture"
const DEFAULT_DESCRIPTION =
  "Apprenez l'italien en lisant : textes gradués A1 à C1 avec traduction française au clic et lecture audio. Méthode fondée sur la lecture extensive."

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: {
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
      },
    },
    {
      path: '/textes',
      name: 'library',
      component: () => import('./views/LibraryView.vue'),
      meta: {
        title: 'Tous les textes — Leggendo',
        description:
          "Tous les textes gradués en italien, de A1 à B2 : histoires courtes, culture, voyages. Traduction française au clic et lecture audio.",
      },
    },
    {
      path: '/testo/:id',
      name: 'reader',
      // Chargée à la demande : la page d'accueil n'embarque pas le lecteur
      component: () => import('./views/ReaderView.vue'),
      props: true,
      beforeEnter: (to) => {
        // Si le texte n'existe pas, retour à la bibliothèque
        if (!textsIndex.some((t) => t.id === to.params.id)) {
          return { name: 'library' }
        }
      },
    },
    {
      path: '/a-propos',
      name: 'about',
      component: () => import('./views/AboutView.vue'),
      meta: {
        title: 'À propos — Leggendo',
        description:
          "Leggendo : un lecteur interactif pour apprendre l'italien par la lecture, développé en Suisse. Textes gradués, traduction française, audio.",
      },
    },
    {
      path: '/methode',
      name: 'method',
      component: () => import('./views/MethodView.vue'),
      meta: {
        title: "La méthode : apprendre l'italien par la lecture — Leggendo",
        description:
          "Lecture extensive, textes gradués, traduction au clic : la méthode de Leggendo expliquée, avec les recherches scientifiques qui la valident.",
      },
    },
    {
      path: '/methodologie',
      name: 'method-text',
      component: () => import('./views/MethodTextView.vue'),
      meta: {
        title: "La méthodologie expliquée : l'italien par la lecture — Leggendo",
        description:
          "La méthode de Leggendo expliquée en détail par écrit : lecture extensive, zone idéale i+1, traduction au clic, audio et répétition en contexte.",
      },
    },
    {
      path: '/contact',
      name: 'contact',
      component: () => import('./views/ContactView.vue'),
      meta: { title: 'Contact — Leggendo' },
    },
    {
      path: '/abonnement',
      name: 'pricing',
      component: () => import('./views/PricingView.vue'),
      meta: {
        title: 'Abonnement — Leggendo',
        description:
          "Accédez à tous les textes gradués en italien avec traduction française et audio. Découvrez les formules d'abonnement de Leggendo.",
      },
    },
    {
      path: '/connexion',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
      meta: { title: 'Connexion — Leggendo' },
    },
    {
      path: '/profil',
      name: 'profile',
      component: () => import('./views/ProfileView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/mentions-legales',
      name: 'legal',
      component: () => import('./views/LegalView.vue'),
      meta: { title: 'Mentions légales — Leggendo' },
    },
    {
      path: '/confidentialite',
      name: 'privacy',
      component: () => import('./views/PrivacyView.vue'),
      meta: { title: 'Confidentialité — Leggendo' },
    },
    {
      path: '/conditions',
      name: 'terms',
      component: () => import('./views/TermsView.vue'),
      meta: { title: 'CGU / CGV — Leggendo' },
    },
    {
      path: '/parole',
      name: 'words',
      component: () => import('./views/WordsView.vue'),
      meta: { title: 'Mes mots — Leggendo' },
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
})

export default router
