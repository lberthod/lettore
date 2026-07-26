// Textes créés par l'utilisateur (« Créer son texte ») — persistés dans
// Firestore : le texte complet dans `userTexts/{id}` (lié à son auteur via
// `owner`), et un index léger dans `users/{uid}.createdTexts` pour lister
// sans requête. Firestore est importé dynamiquement, comme le reste du SDK :
// rien ne pèse sur le bundle tant qu'on ne s'en sert pas.

// L'instance Firestore (avec son cache persistant) est partagée avec les
// autres modules — voir getDbInstance() dans firebase.js.
import { getDbInstance as getDb, getAuthInstance } from './firebase.js'

async function requireUser() {
  const auth = await getAuthInstance()
  const user = auth?.currentUser
  if (!user) throw new Error('Connexion requise.')
  return user
}

// Enregistre un texte généré : document complet + entrée dans l'index du
// profil, dans une transaction (les deux écritures réussissent ou échouent
// ensemble, pas de texte orphelin en cas de panne entre les deux ; et la
// lecture-réécriture de l'index ne peut pas écraser un partage ou une
// suppression faits depuis un autre onglet — cf. setUserTextPublic).
// Idempotent par `textData.id` : un appel rejoué après un rechargement de
// page (voir generation.js, résultat récupéré mais pas encore confirmé
// enregistré) remplace l'entrée existante au lieu de la dupliquer dans
// l'index — createdAt variant à chaque appel, arrayUnion() ne suffirait pas
// à dédupliquer.
export async function saveUserText(textData) {
  const [db, fs, user] = await Promise.all([
    getDb(),
    import('firebase/firestore'),
    requireUser(),
  ])
  const { doc, runTransaction, serverTimestamp } = fs

  const userRef = doc(db, 'users', user.uid)
  const textRef = doc(db, 'userTexts', textData.id)

  const entry = {
    id: textData.id,
    title: textData.title,
    level: textData.level,
    wordCount: textData.wordCount ?? 0,
    category: textData.category ?? null,
    genre: textData.genre ?? null,
    size: textData.size ?? null,
    public: false,
    createdAt: Date.now(),
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef)
    const existing = snap.exists() ? snap.data().createdTexts || [] : []
    tx.set(textRef, {
      ...textData,
      owner: user.uid,
      public: false,
      createdAt: serverTimestamp(),
    })
    tx.set(
      userRef,
      { createdTexts: [...existing.filter((e) => e.id !== entry.id), entry] },
      { merge: true }
    )
  })

  return entry
}

// Liste des textes créés (du plus récent au plus ancien).
export async function listUserTexts() {
  const [db, fs, user] = await Promise.all([
    getDb(),
    import('firebase/firestore'),
    requireUser(),
  ])
  const { doc, getDoc } = fs
  const snap = await getDoc(doc(db, 'users', user.uid))
  const entries = snap.exists() ? snap.data().createdTexts || [] : []
  return [...entries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
}

// Charge un texte créé (pour le lecteur). Renvoie null s'il n'existe pas,
// s'il n'est pas public et n'appartient pas à l'utilisateur connecté (les
// règles Firestore refusent alors la lecture).
export async function loadUserText(id) {
  try {
    const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')])
    if (!db) return null
    const { doc, getDoc } = fs
    const snap = await getDoc(doc(db, 'userTexts', id))
    return snap.exists() ? snap.data() : null
  } catch {
    return null
  }
}

// Rend un texte public ou privé (partage par URL, sans compte requis pour le
// lecteur). Seul l'auteur peut modifier ce champ (voir firestore.rules).
// Transaction : lit puis réécrit l'index dans la même opération atomique,
// pour que deux onglets ne s'écrasent pas mutuellement (read-modify-write).
export async function setUserTextPublic(id, isPublic) {
  const [db, fs, user] = await Promise.all([
    getDb(),
    import('firebase/firestore'),
    requireUser(),
  ])
  const { doc, runTransaction } = fs
  const userRef = doc(db, 'users', user.uid)
  const textRef = doc(db, 'userTexts', id)

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef)
    const entries = (snap.exists() ? snap.data().createdTexts || [] : []).map((e) =>
      e.id === id ? { ...e, public: isPublic } : e
    )
    tx.update(textRef, { public: isPublic })
    tx.set(userRef, { createdTexts: entries }, { merge: true })
  })
}

// Supprime un texte créé (document + entrée d'index), dans une transaction
// pour éviter les mêmes écrasements concurrents que setUserTextPublic.
export async function deleteUserText(id) {
  const [db, fs, user] = await Promise.all([
    getDb(),
    import('firebase/firestore'),
    requireUser(),
  ])
  const { doc, runTransaction } = fs
  const userRef = doc(db, 'users', user.uid)
  const textRef = doc(db, 'userTexts', id)

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef)
    const entries = (snap.exists() ? snap.data().createdTexts || [] : []).filter(
      (e) => e.id !== id
    )
    tx.delete(textRef)
    tx.set(userRef, { createdTexts: entries }, { merge: true })
  })
}
