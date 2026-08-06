// Convertit un nombre écrit en toutes lettres en italien (ex.
// « millequattrocentonovantadue ») vers sa valeur numérique, pour l'affichage
// en chiffres arabes au clic sur un mot dans un dialogue (les textes générés
// pour la synthèse vocale écrivent les nombres en toutes lettres, jamais en
// chiffres, car les moteurs TTS prononcent mal les chiffres bruts).

const UNITS = { uno: 1, due: 2, tre: 3, tré: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9 }
const TEENS = {
  dieci: 10, undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15,
  sedici: 16, diciassette: 17, diciotto: 18, diciannove: 19,
}
const TENS = {
  venti: 20, trenta: 30, quaranta: 40, cinquanta: 50, sessanta: 60,
  settanta: 70, ottanta: 80, novanta: 90,
}
const HUNDRED_PREFIXES = { due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9 }

// Nombre 0-99 → valeur, en tenant compte de l'élision devant "uno"/"otto"
// (venti + uno → ventuno, trenta + otto → trentotto) et de l'accent final
// sur « tré » quand il termine le nombre entier (ventitré).
function parseUnder100(s) {
  if (s === '') return 0
  if (s in TEENS) return TEENS[s]
  if (s in UNITS) return UNITS[s] // « tré » isolé (3) en fin de composé (ex. milletré)
  for (const [word, value] of Object.entries(TENS)) {
    if (s === word) return value
    const stem = word.slice(0, -1)
    if (s === stem + 'uno') return value + 1
    if (s === stem + 'otto') return value + 8
    for (const [uw, uv] of Object.entries(UNITS)) {
      if (uw === 'uno' || uw === 'otto' || uw === 'tré') continue
      if (s === word + uw) return value + uv
    }
    if (s === word + 'tré') return value + 3
  }
  return null
}

function parseUnder1000(s) {
  if (s === '') return 0
  if (s.startsWith('cento')) return 100 + (parseUnder100(s.slice(5)) ?? invalid())
  for (const [prefix, digit] of Object.entries(HUNDRED_PREFIXES)) {
    if (s.startsWith(prefix + 'cento')) {
      const rest = parseUnder100(s.slice((prefix + 'cento').length))
      return rest === null ? null : digit * 100 + rest
    }
  }
  return parseUnder100(s)
}

function invalid() {
  return null
}

// Convertit un mot italien en nombre entier, ou renvoie null si ce n'est pas
// un nombre écrit en toutes lettres reconnu (0 à 999 999 999).
export function parseItalianNumberWord(word) {
  let s = word
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
  if (!s) return null

  let millions = 0
  if (s.startsWith('unmilione')) {
    millions = 1
    s = s.slice('unmilione'.length)
  } else if (s.includes('milioni')) {
    const idx = s.indexOf('milioni')
    const head = parseUnder1000(s.slice(0, idx))
    if (head === null) return null
    millions = head
    s = s.slice(idx + 'milioni'.length)
  }

  let thousands = 0
  if (s.startsWith('mille')) {
    thousands = 1
    s = s.slice('mille'.length)
  } else if (s.includes('mila')) {
    const idx = s.indexOf('mila')
    const head = parseUnder1000(s.slice(0, idx))
    if (head === null) return null
    thousands = head
    s = s.slice(idx + 'mila'.length)
  }

  const rest = parseUnder1000(s)
  if (rest === null) return null
  if (millions === 0 && thousands === 0 && rest === 0) return null // mot vide/non reconnu

  return millions * 1_000_000 + thousands * 1000 + rest
}
