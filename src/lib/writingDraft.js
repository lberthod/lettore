// Brouillon local de la production écrite (WriteView.vue) — filet de
// sécurité contre la perte de texte (fermeture d'onglet, coupure réseau,
// changement de page en plein brouillon). Même pattern que dailySession.js :
// une clé localStorage par uid, une entrée par couple (mode, promptId).

const BASE_KEY = 'leggendo-writing-draft'

// Isolée par compte, comme dailySession.js : deux comptes sur le même
// navigateur ne doivent jamais se proposer le brouillon l'un de l'autre.
function keyFor(uid) {
  return uid ? `${BASE_KEY}.${uid}` : BASE_KEY
}

// promptId absent (mode libre, ou action sans sujet choisi) → 'libre'.
function subKeyFor(mode, promptId) {
  return `${mode || 'libero'}:${promptId || 'libre'}`
}

export function saveDraft({ uid = null, mode, promptId, text, savedAt = Date.now() }) {
  try {
    const key = keyFor(uid)
    const subKey = subKeyFor(mode, promptId)
    const raw = localStorage.getItem(key)
    const store = raw ? JSON.parse(raw) || {} : {}
    store[subKey] = { text, savedAt }
    localStorage.setItem(key, JSON.stringify(store))
  } catch {
    // Stockage indisponible (navigation privée, quota plein) : pas de
    // sauvegarde locale, sans plus — la correction reste possible.
  }
}

export function loadDraft({ uid = null, mode, promptId }) {
  try {
    const raw = localStorage.getItem(keyFor(uid))
    if (!raw) return null
    const store = JSON.parse(raw)
    return store?.[subKeyFor(mode, promptId)] || null
  } catch {
    return null
  }
}

export function clearDraft({ uid = null, mode, promptId }) {
  try {
    const key = keyFor(uid)
    const raw = localStorage.getItem(key)
    if (!raw) return
    const store = JSON.parse(raw)
    if (!store) return
    delete store[subKeyFor(mode, promptId)]
    if (Object.keys(store).length) {
      localStorage.setItem(key, JSON.stringify(store))
    } else {
      localStorage.removeItem(key)
    }
  } catch {
    // rien à nettoyer
  }
}
