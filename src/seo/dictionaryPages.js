// Sélection du premier lot de fiches /dizionario/<lemma> indexables
// (GPTanalyse.md, § 7 « Transformer le dictionnaire en pages SEO »).
//
// Le dictionnaire compte ~11 275 lemmes, mais le document lui-même
// recommande de ne pas publier des milliers de pages avant d'avoir mesuré
// l'indexation et l'engagement des premières. Ce module fournit donc une
// sélection éditoriale initiale (verbes essentiels + vocabulaire A1/A2)
// plutôt que le catalogue complet — le lot pourra être élargi plus tard à
// partir des requêtes Search Console.
//
// Node-safe (pas d'API navigateur) : utilisé par scripts/generate-sitemap.mjs
// et scripts/prerender.mjs, tous deux exécutés en dehors du navigateur — donc
// séparé de src/lib/dictionary.js, qui dépend d'import.meta.glob (Vite).

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shardKey } from '../dictionary/shard-key.js'

const DICTIONARY_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dictionary'
)

const SEED_LEMMAS = [
  // Verbes essentiels et irréguliers les plus fréquents
  'essere', 'avere', 'fare', 'andare', 'dire', 'potere', 'volere', 'dovere',
  'sapere', 'venire', 'dare', 'stare', 'vedere', 'parlare', 'mangiare',
  'bere', 'uscire', 'entrare', 'prendere', 'mettere', 'portare', 'arrivare',
  'partire', 'tornare', 'chiamare', 'pensare', 'sentire', 'capire', 'finire',
  'aprire', 'chiudere', 'scrivere', 'leggere', 'dormire', 'lavorare',
  'studiare', 'giocare', 'comprare', 'vendere', 'cercare', 'trovare',
  'aspettare', 'ascoltare', 'guardare', 'camminare', 'correre', 'ridere',
  'piangere', 'amare', 'vivere', 'morire', 'nascere', 'crescere', 'restare',
  'rimanere', 'diventare', 'sembrare', 'conoscere', 'ricordare',
  'dimenticare', 'imparare', 'insegnare', 'spiegare', 'raccontare',
  'domandare', 'rispondere', 'chiedere', 'offrire', 'accettare', 'rifiutare',
  'decidere', 'scegliere', 'cambiare', 'continuare', 'cominciare',
  'iniziare', 'smettere', 'provare', 'tentare', 'riuscire', 'perdere',
  'vincere', 'nuotare', 'volare', 'guidare', 'viaggiare', 'visitare',
  'abitare', 'costruire', 'creare', 'preparare', 'cucinare', 'lavare',
  'pulire', 'ordinare', 'pagare', 'costare', 'guadagnare', 'spendere',
  'aiutare', 'salvare', 'proteggere', 'difendere',
  // Vocabulaire A1/A2 courant
  'casa', 'famiglia', 'amico', 'tempo', 'giorno', 'anno', 'mese',
  'settimana', 'ora', 'mattina', 'sera', 'notte', 'acqua', 'pane', 'vino',
  'caffè', 'città', 'paese', 'strada', 'scuola', 'lavoro', 'libro',
  'parola', 'lingua', 'nome', 'numero', 'colore', 'grande', 'piccolo',
  'bello', 'brutto', 'buono', 'cattivo', 'nuovo', 'vecchio', 'giovane',
  'lungo', 'corto', 'alto', 'basso', 'caldo', 'freddo', 'facile',
  'difficile', 'importante', 'possibile', 'necessario', 'sempre', 'mai',
  'spesso', 'oggi', 'domani', 'ieri', 'presto', 'tardi', 'qui', 'là',
  'sopra', 'sotto', 'dentro', 'fuori', 'vicino', 'lontano', 'molto',
  'poco', 'tanto', 'troppo', 'ancora', 'già', 'anche', 'allora', 'quindi',
  'perché', 'quando', 'dove', 'come', 'chi', 'che', 'cosa', 'quale',
  'quanto',
]

function readShard(dir, key) {
  try {
    return JSON.parse(
      readFileSync(path.join(DICTIONARY_DIR, `${dir}/${key}.json`), 'utf8')
    )
  } catch {
    return {}
  }
}

// « Une fiche sans définition ni exemple ne doit pas être indexée »
// (GPTanalyse.md, § 7).
function isQualityEntry(entry) {
  return (
    !!entry &&
    !!entry.definition_it &&
    Array.isArray(entry.examples) &&
    entry.examples.length > 0
  )
}

let cache = null

// Lemmes retenus pour /dizionario/<lemma>, dans l'ordre de SEED_LEMMAS,
// dédupliqués et filtrés aux entrées complètes réellement présentes.
export function getSeoDictionaryEntries() {
  if (cache) return cache
  const seen = new Set()
  const out = []
  for (const lemma of SEED_LEMMAS) {
    if (seen.has(lemma)) continue
    seen.add(lemma)
    const entry = readShard('lemmas', shardKey(lemma))[lemma]
    if (isQualityEntry(entry)) out.push(entry)
  }
  cache = out
  return out
}
