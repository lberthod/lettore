// Client des fonctions d'administration (voir functions/index.js).
// L'autorisation réelle est vérifiée côté serveur sur l'e-mail du compte
// (ADMIN_EMAIL) : ce module ne fait que relayer les appels.

import { getFunctionsInstance, getAuthInstance, getDbInstance } from './firebase.js'
import { refreshUserRole } from './access.js'

async function callable(name) {
  // Sur un rechargement direct de /admin, Firebase Auth restaure la session
  // de façon asynchrone : sans attendre cette restauration, le SDK Functions
  // peut construire l'appel avant qu'un jeton soit disponible et l'envoyer
  // sans authentification (rejeté côté serveur, alors que le compte est
  // bien connecté). authStateReady() garantit que la restauration a eu lieu.
  const auth = await getAuthInstance()
  await auth?.authStateReady?.()
  if (auth?.currentUser) {
    await auth.currentUser.getIdToken()
  }

  const functions = await getFunctionsInstance()
  if (!functions) throw new Error('Firebase non configuré.')
  const { httpsCallable } = await import('firebase/functions')
  return httpsCallable(functions, name)
}

// Liste tous les comptes (Auth + nombre de textes créés).
export async function listUsers() {
  const fn = await callable('adminListUsers')
  const { data } = await fn()
  return data.users
}

// --- Statistiques de vocabulaire du corpus ---
// Précalculées par scripts/sync-content.mjs et stockées dans `contentStats`,
// lisible du seul compte admin (firestore.rules). Le contenu réservé n'étant
// plus embarqué dans le build, la page admin ne peut plus les recalculer sans
// télécharger tout le catalogue.

async function contentStat(docId) {
  const [db, fs] = await Promise.all([
    getDbInstance(),
    import('firebase/firestore'),
  ])
  if (!db) return null
  const snap = await fs.getDoc(fs.doc(db, 'contentStats', docId))
  return snap.exists() ? snap.data() : null
}

// { totalCount, levels: [{ level, count }], updatedAt } — ou null si la
// synchronisation n'a jamais été lancée.
export function loadVocabSummary() {
  return contentStat('vocab-summary')
}

// Liste complète des mots d'un niveau : [{ word, translation }].
export async function loadVocabLevel(level) {
  const stat = await contentStat(`vocab-${level}`)
  return stat?.data ? JSON.parse(stat.data) : []
}

// Change le rôle d'un compte : 'gratuit' | 'premium' | 'enseignant'.
export async function setUserRole(uid, role) {
  const fn = await callable('adminSetUserRole')
  await fn({ uid, role })
  // Rôle changé sur son propre compte : le token en cache porte encore
  // l'ancienne claim, on le renouvelle tout de suite.
  const auth = await getAuthInstance()
  if (auth?.currentUser?.uid === uid) await refreshUserRole()
}
