// Accès au contenu du catalogue (textes et chapitres de Classici), gratuit
// comme réservé.
//
// Le contenu réservé n'existe plus dans le build public : seul l'aperçu
// gratuit est embarqué, via le module virtuel `virtual:free-content` généré
// par vite.config.js. Tout le reste est lu dans Firestore, où les règles
// vérifient le rôle de l'utilisateur (firestore.rules) — c'est la seule
// barrière réelle, les gardes de route (router.js) ne protégeant que
// l'affichage. Un accès refusé ou un contenu inexistant renvoie `null` :
// l'appelant redirige alors comme il le ferait pour un identifiant inconnu.
//
// Hors-ligne : les documents déjà lus restent disponibles grâce au cache
// persistant de l'instance Firestore partagée (voir firebase.js).

import { freeTexts, freeChapters } from 'virtual:free-content'
import { catalogIds as catalogIdList } from 'virtual:catalog'
import { getDbInstance } from './firebase.js'

const catalogIds = new Set(catalogIdList)

// Contenus déjà chargés dans cette session : évite une relecture (et une
// lecture Firestore facturée) en navigation avant/arrière ou au préchargement
// des textes voisins.
const cache = new Map()

export function chapterKey(bookId, chapterId) {
  return `${bookId}__${chapterId}`
}

export function isCatalogText(id) {
  return catalogIds.has(id)
}

async function loadProtected(collection, docId) {
  try {
    const [db, fs] = await Promise.all([
      getDbInstance(),
      import('firebase/firestore'),
    ])
    if (!db) return null
    const snap = await fs.getDoc(fs.doc(db, collection, docId))
    const data = snap.exists() ? snap.data().data : null
    return typeof data === 'string' ? JSON.parse(data) : null
  } catch {
    // Règles Firestore (rôle insuffisant) ou réseau indisponible.
    return null
  }
}

async function loadOnce(key, loader) {
  if (cache.has(key)) return cache.get(key)
  const data = await loader()
  if (data) cache.set(key, data)
  return data
}

// Texte du catalogue. Renvoie null pour un identifiant hors catalogue (texte
// créé par un utilisateur, actualité) : à l'appelant de tenter les autres
// sources, sans lecture Firestore inutile.
export function loadCatalogText(id) {
  if (!catalogIds.has(id)) return Promise.resolve(null)
  return loadOnce(`text:${id}`, () =>
    freeTexts[id] ? freeTexts[id]() : loadProtected('catalogTexts', id)
  )
}

// Chapitre de Classici (« bookId » + « chapterId » tels qu'ils figurent dans
// le manifeste book.json, ex. « pinocchio » / « 02 »).
export function loadBookChapter(bookId, chapterId) {
  const key = chapterKey(bookId, chapterId)
  return loadOnce(`chapter:${key}`, () =>
    freeChapters[key] ? freeChapters[key]() : loadProtected('bookChapters', key)
  )
}
