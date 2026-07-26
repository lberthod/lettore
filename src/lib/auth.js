import { ref } from 'vue'
import { getAuthInstance, firebaseReady } from './firebase.js'
import { onIdle } from './idle.js'

export const currentUser = ref(null)

// Résolue une fois la session restaurée (évite un flash "déconnecté"
// et permet au guard du routeur d'attendre proprement)
let resolveAuthReady
const authReadyPromise = new Promise((resolve) => {
  resolveAuthReady = resolve
})

// Le SDK Auth pèse ~190 kB (~50 kB gzip) : le charger dès l'exécution du
// bundle d'entrée le met en concurrence avec le rendu de pages qui, pour la
// plupart (accueil, pages SEO prérendues), n'ont rien à afficher de différent
// selon la session. On l'amorce donc à l'inactivité — sauf si quelqu'un
// attend `authReady` avant, auquel cas le chargement démarre aussitôt.
let authStarted = false
function startAuth() {
  if (authStarted) return
  authStarted = true
  getAuthInstance().then(async (auth) => {
    const { onAuthStateChanged } = await import('firebase/auth')
    onAuthStateChanged(auth, (user) => {
      currentUser.value = user
      resolveAuthReady()
    })
  })
}

if (firebaseReady) {
  onIdle(startAuth)
} else {
  resolveAuthReady()
}

// « Thenable » plutôt que Promise : `await authReady` se comporte exactement
// comme avant, mais déclenche au passage le chargement du SDK s'il n'a pas
// encore commencé. Une garde de route ne peut donc jamais attendre une
// session dont la restauration n'a pas été amorcée.
export const authReady = {
  then(onFulfilled, onRejected) {
    if (firebaseReady) startAuth()
    return authReadyPromise.then(onFulfilled, onRejected)
  },
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
  // Le lien de vérification part dès l'inscription : la génération d'essai
  // l'exige côté serveur (leggendo-server/quota.mjs). L'échec de l'envoi ne
  // doit pas faire échouer une inscription par ailleurs valide — le compte
  // existe, l'utilisateur pourra redemander le lien depuis son profil.
  try {
    await sendVerificationEmail(cred.user)
  } catch (err) {
    console.warn("Envoi de l'e-mail de vérification :", err)
  }
  return cred.user
}

// Envoie (ou renvoie) le lien de confirmation d'adresse. Sans argument,
// s'applique à l'utilisateur connecté.
export async function sendVerificationEmail(user) {
  const auth = await requireAuth()
  const target = user || auth.currentUser
  if (!target) throw new Error('Connexion requise.')
  const { sendEmailVerification } = await import('firebase/auth')
  await sendEmailVerification(target)
}

// Le serveur lit `email_verified` dans l'ID token : juste après un clic sur
// le lien de confirmation, le token encore en cache dit « non vérifié ».
// On recharge donc le profil et on force le renouvellement du token avant de
// redemander le quota. Renvoie l'état de vérification à jour.
export async function refreshEmailVerified() {
  const auth = await requireAuth()
  const user = auth.currentUser
  if (!user) return false
  await user.reload()
  await user.getIdToken(true)
  currentUser.value = auth.currentUser
  return auth.currentUser?.emailVerified === true
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
