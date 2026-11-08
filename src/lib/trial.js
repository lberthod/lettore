// Démarrage de l'essai Premium IA (10 jours). Le serveur n'accorde plus
// l'essai à l'inscription : le callable `startTrial` (functions/trial.mjs)
// exige un e-mail vérifié et ne s'exécute qu'une fois par uid / e-mail.
// Réponse : { ok: true, trialEnd } ; erreurs HttpsError « failed-precondition »
// (e-mail non vérifié, ou formule déjà active) et « already-exists » (essai
// déjà consommé).

const KEY_PREFIX = 'leggendo.trial.settled.'

// Pur : faut-il tenter de démarrer l'essai ? `claims` vient de
// getIdTokenResult().claims. Un compte déjà doté d'une formule (rôle autre que
// « gratuit », période payante, essai posé) n'a rien à démarrer.
export function shouldStartTrial({ emailVerified, claims, settled }) {
  if (!emailVerified || settled) return false
  const c = claims || {}
  if (c.trialEnd !== undefined || c.periodEnd !== undefined) return false
  if (c.role && c.role !== 'gratuit') return false
  return true
}

// Pur : un code d'erreur est-il une réponse définitive du serveur (inutile de
// réessayer à chaque chargement) ? Les erreurs réseau/internes ne le sont pas.
export function isSettledError(err) {
  const code = String(err?.code || '')
  return code.endsWith('already-exists') || code.endsWith('failed-precondition')
}

function readSettled(uid, storage) {
  try {
    return storage?.getItem(KEY_PREFIX + uid) === '1'
  } catch {
    return false
  }
}
function writeSettled(uid, storage) {
  try {
    storage?.setItem(KEY_PREFIX + uid, '1')
  } catch {
    /* stockage indisponible : on retentera, le serveur est idempotent */
  }
}

// Ne bloque ni ne fait échouer la connexion : renvoie 'started', 'skipped' ou
// 'error'. `call` appelle le callable ; `storage` mémorise les réponses
// définitives pour ne pas rappeler la fonction à chaque chargement.
export async function startTrialIfEligible(
  user,
  { call, storage = null, refreshToken = (u) => u.getIdToken(true) } = {}
) {
  if (!user?.uid || !user.emailVerified) return 'skipped'
  const settled = readSettled(user.uid, storage)
  if (settled) return 'skipped'
  try {
    const { claims } = await user.getIdTokenResult()
    if (!shouldStartTrial({ emailVerified: user.emailVerified, claims, settled })) {
      return 'skipped'
    }
    await call()
    writeSettled(user.uid, storage)
    await refreshToken(user)
    return 'started'
  } catch (err) {
    if (isSettledError(err)) {
      writeSettled(user.uid, storage)
      return 'skipped'
    }
    console.warn("Démarrage de l'essai :", err)
    return 'error'
  }
}
