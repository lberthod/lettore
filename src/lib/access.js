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

// Un texte est accessible s'il fait partie de l'aperçu ou si l'on est connecté.
export function isTextUnlocked(id) {
  return isLoggedIn() || EXAMPLE_TEXT_IDS.includes(id)
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

export async function isPremiumPlus() {
  return (await getUserRole()) === 'premium_plus'
}
