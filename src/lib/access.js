// `exampleTexts` plutôt que l'index complet : ce module est dans le bundle
// d'entrée (le routeur en dépend), et l'aperçu gratuit se calcule au build —
// voir le plugin leggendo-catalog dans vite.config.js.
import { exampleTexts } from 'virtual:catalog'
import { currentUser } from './auth.js'
import { firebaseReady } from './firebase.js'
import {
  EXAMPLE_COUNT,
  FREE_CLASSICI_BOOK_IDS,
  FREE_CLASSICI_PREVIEW_BOOK_IDS,
  isFreeClassiciChapter,
} from './catalogAccess.js'

export { EXAMPLE_COUNT, FREE_CLASSICI_BOOK_IDS, FREE_CLASSICI_PREVIEW_BOOK_IDS, isFreeClassiciChapter }

export const EXAMPLE_TEXTS = exampleTexts
export const EXAMPLE_TEXT_IDS = EXAMPLE_TEXTS.map((t) => t.id)

// Un visiteur est « connecté » soit réellement, soit lorsque Firebase n'est pas
// configuré (mode développement) — on ne peut alors pas verrouiller l'accès.
export function isLoggedIn() {
  return !firebaseReady || !!currentUser.value
}

// Compte administrateur unique — l'autorisation réelle est vérifiée côté
// serveur (Cloud Functions) sur l'e-mail du token, ceci ne sert qu'à afficher
// ou masquer l'accès à la page d'administration côté client.
export const ADMIN_EMAIL = 'lberthod@gmail.com'

export function isAdmin() {
  return currentUser.value?.email === ADMIN_EMAIL
}

// Dernier rôle connu, conservé par compte : hors ligne, la lecture du token
// peut échouer (renouvellement impossible) et l'utilisateur serait alors
// rétrogradé en « gratuit », ce qui ferait refuser par le routeur des textes
// pourtant déjà en cache. Ce repli est purement défensif côté interface :
// l'autorisation réelle reste vérifiée par les règles Firestore et les Cloud
// Functions, qui n'acceptent que les claims du token signé.
const ROLE_CACHE_PREFIX = 'leggendo:role:'
// Marqueur posé avant une redirection de paiement : au retour, les claims ont
// probablement changé et le token doit être renouvelé de force une fois.
const ROLE_REFRESH_KEY = 'leggendo:role-refresh'

function readCachedRole(uid) {
  try {
    return localStorage.getItem(ROLE_CACHE_PREFIX + uid) || null
  } catch {
    return null
  }
}

function writeCachedRole(uid, role) {
  try {
    localStorage.setItem(ROLE_CACHE_PREFIX + uid, role)
  } catch {
    // Stockage indisponible (navigation privée, quota) : sans cache, on garde
    // simplement le comportement en ligne.
  }
}

function hasPendingRoleRefresh() {
  try {
    return !!sessionStorage.getItem(ROLE_REFRESH_KEY)
  } catch {
    return false
  }
}

function clearPendingRoleRefresh() {
  try {
    sessionStorage.removeItem(ROLE_REFRESH_KEY)
  } catch {
    // rien à nettoyer si le stockage n'est pas accessible
  }
}

// À appeler juste avant une action qui change le rôle (redirection vers le
// paiement Stripe) : le prochain contrôle d'accès renouvellera le token de
// force pour voir les nouvelles claims sans attendre ni se reconnecter.
export function markRoleMayHaveChanged() {
  try {
    sessionStorage.setItem(ROLE_REFRESH_KEY, '1')
  } catch {
    // Sans sessionStorage, le rôle sera visible au prochain renouvellement
    // automatique du token par Firebase (moins d'une heure).
  }
}

function roleFromClaims(claims) {
  if (claims.role) return claims.role
  return claims.premium ? 'premium' : 'gratuit'
}

// Rôle réel de l'utilisateur, lu depuis les custom claims du token Firebase
// (posés par le webhook Stripe / adminSetUserRole — voir functions/index.js).
// On lit le token en cache : Firebase le renouvelle seul (~1 h), et un appel
// réseau à chaque contrôle d'accès casserait la navigation hors ligne. Le
// renouvellement forcé est réservé aux moments où le rôle vient réellement de
// changer (voir markRoleMayHaveChanged / refreshUserRole).
export async function getUserRole({ forceRefresh = false } = {}) {
  const user = currentUser.value
  if (!user) return 'gratuit'
  const force = forceRefresh || hasPendingRoleRefresh()
  try {
    const token = await user.getIdTokenResult(force)
    const role = roleFromClaims(token.claims)
    writeCachedRole(user.uid, role)
    if (force) clearPendingRoleRefresh()
    return role
  } catch {
    // Hors ligne : on retombe sur le dernier rôle connu de ce compte, et le
    // marqueur de renouvellement reste posé pour une prochaine tentative.
    return readCachedRole(user.uid) || 'gratuit'
  }
}

// Renouvellement explicite du token, après un changement de rôle avéré
// (paiement finalisé, rôle modifié depuis l'administration).
export function refreshUserRole() {
  return getUserRole({ forceRefresh: true })
}

// Hiérarchie des rôles (README_TARIFICATION.md) : un rôle supérieur inclut
// les droits du rôle précédent — gratuit < premium < premium_plus < enseignant.
// « Premium IA » est le nom commercial de `premium_plus` ; l'identifiant
// technique reste inchangé pour éviter une migration inutile.
export async function isPremiumPlus() {
  const role = await getUserRole()
  return role === 'premium_plus' || role === 'enseignant'
}

// Catalogue complet (README_TARIFICATION.md) : réservé à Premium et
// au-dessus — un compte gratuit connecté ne suffit pas (contrairement à
// l'ancien contrôle « connecté = débloqué »). En dev sans Firebase configuré,
// il n'y a pas de rôle à vérifier : on ne verrouille rien (comme isLoggedIn).
export async function hasCatalogAccess() {
  if (!firebaseReady) return true
  const role = await getUserRole()
  return role === 'premium' || role === 'premium_plus' || role === 'enseignant'
}

// Classiques adaptés (« Classici ») : réservés à Premium IA et Enseignant,
// comme les crédits de génération (voir README_TARIFICATION.md).
export async function hasClassiciAccess() {
  if (!firebaseReady) return true
  return isPremiumPlus()
}

// Correction d'écriture (« Scrivi », leggendo-server POST /correct) : mêmes
// rôles que la génération IA — premium_plus/enseignant, pas d'essai gratuit
// (choix documenté dans leggendo-server/quota.mjs). Le refus réel est rendu
// par le serveur ; ceci ne sert qu'à afficher ou masquer l'accès côté client.
export async function hasCorrectionAccess() {
  if (!firebaseReady) return true
  return isPremiumPlus()
}

// Aperçu gratuit de Classici pour tout utilisateur connecté (README_TARIFICATION.md) :
// deux fables courtes en entier, et le premier chapitre de quelques livres plus
// longs, pour donner un aperçu avant l'abonnement Premium IA — règles
// définies dans catalogAccess.js (partagé avec vite.config.js / prerender.mjs).
