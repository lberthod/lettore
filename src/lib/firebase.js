// Configuration Firebase du projet "leggendo-dbb84".
// → Console Firebase > Paramètres du projet > Vos applications > Config
const firebaseConfig = {
  apiKey: 'AIzaSyDDRg8xkDgK92g5vogKKg8XVHZcv8DYD2k',
  authDomain: 'leggendo-dbb84.firebaseapp.com',
  projectId: 'leggendo-dbb84',
  storageBucket: 'leggendo-dbb84.firebasestorage.app',
  messagingSenderId: '1000769730096',
  appId: '1:1000769730096:web:87954678891854dae45ff5',
  measurementId: 'G-0XSL8RH1NN',
}

// Tant que la config n'est pas remplie, l'app fonctionne sans auth
export const firebaseReady = !firebaseConfig.apiKey.startsWith('REMPLACER')

// Le SDK Firebase (~75 kB gzip) est chargé dynamiquement : il reste hors du
// bundle initial et n'est téléchargé que si la config est renseignée.
let appPromise = null

// initializeApp une seule fois, partagé par Auth et Analytics.
function getApp() {
  if (!appPromise) {
    appPromise = import('firebase/app').then(({ initializeApp }) =>
      initializeApp(firebaseConfig)
    )
  }
  return appPromise
}

// Exposé pour les autres services Firebase (Firestore…)
export function getFirebaseApp() {
  return firebaseReady ? getApp() : Promise.resolve(null)
}

let authPromise = null

export function getAuthInstance() {
  if (!firebaseReady) return Promise.resolve(null)
  if (!authPromise) {
    authPromise = Promise.all([getApp(), import('firebase/auth')]).then(
      ([app, { getAuth }]) => getAuth(app)
    )
  }
  return authPromise
}

let analyticsPromise = null

// Analytics : navigateur uniquement (isSupported écarte SSR/environnements
// non compatibles). Renvoie null si non disponible.
export function getAnalyticsInstance() {
  if (!firebaseReady) return Promise.resolve(null)
  if (!analyticsPromise) {
    analyticsPromise = Promise.all([getApp(), import('firebase/analytics')])
      .then(([app, { getAnalytics, isSupported }]) =>
        isSupported().then((ok) => (ok ? getAnalytics(app) : null))
      )
      .catch(() => null)
  }
  return analyticsPromise
}
