import { isNativeApp } from './platform.js'
import router from '../router.js'

// Bouton retour matériel Android : sans gestion explicite, le comportement
// WebView par défaut est imprévisible (peut fermer l'app sans confirmation
// depuis l'accueil). Priorité à l'historique interne du routeur ; depuis
// l'accueil (rien à dépiler), un premier appui affiche un avertissement
// plutôt que de fermer directement — un second appui rapproché ferme
// l'app. Voir « Optimisation Mobile.md » Phase 1 Sprint 1.4.
const EXIT_WINDOW_MS = 2000
let lastBackPressAt = 0
let toastTimer = null

function showExitToast() {
  const el = document.createElement('div')
  el.textContent = 'Rappuyez pour quitter'
  el.setAttribute('role', 'status')
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: 'calc(env(safe-area-inset-bottom) + 4.2rem)',
    transform: 'translateX(-50%)',
    padding: '0.5rem 1rem',
    borderRadius: '999px',
    background: 'rgba(44, 38, 32, 0.88)',
    color: '#faf6f0',
    fontSize: '0.85rem',
    zIndex: 1000,
    pointerEvents: 'none',
  })
  document.body.appendChild(el)
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.remove(), EXIT_WINDOW_MS)
}

export async function initBackButton() {
  if (!isNativeApp) return
  const { App } = await import('@capacitor/app')
  App.addListener('backButton', () => {
    // Une modale ouverte (quiz, traduction…) intercepte déjà Échap/clic
    // extérieur côté composant ; ici on ne gère que la navigation d'écran.
    if (router.currentRoute.value.name === 'home' || window.history.state?.back == null) {
      const now = Date.now()
      if (now - lastBackPressAt < EXIT_WINDOW_MS) {
        App.exitApp()
      } else {
        lastBackPressAt = now
        showExitToast()
      }
      return
    }
    router.back()
  })
}
