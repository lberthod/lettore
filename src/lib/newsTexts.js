// Pool partagé de textes d'actualité générés par le cron VPS
// (leggendo-server/news-cron.mjs), réservé à la formule Premium+.
// Même pattern que userTexts.js : Firestore importé à la demande, rien ne
// pèse sur le bundle tant qu'on ne s'en sert pas.

import { getDbInstance as getDb } from './firebase.js'

// Pays et catégories connus du flux (voir leggendo-server/rss.mjs — COUNTRIES
// / CATEGORIES). Dupliqué ici en constantes d'affichage (drapeau + libellé)
// pour éviter de tirer le backend dans le bundle frontend.
export const NEWS_COUNTRIES = [
  { id: 'it', flag: '🇮🇹', label: 'Italia' },
  { id: 'ch', flag: '🇨🇭', label: 'Svizzera' },
  { id: 'fr', flag: '🇫🇷', label: 'Francia' },
]

export const NEWS_CATEGORIES = [
  { id: 'cronaca', icon: '📰', label: 'Cronaca' },
  { id: 'politica', icon: '🏛️', label: 'Politica' },
  { id: 'economia', icon: '💶', label: 'Economia' },
  { id: 'mondo', icon: '🌍', label: 'Mondo' },
  { id: 'tecnologia', icon: '💻', label: 'Tecnologia' },
  { id: 'sport', icon: '⚽', label: 'Sport' },
  { id: 'cultura', icon: '🎭', label: 'Cultura' },
]

// Les plus récents d'abord. Les règles Firestore refusent la lecture si
// l'utilisateur n'a pas le rôle Premium+ (voir firestore.rules). `max` plus
// large que l'affichage réel (voir NotizieView.vue) : le filtrage par pays
// et catégorie se fait côté client sur ce lot, pour éviter de dépendre
// d'index composites Firestore par combinaison pays/catégorie.
export async function listNewsTexts(max = 200) {
  const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')])
  if (!db) return []
  const { collection, query, orderBy, limit, getDocs } = fs
  const q = query(collection(db, 'newsTexts'), orderBy('createdAt', 'desc'), limit(max))
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data())
}

export async function loadNewsText(id) {
  try {
    const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')])
    if (!db) return null
    const { doc, getDoc } = fs
    const snap = await getDoc(doc(db, 'newsTexts', id))
    return snap.exists() ? snap.data() : null
  } catch {
    return null
  }
}
