import { ref } from 'vue'
import { getAuthInstance, firebaseReady } from './firebase.js'

export const currentUser = ref(null)

// Résolue une fois la session restaurée (évite un flash "déconnecté"
// et permet au guard du routeur d'attendre proprement)
let resolveAuthReady
export const authReady = new Promise((resolve) => {
  resolveAuthReady = resolve
})

if (firebaseReady) {
  getAuthInstance().then(async (auth) => {
    const { onAuthStateChanged } = await import('firebase/auth')
    onAuthStateChanged(auth, (user) => {
      currentUser.value = user
      resolveAuthReady()
    })
  })
} else {
  resolveAuthReady()
}

async function requireAuth() {
  const auth = await getAuthInstance()
  if (!auth) {
    throw new Error(
      "L'authentification n'est pas encore configurée (voir src/lib/firebase.js)."
    )
  }
  return auth
}

export async function register(email, password, displayName) {
  const auth = await requireAuth()
  const { createUserWithEmailAndPassword, updateProfile } = await import(
    'firebase/auth'
  )
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  if (displayName) {
    await updateProfile(cred.user, { displayName })
  }
  return cred.user
}

export async function login(email, password) {
  const auth = await requireAuth()
  const { signInWithEmailAndPassword } = await import('firebase/auth')
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

export async function loginWithGoogle() {
  const auth = await requireAuth()
  const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth')
  const cred = await signInWithPopup(auth, new GoogleAuthProvider())
  return cred.user
}

export async function resetPassword(email) {
  const auth = await requireAuth()
  const { sendPasswordResetEmail } = await import('firebase/auth')
  await sendPasswordResetEmail(auth, email)
}

export async function logout() {
  const auth = await requireAuth()
  const { signOut } = await import('firebase/auth')
  await signOut(auth)
}

// Traduction des erreurs Firebase les plus courantes
export function errorMessage(err) {
  const code = err?.code || ''
  const messages = {
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/user-not-found': 'Aucun compte trouvé avec cette adresse.',
    'auth/wrong-password': 'Mot de passe incorrect.',
    'auth/invalid-credential': 'Identifiants incorrects.',
    'auth/email-already-in-use': 'Un compte existe déjà avec cette adresse.',
    'auth/weak-password': 'Mot de passe trop faible (6 caractères minimum).',
    'auth/too-many-requests': 'Trop de tentatives, réessayez plus tard.',
    'auth/popup-closed-by-user': 'Fenêtre de connexion fermée.',
    'auth/network-request-failed':
      'Connexion impossible — vérifiez votre accès internet et réessayez.',
  }
  return messages[code] || err?.message || 'Une erreur est survenue.'
}
