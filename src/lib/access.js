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
// Depuis le passage en mode gratuit (GRATUIT.md), c'est le seul critère
// d'accès au contenu complet.
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

// À appeler juste avant une action qui change le rôle (modification depuis
// l'administration) : le prochain contrôle d'accès renouvellera le token de
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

// Rôle de l'utilisateur, lu depuis les custom claims du token Firebase (posés
// par adminSetUserRole — voir functions/index.js). Il ne conditionne plus
// l'accès au contenu (mode gratuit), seulement le plafond de crédits IA côté
// serveur et l'affichage dans l'administration.
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
// (rôle modifié depuis l'administration).
export function refreshUserRole() {
  return getUserRole({ forceRefresh: true })
}

// Mode gratuit (GRATUIT.md) : il n'y a plus de formule payante. Tout compte
// connecté a accès au catalogue complet, aux Classici, aux Notizie et aux
// outils IA (avec un plafond mensuel de crédits, tranché par le serveur —
// leggendo-server/quota.mjs). Le rôle ne sert plus qu'à l'administration
// (plafond de crédits plus élevé pour `premium_plus`/`enseignant`, attribués
// à la main). Les fonctions ci-dessous gardent leur nom pour ne pas toucher
// à tous les appelants : elles répondent désormais « connecté ou non ».
//
// En dev sans Firebase configuré, il n'y a pas de compte : on ne verrouille
// rien (comme isLoggedIn).

// Outils IA (Créer son texte, Scrivi, Dialogo) et Notizie.
export async function hasAiAccess() {
  return isLoggedIn()
}

// Ancien nom (« Premium IA »), conservé pour les vues qui l'importent.
export const isPremiumPlus = hasAiAccess

// Catalogue complet : tout compte connecté — l'aperçu public (EXAMPLE_TEXTS)
// reste lisible sans compte. Le vrai contrôle est dans firestore.rules.
export async function hasCatalogAccess() {
  return isLoggedIn()
}

// Classiques adaptés (« Classici ») : même règle que le catalogue. L'aperçu
// gratuit ci-dessous reste lisible sans compte.
export async function hasClassiciAccess() {
  return hasCatalogAccess()
}

// Correction d'écriture (« Scrivi ») et dialogue simulé (« Dialogo ») : le
// refus réel (adresse non vérifiée, crédits épuisés) est rendu par le
// serveur ; ceci ne sert qu'à afficher ou masquer l'accès côté client.
export async function hasCorrectionAccess() {
  return hasAiAccess()
}

export async function hasDialogueAccess() {
  return hasAiAccess()
}

// Aperçu gratuit de Classici pour tout utilisateur connecté (README_TARIFICATION.md) :
// deux fables courtes en entier, et le premier chapitre de quelques livres plus
// longs, pour donner un aperçu avant l'abonnement Premium IA — règles
// définies dans catalogAccess.js (partagé avec vite.config.js / prerender.mjs).
