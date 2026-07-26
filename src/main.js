import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import { getAnalyticsInstance } from './lib/firebase.js'
import { onIdle } from './lib/idle.js'
import './style.css'

createApp(App).use(router).mount('#app')

// Firebase Analytics : production uniquement (évite le bruit et les erreurs de
// mesure en développement local) et à l'inactivité — la mesure n'affiche rien,
// elle n'a pas à disputer la bande passante au premier rendu.
//
// Import statique de firebase.js et non `import()` : le module est de toute
// façon dans le bundle d'entrée (le routeur en dépend), et l'importer aussi
// dynamiquement empêchait Rollup de le déplacer — d'où l'avertissement
// « dynamically imported but also statically imported » au build. Seul le SDK
// Firebase lui-même est chargé à la demande, depuis firebase.js.
if (import.meta.env.PROD) {
  onIdle(() => getAnalyticsInstance())
}
