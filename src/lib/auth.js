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

// `signInWithPopup` n'existe pas dans la WebView native (Android ou iOS) :
// pas de fenêtre popup, et le retour OAuth ne peut pas atteindre la page. Sur
// mobile natif, on passe par le SDK natif Firebase Auth
// (@capacitor-firebase/authentication, Google/Apple Sign-In natifs) puis on
// rejoue l'identifiant obtenu dans le SDK JS avec `signInWithCredential`,
// pour que le reste de l'app (onAuthStateChanged, currentUser, règles
// Firestore) continue de fonctionner exactement comme sur le web.
async function isNative() {
  const { Capacitor } = await import('@capacitor/core')
  return Capacitor.isNativePlatform()
}

export async function loginWithGoogle() {
  const auth = await requireAuth()
  const { signInWithCredential, signInWithPopup, GoogleAuthProvider } =
    await import('firebase/auth')

  if (await isNative()) {
    const { FirebaseAuthentication } = await import(
      '@capacitor-firebase/authentication'
    )
    const result = await FirebaseAuthentication.signInWithGoogle()
    const idToken = result.credential?.idToken
    if (!idToken) {
      throw new Error('Connexion Google annulée ou incomplète.')
    }
    const credential = GoogleAuthProvider.credential(idToken)
    const cred = await signInWithCredential(auth, credential)
    return cred.user
  }

  const cred = await signInWithPopup(auth, new GoogleAuthProvider())
  return cred.user
}

// Obligatoire côté iOS (règle App Store 4.8) dès qu'une autre connexion
// sociale (Google) est proposée. N'a de sens qu'en contexte natif : Safari
// gère déjà "Se connecter avec Apple" via son propre flux web s'il le faut,
// donc pas de branche web ici.
export async function loginWithApple() {
  const auth = await requireAuth()
  const { signInWithCredential, OAuthProvider } = await import('firebase/auth')
  const { FirebaseAuthentication } = await import(
    '@capacitor-firebase/authentication'
  )
  const result = await FirebaseAuthentication.signInWithApple()
  const idToken = result.credential?.idToken
  if (!idToken) {
    throw new Error('Connexion Apple annulée ou incomplète.')
  }
  const provider = new OAuthProvider('apple.com')
  const credential = provider.credential({
    idToken,
    rawNonce: result.credential?.nonce,
  })
  const cred = await signInWithCredential(auth, credential)
  return cred.user
}

export async function resetPassword(email) {
  const auth = await requireAuth()
  const { sendPasswordResetEmail } = await import('firebase/auth')
  await sendPasswordResetEmail(auth, email)
}

export async function logout() {
  const auth = await requireAuth()
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.isNativePlatform()) {
    const { FirebaseAuthentication } = await import(
      '@capacitor-firebase/authentication'
    )
    await FirebaseAuthentication.signOut()
  }
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
