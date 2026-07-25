// Suppression de compte en libre-service — voir functions/index.js
// `deleteAccount`. Le serveur exige une reconnexion récente (`auth_time`) ;
// ce module la déclenche (mot de passe ou popup Google selon le fournisseur)
// juste avant l'appel.

import { getAuthInstance, getFunctionsInstance } from './firebase.js'

export function authProvider(user) {
  return user?.providerData?.[0]?.providerId || 'password'
}

export async function reauthenticateWithPassword(password) {
  const auth = await getAuthInstance()
  const user = auth.currentUser
  const { EmailAuthProvider, reauthenticateWithCredential } = await import(
    'firebase/auth'
  )
  const credential = EmailAuthProvider.credential(user.email, password)
  await reauthenticateWithCredential(user, credential)
}

export async function reauthenticateWithGoogle() {
  const auth = await getAuthInstance()
  const user = auth.currentUser
  const { GoogleAuthProvider, reauthenticateWithPopup } = await import(
    'firebase/auth'
  )
  await reauthenticateWithPopup(user, new GoogleAuthProvider())
}

export async function deleteAccount() {
  const auth = await getAuthInstance()
  await auth?.authStateReady?.()
  const functions = await getFunctionsInstance()
  if (!functions) throw new Error('Firebase non configuré.')
  const { httpsCallable } = await import('firebase/functions')
  const fn = httpsCallable(functions, 'deleteAccount')
  await fn()
}
