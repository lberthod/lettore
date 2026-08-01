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

// { date, session, prevDate, prevTypes } où `session` est la valeur renvoyée
// par composeSession — ou `null` si rien n'est stocké ou que le stockage
// date d'un autre jour. `prevDate`/`prevTypes` (voir plus bas) survivent au
// changement de jour : c'est justement ce qui permet de les lire le
// lendemain.
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
    const key = keyFor(uid)
    const date = localDay(now)
    let prevDate = null
    let prevTypes = null
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.date === date) {
        // Recomposition le même jour (ex. objectif changé) : on garde le
        // souvenir de la veille déjà en place, on ne l'écrase pas avec la
        // session du jour qui n'est pas encore terminée.
        prevDate = parsed.prevDate || null
        prevTypes = parsed.prevTypes || null
      } else if (parsed && parsed.session) {
        // Le stockage passe au jour suivant : la session qu'il contenait
        // devient « celle d'hier », dont lib/percorso.js#composeSession se
        // sert pour éviter de reproduire exactement la même composition deux
        // jours de suite — y compris pour un utilisateur qui n'a rien
        // terminé (la seule donnée alors disponible est la recommandation
        // elle-même, pas le journal d'activité).
        prevDate = parsed.date
        prevTypes = (parsed.session.steps || []).map((s) => s.type)
      }
    }
    localStorage.setItem(key, JSON.stringify({ date, session, prevDate, prevTypes }))
  } catch {
    // Stockage indisponible (navigation privée, plein) : pas de reprise, sans plus.
  }
}

// Types d'étapes de la session RECOMMANDÉE hier (pas forcément terminée),
// si le stockage local en garde le souvenir — `null` sinon (premier jour,
// stockage vidé, ou plus d'un jour d'écart).
export function loadYesterdaySessionTypes(now = Date.now(), uid = null) {
  try {
    const raw = localStorage.getItem(keyFor(uid))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.prevTypes)) return null
    const yesterday = localDay(now - 24 * 60 * 60 * 1000)
    return parsed.prevDate === yesterday ? parsed.prevTypes : null
  } catch {
    return null
  }
}

export function clearDailySession(uid = null) {
  try {
    localStorage.removeItem(keyFor(uid))
  } catch {
    // rien à nettoyer
  }
}
