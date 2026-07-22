import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import textsIndex from './texts/index.json'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/testo/:id',
      name: 'reader',
      // Chargée à la demande : la page d'accueil n'embarque pas le lecteur
      component: () => import('./views/ReaderView.vue'),
      props: true,
      beforeEnter: (to) => {
        // Si le texte n'existe pas, retour à l'accueil
        if (!textsIndex.some((t) => t.id === to.params.id)) {
          return { name: 'home' }
        }
      },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
