// Attestation Firebase App Check (pure : la vérification cryptographique est
// injectée, donc testable sans firebase-admin — voir test/appcheck.test.mjs).
//
// Ce que ça apporte par rapport à l'ID token : le token Firebase prouve
// « quelqu'un est connecté », pas « la requête vient bien de notre app ».
// App Check ajoute cette seconde preuve (reCAPTCHA v3 côté web) et rend
// beaucoup plus coûteux le pilotage de l'API par un script maison, même
// muni de comptes valides.
//
// Trois modes, réglés par APP_CHECK_MODE :
//   off     — désactivé (défaut : tant que la clé reCAPTCHA n'est pas créée
//             en console, activer l'enforcement casserait la génération) ;
//   soft    — on vérifie et on journalise, sans refuser (phase d'observation,
//             le temps de confirmer que le vrai trafic est bien attesté) ;
//   enforce — toute requête non attestée est refusée.
export const APP_CHECK_MODES = ['off', 'soft', 'enforce']

export const APP_CHECK_MESSAGE =
  'Requête non attestée : rechargez la page de l’application pour réessayer.'

export function createAppCheckGuard({ mode = 'off', verifyToken, log = console } = {}) {
  if (!APP_CHECK_MODES.includes(mode)) {
    throw new Error(`APP_CHECK_MODE invalide : ${mode} (attendu ${APP_CHECK_MODES.join('|')})`)
  }
  if (mode !== 'off' && typeof verifyToken !== 'function') {
    throw new Error('createAppCheckGuard : verifyToken requis dès que le mode n’est pas « off ».')
  }

  // Renvoie un message d'erreur si la requête doit être refusée, sinon null.
  return async function guard(token, context = '') {
    if (mode === 'off') return null
    const reject = (reason) => {
      if (mode === 'enforce') return APP_CHECK_MESSAGE
      log.warn(`[app-check] ${reason}${context ? ` (${context})` : ''} — laissé passer (mode soft)`)
      return null
    }
    if (!token) return reject('jeton absent')
    try {
      await verifyToken(token)
      return null
    } catch (err) {
      return reject(`jeton invalide : ${err.message}`)
    }
  }
}
