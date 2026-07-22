// Configuration Firebase du projet "lettore-5a3f4".
// → Console Firebase > Paramètres du projet > Vos applications > Config
const firebaseConfig = {
  apiKey: 'REMPLACER_API_KEY',
  authDomain: 'lettore-5a3f4.firebaseapp.com',
  projectId: 'lettore-5a3f4',
  storageBucket: 'lettore-5a3f4.appspot.com',
  messagingSenderId: 'REMPLACER_SENDER_ID',
  appId: 'REMPLACER_APP_ID',
}

// Tant que la config n'est pas remplie, l'app fonctionne sans auth
export const firebaseReady = !firebaseConfig.apiKey.startsWith('REMPLACER')

// Le SDK Firebase (~75 kB gzip) est chargé dynamiquement : il reste hors du
// bundle initial et n'est téléchargé que si la config est renseignée.
let authPromise = null

export function getAuthInstance() {
  if (!firebaseReady) return Promise.resolve(null)
  if (!authPromise) {
    authPromise = Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
    ]).then(([{ initializeApp }, { getAuth }]) =>
      getAuth(initializeApp(firebaseConfig))
    )
  }
  return authPromise
}
