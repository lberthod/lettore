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

// La config web est renseignée en dur ci-dessus : l'app tourne toujours avec
// Firebase. La constante reste exportée car les vues s'en servent pour gérer
// un éventuel retour au mode « sans auth » (tests, fork sans backend).
export const firebaseReady = Boolean(firebaseConfig.apiKey)

// Clé de site reCAPTCHA v3 attachée à cette app dans la console Firebase
// (App Check > Applications > Web). Tant qu'elle n'est pas renseignée, App
// Check est inactif et l'app fonctionne exactement comme avant — c'est
// volontaire : activer l'attestation côté serveur avant d'avoir la clé
// bloquerait tout le trafic légitime (voir leggendo-server/appcheck.mjs).
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || ''

// Ce module (config + accesseurs) est dans le bundle d'entrée, mais le SDK
// Firebase lui-même n'y est pas : chaque service est derrière un `import()`,
// donc chargé seulement quand il sert vraiment. Ordres de grandeur après
// minification+gzip : app ~10 kB, auth ~50 kB, firestore ~175 kB,
// analytics ~7 kB, functions ~4 kB. Auth et Analytics sont en plus amorcés à
// l'inactivité (voir auth.js et main.js) pour rester hors du premier rendu.
let appPromise = null
let appCheckPromise = null

// App Check atteste que la requête vient bien de notre application, là où
// l'ID token n'atteste que l'identité de l'utilisateur : sans lui, un script
// muni de comptes créés en masse pilote l'API aussi bien que le navigateur
// (voir leggendo-server/TODO_SECURITE.md, § essai IA).
//
// Doit être initialisé AVANT tout autre service Firebase, sinon les appels
// déjà partis (Auth, Firestore, Functions) ne portent pas de jeton — d'où
// l'attente dans getApp() plutôt qu'une initialisation paresseuse à part.
function initAppCheck(app) {
  if (!RECAPTCHA_SITE_KEY) return Promise.resolve(null)
  return import('firebase/app-check')
    .then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
      // En dev, un jeton de debug (à enregistrer une fois dans la console)
      // évite d'avoir à faire tourner reCAPTCHA sur localhost.
      if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
      return initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      })
    })
    .catch((err) => {
      // Un échec d'App Check ne doit pas rendre l'app inutilisable : le
      // serveur reste libre de refuser (mode `enforce`), mais la lecture et
      // la connexion continuent de fonctionner.
      console.warn('App Check indisponible :', err)
      return null
    })
}

// initializeApp une seule fois, partagé par Auth, Firestore et Analytics.
function getApp() {
  if (!appPromise) {
    appPromise = import('firebase/app')
      .then(({ initializeApp }) => initializeApp(firebaseConfig))
      .then(async (app) => {
        appCheckPromise = initAppCheck(app)
        await appCheckPromise
        return app
      })
  }
  return appPromise
}

// Jeton d'attestation à joindre aux appels de l'API VPS (en-tête
// `X-Firebase-AppCheck`) — les SDK Firebase le posent tout seuls sur leurs
// propres appels, mais pas sur nos `fetch` maison. Renvoie null si App Check
// n'est pas configuré : à ce stade le serveur ne l'exige pas.
export async function getAppCheckToken() {
  if (!firebaseReady || !RECAPTCHA_SITE_KEY) return null
  try {
    await getApp()
    const appCheck = await appCheckPromise
    if (!appCheck) return null
    const { getToken } = await import('firebase/app-check')
    return (await getToken(appCheck, false)).token
  } catch (err) {
    console.warn('Jeton App Check indisponible :', err)
    return null
  }
}

// Exposé pour les autres services Firebase (Firestore…)
export function getFirebaseApp() {
  return firebaseReady ? getApp() : Promise.resolve(null)
}

let dbPromise = null

// Instance Firestore partagée par tous les modules qui lisent des documents
// (textes créés, Notizie, contenu réservé du catalogue). Point d'entrée
// unique par nécessité : `initializeFirestore` doit être appelé avant tout
// `getFirestore`, sinon les options de cache sont ignorées (ou l'appel
// échoue). Cache persistant activé : c'est lui qui permet de relire hors
// connexion un texte déjà ouvert avec autorisation — rôle que tenait le
// cache PWA des chunks avant que le contenu réservé ne sorte du build.
export function getDbInstance() {
  if (!firebaseReady) return Promise.resolve(null)
  if (!dbPromise) {
    dbPromise = Promise.all([getApp(), import('firebase/firestore')]).then(
      ([app, fs]) => {
        try {
          return fs.initializeFirestore(app, {
            localCache: fs.persistentLocalCache({
              tabManager: fs.persistentMultipleTabManager(),
            }),
          })
        } catch (err) {
          // IndexedDB indisponible (navigation privée, navigateur ancien) :
          // on garde Firestore en mémoire plutôt que de perdre l'accès au
          // contenu — seul le hors-ligne est alors indisponible.
          console.warn('Cache Firestore persistant indisponible :', err)
          return fs.getFirestore(app)
        }
      }
    )
  }
  return dbPromise
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

let functionsPromise = null

// Cloud Functions callables (adminListUsers, adminSetUserRole…), même région
// que le déploiement (voir functions/index.js).
export function getFunctionsInstance() {
  if (!firebaseReady) return Promise.resolve(null)
  if (!functionsPromise) {
    functionsPromise = Promise.all([
      getApp(),
      import('firebase/functions'),
    ]).then(([app, { getFunctions }]) => getFunctions(app, 'europe-west1'))
  }
  return functionsPromise
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
