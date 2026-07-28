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
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.isNativePlatform()) {
    // `reauthenticateWithPopup` ne fonctionne pas en WebView native ; on
    // repasse par le SDK natif puis on rejoue l'identifiant obtenu dans le
    // SDK JS (même pattern que loginWithGoogle dans auth.js).
    const { FirebaseAuthentication } = await import(
      '@capacitor-firebase/authentication'
    )
    const { GoogleAuthProvider, reauthenticateWithCredential } = await import(
      'firebase/auth'
    )
    const result = await FirebaseAuthentication.signInWithGoogle()
    const idToken = result.credential?.idToken
    if (!idToken) throw new Error('Connexion Google annulée ou incomplète.')
    await reauthenticateWithCredential(user, GoogleAuthProvider.credential(idToken))
    return
  }
  const { GoogleAuthProvider, reauthenticateWithPopup } = await import(
    'firebase/auth'
  )
  await reauthenticateWithPopup(user, new GoogleAuthProvider())
}

export async function reauthenticateWithApple() {
  const auth = await getAuthInstance()
  const user = auth.currentUser
  const { FirebaseAuthentication } = await import(
    '@capacitor-firebase/authentication'
  )
  const { OAuthProvider, reauthenticateWithCredential } = await import(
    'firebase/auth'
  )
  const result = await FirebaseAuthentication.signInWithApple()
  const idToken = result.credential?.idToken
  if (!idToken) throw new Error('Connexion Apple annulée ou incomplète.')
  const provider = new OAuthProvider('apple.com')
  const credential = provider.credential({
    idToken,
    rawNonce: result.credential?.nonce,
  })
  await reauthenticateWithCredential(user, credential)
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
