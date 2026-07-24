import { createApp } from 'vue'
import App from './App.vue'
import router from './router.js'
import './style.css'

createApp(App).use(router).mount('#app')

// Firebase Analytics : chargé après le montage, en production uniquement
// (évite le bruit et les erreurs de mesure en développement local).
if (import.meta.env.PROD) {
  import('./lib/firebase.js').then(({ getAnalyticsInstance }) =>
    getAnalyticsInstance()
  )
}
