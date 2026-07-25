import textsIndex from '../texts/index.json'
import { currentUser } from './auth.js'
import { firebaseReady } from './firebase.js'

// Aperçu gratuit : 6 textes proposés aux visiteurs non connectés.
// On prend un échantillon réparti sur les niveaux pour montrer la variété.
function pickExamples(count) {
  const byLevel = {}
  for (const t of textsIndex) {
    ;(byLevel[t.level] ??= []).push(t)
  }
  const levels = Object.keys(byLevel).sort()
  const picks = []
  let i = 0
  while (picks.length < count) {
    let added = false
    for (const lv of levels) {
      const t = byLevel[lv][i]
      if (t) {
        picks.push(t)
        added = true
        if (picks.length === count) break
      }
    }
    if (!added) break
    i++
  }
  return picks
}

export const EXAMPLE_COUNT = 6
export const EXAMPLE_TEXTS = pickExamples(EXAMPLE_COUNT)
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

// Rôle réel de l'utilisateur, lu depuis les custom claims du token Firebase
// (posés par le webhook Stripe / adminSetUserRole — voir functions/index.js).
// Rafraîchi à chaque appel : les claims ne changent pas souvent, mais un
// abonnement qui vient d'être activé doit être visible sans reconnexion.
export async function getUserRole() {
  if (!currentUser.value) return 'gratuit'
  try {
    const token = await currentUser.value.getIdTokenResult()
    if (token.claims.role) return token.claims.role
    return token.claims.premium ? 'premium' : 'gratuit'
  } catch {
    return 'gratuit'
  }
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

// Aperçu gratuit de Classici pour tout utilisateur connecté (README_TARIFICATION.md) :
// deux fables courtes en entier, et le premier chapitre de quelques livres plus
// longs, pour donner un aperçu avant l'abonnement Premium IA.
export const FREE_CLASSICI_BOOK_IDS = ['cicala-formica', 'leone-topo']
export const FREE_CLASSICI_PREVIEW_BOOK_IDS = ['pinocchio', 'cenerentola', 'il-principe', 'mattia-pascal']

export function isFreeClassiciChapter(bookId, chapterId) {
  if (FREE_CLASSICI_BOOK_IDS.includes(bookId)) return true
  return FREE_CLASSICI_PREVIEW_BOOK_IDS.includes(bookId) && chapterId === '01'
}
