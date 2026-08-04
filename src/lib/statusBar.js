import { isNativeApp } from './platform.js'

// Thème la barre de statut Android au fond crème de l'app (cohérent avec
// `theme-color` dans index.html) plutôt que de laisser le noir/gris par
// défaut. Voir « Optimisation Mobile.md » Phase 3 Sprint 3.1.
export async function initStatusBar() {
  if (!isNativeApp) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setBackgroundColor({ color: '#faf6f0' })
    await StatusBar.setStyle({ style: Style.Light })
  } catch {
    // Plugin indisponible sur cette plateforme (ex. iOS ignore
    // setBackgroundColor) : pas bloquant.
  }
}
