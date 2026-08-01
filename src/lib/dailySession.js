// Reprise locale de la session quotidienne composée (voir
// IntegartioNOptimsaitonPedago.MD §6.5 et lib/percorso.js#composeSession).
//
// But : si l'utilisateur quitte la page d'accueil au milieu d'une session
// (par exemple après l'étape « réviser » pour aller lire), il retrouve la
// MÊME session en revenant, plutôt qu'une nouvelle composition qui
// recommencerait à zéro. Seule la session du jour calendaire local est
// conservée — le lendemain, une nouvelle est générée.
//
// Persisté en localStorage (même esprit que lib/dialogue.js#saveSessionId) :
// aucune synchronisation multi-appareils, ce n'est qu'un confort local.

const BASE_KEY = 'leggendo-daily-session'

// Isolée par compte, comme progress.js : deux comptes utilisés sur le même
// navigateur ne doivent jamais se proposer la session composée l'un de
// l'autre.
function keyFor(uid) {
  return uid ? `${BASE_KEY}.${uid}` : BASE_KEY
}

function localDay(ts) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// { date, session } où `session` est la valeur renvoyée par composeSession —
// ou `null` si rien n'est stocké ou que le stockage date d'un autre jour.
export function loadDailySession(now = Date.now(), uid = null) {
  try {
    const raw = localStorage.getItem(keyFor(uid))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.date !== localDay(now)) return null
    return parsed.session || null
  } catch {
    return null
  }
}

export function saveDailySession(session, now = Date.now(), uid = null) {
  try {
    localStorage.setItem(keyFor(uid), JSON.stringify({ date: localDay(now), session }))
  } catch {
    // Stockage indisponible (navigation privée, plein) : pas de reprise, sans plus.
  }
}

export function clearDailySession(uid = null) {
  try {
    localStorage.removeItem(keyFor(uid))
  } catch {
    // rien à nettoyer
  }
}
