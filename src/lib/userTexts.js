// Textes créés par l'utilisateur (« Créer son texte ») — persistés dans
// Firestore : le texte complet dans `userTexts/{id}` (lié à son auteur via
// `owner`), et un index léger dans `users/{uid}.createdTexts` pour lister
// sans requête. Firestore est importé dynamiquement, comme le reste du SDK :
// rien ne pèse sur le bundle tant qu'on ne s'en sert pas.

import { getFirebaseApp, firebaseReady } from './firebase.js'
import { getAuthInstance } from './firebase.js'

let dbPromise = null

function getDb() {
  if (!firebaseReady) return Promise.resolve(null)
  if (!dbPromise) {
    dbPromise = Promise.all([getFirebaseApp(), import('firebase/firestore')]).then(
      ([app, { getFirestore }]) => getFirestore(app)
    )
  }
  return dbPromise
}

async function requireUser() {
  const auth = await getAuthInstance()
  const user = auth?.currentUser
  if (!user) throw new Error('Connexion requise.')
  return user
}

// Enregistre un texte généré : document complet + entrée dans l'index du
// profil. Renvoie l'entrée d'index créée.
export async function saveUserText(textData) {
  const [db, fs, user] = await Promise.all([
    getDb(),
    import('firebase/firestore'),
    requireUser(),
  ])
  const { doc, setDoc, serverTimestamp, arrayUnion } = fs

  await setDoc(doc(db, 'userTexts', textData.id), {
    ...textData,
    owner: user.uid,
    public: false,
    createdAt: serverTimestamp(),
  })

  const entry = {
    id: textData.id,
    title: textData.title,
    level: textData.level,
    wordCount: textData.wordCount ?? 0,
    category: textData.category ?? null,
    genre: textData.genre ?? null,
    size: textData.size ?? null,
    public: false,
    createdAt: Date.now(), // serverTimestamp interdit dans arrayUnion
  }
  await setDoc(
    doc(db, 'users', user.uid),
    { createdTexts: arrayUnion(entry) },
    { merge: true }
  )
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
export async function setUserTextPublic(id, isPublic) {
  const [db, fs, user] = await Promise.all([
    getDb(),
    import('firebase/firestore'),
    requireUser(),
  ])
  const { doc, updateDoc, getDoc, setDoc } = fs
  await updateDoc(doc(db, 'userTexts', id), { public: isPublic })

  const userRef = doc(db, 'users', user.uid)
  const snap = await getDoc(userRef)
  const entries = (snap.exists() ? snap.data().createdTexts || [] : []).map((e) =>
    e.id === id ? { ...e, public: isPublic } : e
  )
  await setDoc(userRef, { createdTexts: entries }, { merge: true })
}

// Supprime un texte créé (document + entrée d'index).
export async function deleteUserText(id) {
  const [db, fs, user] = await Promise.all([
    getDb(),
    import('firebase/firestore'),
    requireUser(),
  ])
  const { doc, getDoc, setDoc, deleteDoc } = fs
  await deleteDoc(doc(db, 'userTexts', id))
  const userRef = doc(db, 'users', user.uid)
  const snap = await getDoc(userRef)
  const entries = (snap.exists() ? snap.data().createdTexts || [] : []).filter(
    (e) => e.id !== id
  )
  await setDoc(userRef, { createdTexts: entries }, { merge: true })
}
