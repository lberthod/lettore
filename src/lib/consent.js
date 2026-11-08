// Consentement à la mesure d'audience (Google Analytics 4, via Firebase).
//
// Les cookies d'analyse de Google ne sont pas exemptés de consentement
// (CNIL, lignes directrices « cookies et autres traceurs ») : aucun script
// Analytics n'est chargé tant que le visiteur n'a pas cliqué « Accepter »
// dans ConsentBanner.vue. Refuser est aussi simple qu'accepter, et le choix
// se modifie à tout moment depuis la page Confidentialité.
//
// Le choix est conservé 6 mois dans le navigateur, puis redemandé.

import { ref } from 'vue'

const STORAGE_KEY = 'leggendo:analytics-consent'
const MAX_AGE_MS = 182 * 24 * 60 * 60 * 1000

function readChoice() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (
      (saved?.choice === 'granted' || saved?.choice === 'denied') &&
      Date.now() - saved.ts < MAX_AGE_MS
    ) {
      return saved.choice
    }
  } catch {
    // Stockage indisponible ou valeur illisible : on redemandera.
  }
  return null
}

// 'granted' | 'denied' | null (pas encore de choix : la bannière s'affiche)
export const analyticsConsent = ref(readChoice())

export function setAnalyticsConsent(choice) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice, ts: Date.now() }))
  } catch {
    // Sans stockage, le choix vaut pour cette visite seulement.
  }
  analyticsConsent.value = choice
}

// Cookies posés par Google Analytics (_ga, _ga_<ID>), sur le domaine courant
// comme sur le domaine parent (.leggendo.fr).
function deleteAnalyticsCookies() {
  const host = window.location.hostname
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0].trim()
    if (!name.startsWith('_ga')) continue
    for (const domain of ['', `; domain=${host}`, `; domain=.${host}`]) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain}`
    }
  }
}

// « Gérer mes choix » (page Confidentialité) : la bannière réapparaît. Si la
// mesure était active, le script déjà chargé ne peut pas être déchargé : on
// efface ses cookies et on recharge la page, qui repart sans Analytics.
export function reopenConsentChoice() {
  const wasGranted = analyticsConsent.value === 'granted'
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // rien à effacer
  }
  analyticsConsent.value = null
  if (wasGranted) {
    deleteAnalyticsCookies()
    window.location.reload()
  }
}
