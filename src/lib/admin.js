// Client des fonctions d'administration (voir functions/index.js).
// L'autorisation réelle est vérifiée côté serveur sur l'e-mail du compte
// (ADMIN_EMAIL) : ce module ne fait que relayer les appels.

import { getFunctionsInstance, getAuthInstance } from './firebase.js'

async function callable(name) {
  // Sur un rechargement direct de /admin, Firebase Auth restaure la session
  // de façon asynchrone : sans attendre cette restauration, le SDK Functions
  // peut construire l'appel avant qu'un jeton soit disponible et l'envoyer
  // sans authentification (rejeté côté serveur, alors que le compte est
  // bien connecté). authStateReady() garantit que la restauration a eu lieu.
  const auth = await getAuthInstance()
  await auth?.authStateReady?.()
  if (auth?.currentUser) {
    await auth.currentUser.getIdToken()
  }

  const functions = await getFunctionsInstance()
  if (!functions) throw new Error('Firebase non configuré.')
  const { httpsCallable } = await import('firebase/functions')
  return httpsCallable(functions, name)
}

// Liste tous les comptes (Auth + nombre de textes créés).
export async function listUsers() {
  const fn = await callable('adminListUsers')
  const { data } = await fn()
  return data.users
}

// Change le rôle d'un compte : 'gratuit' | 'premium' | 'enseignant'.
export async function setUserRole(uid, role) {
  const fn = await callable('adminSetUserRole')
  await fn({ uid, role })
}
