// État réseau global : un seul écouteur online/offline, partagé par toute
// l'application (bannière globale + messages d'erreur contextuels).

import { ref } from 'vue'

export const isOnline = ref(
  typeof navigator === 'undefined' || navigator.onLine !== false
)

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (isOnline.value = true))
  window.addEventListener('offline', () => (isOnline.value = false))
}

// Message uniforme pour les erreurs réseau (fetch/Firebase) rencontrées
// pendant la génération, l'authentification ou l'accès aux textes personnels.
export function isNetworkError(err) {
  if (!isOnline.value) return true
  const code = err?.code || ''
  const message = err?.message || ''
  return (
    code === 'auth/network-request-failed' ||
    code === 'unavailable' ||
    /network|fetch|failed to fetch/i.test(message)
  )
}

export function networkErrorMessage(err) {
  if (isNetworkError(err)) {
    return 'Connexion impossible — vérifiez votre accès internet et réessayez.'
  }
  return null
}
