// Comparaison phrase cible / phrase reconnue pour l'exercice de prononciation.
//
// Module pur (aucune dépendance DOM, testé par vitest) : normalisation,
// tokenisation, puis alignement token-par-token type Levenshtein. On mesure
// l'exactitude des mots prononcés — pas l'accent ni la prosodie.

// Ponctuation retirée à la normalisation. L'apostrophe est conservée :
// en italien elle fait partie du mot (l'acqua, un'ora) et la reconnaissance
// vocale la restitue de la même façon.
const PUNCTUATION_RE = /[.,;:!?¿¡«»"“”„()[\]{}—–…\-*_/\\]/g

// Normalise un texte pour la comparaison : minuscules, apostrophes
// uniformisées, ponctuation retirée, accents retirés en option (par défaut :
// on les ignore, la diction reste jugée sur les mots, pas sur « perché »
// vs « perche » transcrit).
export function normalize(text, { stripAccents = true } = {}) {
  let s = String(text ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(PUNCTUATION_RE, ' ')
  if (stripAccents) {
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }
  return s.replace(/\s+/g, ' ').trim()
}

export function tokenize(text, options) {
  const s = normalize(text, options)
  return s ? s.split(' ') : []
}

// Alignement de Levenshtein entre les deux listes de tokens, puis
// backtracking pour classer chaque mot :
// - 'ok'     : mot de la cible correctement prononcé
// - 'missed' : mot de la cible absent ou remplacé par autre chose
// - 'extra'  : mot prononcé qui n'est pas dans la cible
function alignTokens(target, spoken) {
  const m = target.length
  const n = spoken.length

  // dp[i][j] = distance entre target[0..i) et spoken[0..j)
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const substCost = target[i - 1] === spoken[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + substCost, // égalité ou substitution
        dp[i - 1][j] + 1, // mot de la cible manqué
        dp[i][j - 1] + 1, // mot en trop
      )
    }
  }

  // Backtracking (on reconstruit du dernier mot vers le premier).
  const ops = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    const substCost =
      i > 0 && j > 0 ? (target[i - 1] === spoken[j - 1] ? 0 : 1) : Infinity
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + substCost) {
      if (substCost === 0) {
        ops.push({ word: target[i - 1], status: 'ok' })
      } else {
        // Substitution : la cible est ratée, le mot dit est en trop.
        ops.push({ word: spoken[j - 1], status: 'extra' })
        ops.push({ word: target[i - 1], status: 'missed' })
      }
      i--
      j--
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ word: target[i - 1], status: 'missed' })
      i--
    } else {
      ops.push({ word: spoken[j - 1], status: 'extra' })
      j--
    }
  }
  return ops.reverse()
}

// Compare la phrase cible et la phrase reconnue.
// Retourne { score, words } :
// - score : 0-100, part des mots de la cible bien prononcés, pénalisée par
//   les mots en trop (matchs / max(longueur cible, longueur dite))
// - words : mots dans l'ordre d'alignement, chacun { word, status } avec
//   status 'ok' | 'missed' | 'extra'
export function comparePhrases(target, spoken, options = {}) {
  const targetTokens = tokenize(target, options)
  const spokenTokens = tokenize(spoken, options)

  if (targetTokens.length === 0) {
    return {
      score: 0,
      words: spokenTokens.map((word) => ({ word, status: 'extra' })),
    }
  }

  const words = alignTokens(targetTokens, spokenTokens)
  const matches = words.filter((w) => w.status === 'ok').length
  const score = Math.round(
    (100 * matches) / Math.max(targetTokens.length, spokenTokens.length),
  )
  return { score, words }
}
