#!/usr/bin/env node
// Contrôle de niveau CECR des textes src/texts/*.json.
//
//   node scripts/check-levels.mjs            rapport (code de sortie 0)
//   node scripts/check-levels.mjs --strict   code de sortie 1 s'il y a des textes hors norme
//   node scripts/check-levels.mjs --json     sortie JSON
//   node scripts/check-levels.mjs --level A1 limite le rapport à un niveau
//   node scripts/check-levels.mjs --verbose  affiche aussi les extraits fautifs
//
// Les détections de temps verbaux sont des HEURISTIQUES (terminaisons,
// auxiliaires + participe) : elles peuvent produire des faux positifs/négatifs.
// La liste EXCEPTIONS écarte les homographes courants (passi, classe, ...).
// Un texte « hors norme » est à relire, pas forcément à corriger.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'src', 'texts')

// Normes par niveau : longueur max (mots) et temps interdits.
// Clés de temps : imperfetto, passato_prossimo, passato_remoto, trapassato,
// cong_presente, cong_imperfetto.
export const NORMS = {
  A1: { maxWords: 150, forbidden: ['imperfetto', 'passato_prossimo', 'passato_remoto', 'trapassato', 'cong_presente', 'cong_imperfetto'] },
  A2: { maxWords: 260, forbidden: ['cong_imperfetto'] },
  B1: { maxWords: null, forbidden: [] },
  B2: { maxWords: null, forbidden: [] },
  C1: { maxWords: null, forbidden: [] },
  C2: { maxWords: null, forbidden: [] },
}

export const TENSE_LABELS = {
  imperfetto: 'imparfait',
  passato_prossimo: 'passé composé',
  passato_remoto: 'passé simple',
  trapassato: 'plus-que-parfait',
  cong_presente: 'subjonctif présent',
  cong_imperfetto: 'subjonctif imparfait',
}

// Mots qui ressemblent à une forme verbale mais n'en sont pas.
export const EXCEPTIONS = new Set([
  // -assi / -asse / -essi / -esse (noms, adjectifs, pluriels)
  'passi', 'sassi', 'grassi', 'bassi', 'massi', 'tassi', 'cassi', 'lassi', 'assi', 'gas', 'chassis',
  'classe', 'classi', 'tasse', 'casse', 'masse', 'basse', 'grasse', 'passe', 'asse', 'lasse', 'tassa',
  'tesse', 'messe', 'spesse', 'impresse', 'presse', 'stesse', 'espresse', 'sesse', 'cesse', 'esse', 'essi',
  'spesso', 'adesso', 'permesse', 'promesse', 'confesse', 'successe', 'oppresse', 'depresse', 'repressa',
  'interessi', 'interesse', 'interessi', 'processi', 'successi', 'accessi', 'eccessi', 'espressi',
  'professore', 'professori', 'confessi', 'messi', 'stessi', 'impressi', 'depressi', 'oppressi', 'ammessi',
  'compressi', 'promessi', 'permessi', 'commessi', 'sommessi', 'rimessi', 'dimessi', 'remesse', 'genesi',
  'chiesa', 'chiese', 'chiesi', 'spese', 'prese', 'rese', 'offese', 'difese', 'attese', 'distese', 'riprese',
  'sorprese', 'imprese', 'intese', 'comprese', 'scese', 'cresse', 'lesse', 'resse', 'ressi',
  // verbes en -sse / -ssi passato remoto ou noms : traités ailleurs
  'dissi', 'fosse', 'fossi',
])

// Participes passés irréguliers (hors -ato/-uto/-ito).
const IRR_PP = new Set([
  'fatto', 'detto', 'preso', 'visto', 'scritto', 'letto', 'aperto', 'messo', 'chiuso', 'perso', 'vinto',
  'rotto', 'deciso', 'scelto', 'stato', 'rimasto', 'nato', 'morto', 'speso', 'corso', 'offerto', 'coperto',
  'bevuto', 'acceso', 'spento', 'sceso', 'riso', 'tolto', 'raccolto', 'ottenuto', 'diviso', 'chiesto',
  'risposto', 'successo', 'sorpreso', 'compreso', 'atteso', 'appreso', 'cotto', 'cresciuto', 'conosciuto',
  'trascorso', 'mosso', 'promesso', 'permesso', 'ammesso', 'discusso', 'espresso', 'dipinto', 'vissuto', 'giunto',
  'spinto', 'scoperto', 'tenuto', 'assunto', 'raggiunto', 'costruito', 'esposto', 'proposto', 'disposto',
])
// Participes qui sont aussi des adjectifs/noms fréquents après « è/sono » (état, pas temps composé).
const ADJ_PP = new Set([
  'stanco', 'sposato', 'sposata', 'sposati', 'sposate', 'arrabbiato', 'arrabbiata', 'arrabbiati', 'arrabbiate',
  'preoccupato', 'preoccupata', 'preoccupati', 'preoccupate', 'vietato', 'vietata', 'vietati', 'vietate',
  'aperto', 'aperta', 'aperti', 'aperte', 'chiuso', 'chiusa', 'chiusi', 'chiuse', 'cotto', 'cotta', 'cotti', 'cotte',
  'fatto', 'fatta', 'fatti', 'fatte', 'nato', 'nata', 'nati', 'nate', 'morto', 'morta', 'morti', 'morte',
  'finito', 'finita', 'finiti', 'finite', 'stufo', 'perso', 'emozionato', 'emozionata', 'emozionati', 'emozionate', 'sabato', 'entusiasta', 'persa', 'persi', 'perse',
  'stupito', 'stupita', 'stupiti', 'stupite', 'abituato', 'abituata', 'abituati', 'abituate',
  'educato', 'educata', 'educati', 'educate', 'ordinato', 'ordinata', 'ordinati', 'ordinate',
  'affollato', 'affollata', 'affollati', 'affollate', 'organizzato', 'organizzata', 'organizzati', 'organizzate',
  'occupato', 'occupata', 'occupati', 'occupate', 'illuminato', 'illuminata', 'illuminati', 'illuminate',
  'decorato', 'decorata', 'decorati', 'decorate', 'conosciuto', 'conosciuta', 'conosciuti', 'conosciute',
  'dipinto', 'dipinta', 'dipinti', 'dipinte', 'scritto', 'scritta', 'scritti', 'scritte',
  'famoso', 'invitato', 'invitata', 'invitati', 'invitate', 'riservato', 'riservata', 'riservati', 'riservate',
  'sorpreso', 'sorpresa', 'sorpresi', 'sorprese', 'sdraiato', 'sdraiata', 'sdraiati', 'sdraiate',
  'seduto', 'seduta', 'seduti', 'sedute', 'nascosto', 'nascosta', 'nascosti', 'nascoste',
  'contento', 'cresciuto', 'cresciuta', 'cresciuti', 'cresciute', 'situato', 'situata', 'situati', 'situate',
  'circondato', 'circondata', 'circondati', 'circondate', 'diviso', 'divisa', 'divisi', 'divise',
  'compreso', 'compresa', 'compresi', 'comprese', 'spento', 'spenta', 'spenti', 'spente',
  'acceso', 'accesa', 'accesi', 'accese', 'pronto', 'delicato', 'delicata', 'delicati', 'delicate',
  'dedicato', 'dedicata', 'dedicati', 'dedicate', 'formato', 'formata', 'formati', 'formate',
  'costruito', 'costruita', 'costruiti', 'costruite', 'esposto', 'esposta', 'esposti', 'esposte',
  'servito', 'servita', 'serviti', 'servite', 'stato', 'stata', 'stati', 'state',
])

const AUX_AVERE = new Set(['ho', 'hai', 'ha', 'abbiamo', 'avete', 'hanno'])
const AUX_ESSERE = new Set(['sono', 'sei', 'è', 'e\'', 'siamo', 'siete'])
const ADVERBS = new Set(['già', 'appena', 'sempre', 'mai', 'ancora', 'anche', 'proprio', 'poi', 'non', 'tutti', 'tutte', 'tutto', 'tanto', 'molto', 'subito', 'finalmente', 'ieri', 'bene', 'male'])

const IMPERFETTO_ESSERE = new Set(['ero', 'eri', 'era', 'eravamo', 'eravate', 'erano'])
const IMPERFETTO_AVERE = new Set(['avevo', 'avevi', 'aveva', 'avevamo', 'avevate', 'avevano'])
// Imparfait irrégulier fréquent
const IMPERFETTO_IRR = new Set([
  'facevo', 'facevi', 'faceva', 'facevamo', 'facevate', 'facevano',
  'dicevo', 'dicevi', 'diceva', 'dicevamo', 'dicevate', 'dicevano',
  'bevevo', 'beveva', 'bevevano', 'portava', 'andava', 'andavano',
])
// Formes en -ava/-eva/-iva etc. : terminaisons de l'imparfait. Exceptions : mots
// non verbaux ou formes de présent/passé simple homographes.
const IMPERF_RE = /^[a-zàèéìòù]{1,}(avo|avi|ava|avamo|avate|avano|evo|evi|eva|evamo|evate|evano|ivo|ivi|iva|ivamo|ivate|ivano)$/
const IMPERF_EXC = new Set([
  'nuova', 'nuove', 'prova', 'prove', 'cava', 'lava', 'brava', 'piova', 'trova', 'uva', 'riva', 'diva', 'viva',
  'vivo', 'vivi', 'attiva', 'attivi', 'attivo', 'cattiva', 'cattivi', 'cattivo', 'creativa', 'creativi', 'creativo',
  'positiva', 'positivi', 'positivo', 'negativa', 'negativi', 'negativo', 'primitiva', 'primitivi', 'primitivo',
  'decisiva', 'decisivi', 'decisivo', 'intensiva', 'intensivi', 'intensivo', 'esclusiva', 'esclusivi', 'esclusivo',
  'giornata', 'sera', 'prima', 'estiva', 'estivi', 'estivo', 'invernale', 'festa', 'festivo', 'festiva', 'festivi',
  'compulsiva', 'collettiva', 'collettivi', 'collettivo', 'rappresentativa', 'rappresentativi', 'rappresentativo',
  'tradizionale', 'cultivo', 'olivo', 'olivi', 'ulivo', 'ulivi', 'archivio', 'archivi', 'privo', 'privi', 'priva',
  'evita', 'evitiamo', 'servo', 'servi', 'serva', 'riva', 'rive', 'chiave', 'neve', 'breve', 'brevi', 'leve', 'greve',
  'lieve', 'lievi', 'nevi', 'sevo', 'devo', 'devi', 'deve', 'debbo', 'bevo', 'bevi', 'beve', 'ricevo', 'ricevi',
  'riceve', 'vedevi', 'scrivo', 'scrivi', 'arrivo', 'arrivi', 'arriva', 'salva', 'salvo', 'salvi', 'calvo', 'alva',
  'orsa', 'gerarchiva', 'offensiva', 'offensivo', 'difensiva', 'difensivo', 'iniziativa', 'iniziative',
  'alternativa', 'alternative', 'alternativo', 'relativo', 'relativa', 'relativi', 'relative', 'sensitiva',
  'cooperativa', 'cooperative', 'narrativa', 'narrative', 'narrativo', 'attivita', 'abitativa', 'abitativo',
  'ricettiva', 'ricettivo', 'cumulativa', 'cumulativo', 'espressiva', 'espressivo', 'ricreativa', 'ricreativo',
  'sportiva', 'sportivo', 'sportivi', 'sportive', 'furtivo', 'furtiva', 'passivo', 'passiva', 'passivi', 'passive',
  'elusiva', 'conclusiva', 'conclusivo', 'impulsivo', 'impulsiva', 'impulsivi', 'impulsive', 'effusiva',
  'evasiva', 'evasivo', 'persuasiva', 'persuasivo', 'successivo', 'successiva', 'successivi', 'successive',
  'precedente', 'estensivo', 'estensiva', 'inventiva', 'inventivo', 'cultiva', 'coltiva', 'coltivo', 'coltivi',
  'motivo', 'motivi', 'motiva', 'motivano', 'olimpiva', 'ispettivo', 'selettivo', 'selettiva',
  'collettiva', 'speculativa', 'speculativo', 'costruttiva', 'costruttivo', 'costruttivi', 'costruttive',
  'distruttiva', 'distruttivo', 'produttivo', 'produttiva', 'produttivi', 'produttive', 'riflessiva', 'riflessivo',
  'divisiva', 'divisivo', 'agevo', 'trevi', 'nave', 'navi', 'cave', 'cavi', 'savi', 'bravi', 'gravi', 'lavi', 'ravi',
  'travi', 'slavi', 'schiavi', 'schiavo', 'chiavi', 'octavi', 'bava', 'brava', 'bravo', 'lava', 'lavo', 'lavi',
  'cavo', 'pavo', 'favo', 'favi', 'ottavo', 'ottava', 'ottavi', 'ottave',
  'gravi', 'grava', 'gravo', 'octava', 'rava', 'ravi', 'savo', 'sava', 'slavo', 'slava', 'travo', 'trava',
  'vava', 'zava', 'nevi', 'levi', 'leva', 'levo', 'sleva', 'rileva', 'eleva', 'elevo', 'solleva',
  'rivoli', 'olivi', 'olivo', 'oliva', 'olive', 'bolivi', 'bolivia', 'liva', 'livi', 'livo', 'civi', 'civa',
  'divano', 'arrivano', 'privano', 'evviva', 'lavano', 'salvano', 'cavano', 'rivano', 'scrivano',
])

const PASSATO_REMOTO_RE = /^(fui|fosti|fu|fummo|foste|furono|ebbi|avesti|ebbe|avemmo|aveste|ebbero|dissi|disse|dissero|feci|fece|fecero|vidi|vide|videro|venne|vennero|venni|presi|prese|presero|misi|mise|misero|scrisse|scrissero|vinse|vinsero|nacque|nacquero|morì|morirono|andò|andarono|arrivò|arrivarono|chiese|chiesero|rimase|rimasero|decise|decisero|diede|diedero|stette|stettero|poté|potè|dovette|dovettero|volle|vollero|seppe|seppero)$/
// Formes « -ò »/« -arono » (passé simple régulier, 3e personne)
const PR_REGULAR = /^[a-zàèéìòù]{3,}(arono|erono|irono)$/
const PR_O = /^[a-zàèéìòù]{3,}(ò)$/
const PR_EXC = new Set(['niccolò', 'nicolò', 'oblò', 'falò', 'paletò', 'può', 'più', 'già', 'giù', 'ciò', 'però', 'perciò', 'cioè', 'così', 'lassù', 'quaggiù', 'laggiù', 'gioventù', 'virtù', 'tribù', 'caffè', 'bignè', 'tè', 'è', 'ahimè', 'fu', 'ebbe', 'poté', 'potè', 'scrisse', 'vide', 'prese', 'fece', 'diede', 'dissi', 'disse', 'vinse', 'fui', 'ebbi', 'ebbero', 'furono'])
// « può » est un présent ; le passé simple « -ò » est rare à l'A1/A2 : liste ciblée d'exceptions ci-dessus.
const PR_AMBIG = new Set(['fu', 'fui', 'ebbe', 'vide', 'prese', 'fece', 'disse', 'dissi', 'presi', 'mise', 'misi', 'venne', 'vinse', 'diede', 'scrisse', 'rimase', 'decise', 'volle', 'seppe', 'ebbi', 'avemmo', 'aveste', 'avesti'])

const CONG_IMPERF_RE = /^[a-zàèéìòù]{2,}(assi|asse|assimo|aste|assero|essi|esse|essimo|este|essero)$/
const CONG_IMPERF_IRR = new Set(['fossi', 'fosse', 'fossimo', 'foste', 'fossero', 'avessi', 'avesse', 'avessimo', 'aveste', 'avessero', 'facessi', 'facesse', 'dicessi', 'dicesse', 'stessi', 'stesse', 'dessi', 'desse'])
const CONG_IMPERF_EXC = new Set([
  'passi', 'sassi', 'grassi', 'bassi', 'tassi', 'cassi', 'classi', 'classe', 'tasse', 'casse', 'masse', 'basse', 'grasse', 'passe',
  'asse', 'lasse', 'messe', 'spesse', 'impresse', 'presse', 'espresse', 'esse', 'essi', 'interesse', 'interessi', 'processi',
  'successi', 'accessi', 'eccessi', 'espressi', 'messi', 'permessi', 'promessi', 'ammessi', 'compressi', 'oppressi', 'depressi',
  'impressi', 'sommessi', 'dimessi', 'rimessi', 'remesse', 'genesi', 'stessi', 'stesse', 'lasciasse',
  'chiese', 'chiesi', 'chiese', 'spese', 'prese', 'rese', 'attese', 'tesse', 'confessi', 'professi', 'professore',
  'questi', 'queste', 'questo', 'quest', 'este', 'aste', 'iste', 'assimo', 'sesse', 'cesse', 'lesse', 'resse', 'cresse', 'ressi',
  'tessere', 'chiesi', 'isse', 'issi', 'pisse', 'misse', 'amisse', 'fisse', 'fissi', 'abissi', 'abisso', 'missi', 'dissi',
  'risse', 'rissa', 'vissi', 'vissi', 'scisse', 'sissi', 'sisse', 'tisse', 'visse', 'tisi', 'abisse', 'ellissi', 'eclissi',
  'eclissi', 'ellisse', 'ellissi', 'iperbolici', 'paradisse', 'paradisi', 'ricisse', 'trisse', 'trissi', 'tessi', 'cresce',
  'cassa', 'cassi', 'cassa', 'tassa', 'tassi', 'bisse', 'bissi', 'dessi', 'desse', 'messe', 'finisse', 'finissi',
  'progressi', 'cipressi', 'ingressi', 'regressi', 'congressi', 'sessi', 'fessi', 'scossi', 'cipresse',
])

const CONG_PRES_TRIGGER = /\b(che|affinché|benché|sebbene|purché|nonostante|prima che|a meno che)\s+(?:non\s+|ci\s+|lo\s+|la\s+|si\s+|mi\s+|ti\s+)?([a-zàèéìòù']+)/gi
const CONG_PRES_FORMS = new Set([
  'sia', 'siano', 'siate', 'abbia', 'abbiano', 'abbiate', 'vada', 'vadano', 'faccia', 'facciano', 'possa', 'possano',
  'voglia', 'vogliano', 'debba', 'debbano', 'dica', 'dicano', 'stia', 'stiano', 'venga', 'vengano', 'esca', 'escano',
  'sappia', 'sappiano', 'riesca', 'riescano', 'dia', 'diano', 'beva', 'bevano', 'tenga', 'tengano', 'rimanga',
  'capisca', 'finisca', 'parta', 'parli', 'mangi', 'arrivi', 'torni', 'resti', 'dorma', 'senta', 'pensi', 'costi',
])

function tokens(s) {
  return (s.toLowerCase().normalize('NFC').match(/[a-zàèéìòù]+(?:'[a-zàèéìòù]+)*|\d+/g) || [])
    .flatMap((t) => (t.includes("'") ? t.split("'") : [t]))
}

function countWordsOf(paragraphs) {
  let n = 0
  for (const p of paragraphs) {
    // retire le nom du locuteur des dialogues : « MARCO — … »
    const body = p.replace(/^[A-ZÀÈÉÌÒÙ' ]{2,}\s+[—–-]\s+/, '')
    n += (body.match(/[A-Za-zÀ-ÿ]+(?:['’][A-Za-zÀ-ÿ]+)*|\d+/g) || []).length
  }
  return n
}

const NOT_PP = new Set(['sabato', 'stato', 'cato', 'fato', 'dato', 'prato', 'pomodoro', 'lato', 'mercato', 'senato', 'avvocato', 'soldato', 'gatto', 'formaggio'])
function isParticiple(w) {
  if (NOT_PP.has(w) && w !== 'stato') return false
  if (IRR_PP.has(w)) return true
  return /^[a-zàèéìòù]{3,}(ato|ata|ati|ate|uto|uta|uti|ute|ito|ita|iti|ite)$/.test(w) && w.length >= 5
}

// Retourne { tense: [extraits] } pour un paragraphe.
function detect(paragraph) {
  const hits = {}
  const add = (t, ex) => (hits[t] ||= new Set()).add(ex)
  const body = paragraph.replace(/^[A-ZÀÈÉÌÒÙ' ]{2,}\s+[—–-]\s+/, '')
  // Découpe en phrases pour que l'auxiliaire et le participe restent proches
  const sentences = body.split(/(?<=[.!?…])\s+/)
  for (const sent of sentences) {
    const w = (sent.toLowerCase().match(/[a-zàèéìòù]+(?:['’][a-zàèéìòù]+)*/g) || []).map((x) => x.replace('’', "'"))
    // élision : « c'è », « l'ho », « m'ha » → on éclate
    const t = w.flatMap((x) => (x.includes("'") ? x.split("'") : [x]))
    for (let i = 0; i < t.length; i++) {
      const x = t[i]
      // imparfait
      if (IMPERFETTO_ESSERE.has(x) || IMPERFETTO_AVERE.has(x) || IMPERFETTO_IRR.has(x)) add('imperfetto', x)
      else if (!IMPERF_EXC.has(x) && IMPERF_RE.test(x) && !EXCEPTIONS.has(x)) add('imperfetto', x)
      // passé composé : auxiliaire (+ adverbes) + participe
      if (AUX_AVERE.has(x) || AUX_ESSERE.has(x)) {
        let j = i + 1
        while (j < t.length && ADVERBS.has(t[j])) j++
        const p = t[j]
        if (p && isParticiple(p) && !EXCEPTIONS.has(p)) {
          const esse = AUX_ESSERE.has(x)
          // « è/sono + participe » : on ignore les adjectifs d'état fréquents, sauf « stato »
          if (!(esse && ADJ_PP.has(p) && p !== 'stato')) {
            if (!(!esse && ['ha', 'hanno', 'ho', 'hai'].includes(x) && p === 'ito')) add('passato_prossimo', `${x} ${p}`)
          }
        }
        if (AUX_AVERE.has(x) && IRR_PP.has(p) && !['aperto', 'chiuso'].includes(p)) add('passato_prossimo', `${x} ${p}`)
      }
      // trapassato : aveva/era + participe
      if (IMPERFETTO_ESSERE.has(x) || IMPERFETTO_AVERE.has(x)) {
        const p = t[i + 1]
        if (p && isParticiple(p) && !(IMPERFETTO_ESSERE.has(x) && ADJ_PP.has(p))) add('trapassato', `${x} ${p}`)
      }
      // passé simple
      if (PASSATO_REMOTO_RE.test(x) && !['fu'].includes(x) || /^[a-zàèéìòù]{3,}(arono|erono|irono)$/.test(x)) {
        if (!PR_EXC.has(x) || PR_AMBIG.has(x)) add('passato_remoto', x)
      } else if (PR_O.test(x) && !PR_EXC.has(x) && !/rò$/.test(x)) {
        // passé simple régulier en -ò (« si arrabbiò », « portò ») ; PR_EXC écarte
        // les mots en -ò qui ne sont pas des verbes (però, può, ciò, falò...) ; les
        // futurs en -rò (« dimenticherò ») sont exclus.
        add('passato_remoto', x)
      } else if (/^(andò|arrivò|parlò|chiamò|tornò|entrò|uscì|partì|salì|capì|finì|rispose|rimase|credette|pensò|guardò|disse|mangiò|passò|trovò|cominciò|decise|ritornò|restò|portò|lasciò|iniziò|visse|morì|nacque|costruì|scoprì|conquistò|dipinse|scolpì|inventò)$/.test(x)) add('passato_remoto', x)
      // subjonctif imparfait
      if (CONG_IMPERF_IRR.has(x) && !['stesse', 'stessi', 'desse', 'dessi'].includes(x)) add('cong_imperfetto', x)
      else if (CONG_IMPERF_RE.test(x) && !CONG_IMPERF_EXC.has(x) && !EXCEPTIONS.has(x) && !PASSATO_REMOTO_RE.test(x)) {
        if (/(assi|asse|assimo|assero|essi|esse|essimo|essero)$/.test(x)) add('cong_imperfetto', x)
      }
    }
    // subjonctif présent : « che » + forme connue
    CONG_PRES_TRIGGER.lastIndex = 0
    let m
    while ((m = CONG_PRES_TRIGGER.exec(sent))) {
      const f = m[2].toLowerCase()
      if (CONG_PRES_FORMS.has(f) && !['dia'].includes(f)) add('cong_presente', `${m[1]} ${m[2]}`)
    }
  }
  const out = {}
  for (const [k, v] of Object.entries(hits)) out[k] = [...v]
  return out
}

function analyse(file) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'))
  if (!Array.isArray(raw.paragraphs)) return null
  const level = raw.level
  const norm = NORMS[level]
  const words = countWordsOf(raw.paragraphs)
  const all = {}
  raw.paragraphs.forEach((p, idx) => {
    const h = detect(p)
    for (const [k, v] of Object.entries(h)) {
      ;(all[k] ||= []).push(...v.map((e) => ({ para: idx + 1, form: e })))
    }
  })
  const issues = []
  if (norm?.maxWords && words > norm.maxWords) issues.push({ type: 'length', detail: `${words} mots > ${norm.maxWords}` })
  const tenses = {}
  for (const [k, v] of Object.entries(all)) {
    tenses[k] = [...new Set(v.map((x) => x.form))]
    if (norm?.forbidden.includes(k)) issues.push({ type: 'tense', tense: k, detail: `${TENSE_LABELS[k]} : ${[...new Set(v.map((x) => x.form))].slice(0, 6).join(', ')}` })
  }
  return { id: raw.id || file.replace(/\.json$/, ''), file, level, words, tenses, issues }
}

function main() {
  const argv = process.argv.slice(2)
  const strict = argv.includes('--strict')
  const asJson = argv.includes('--json')
  const verbose = argv.includes('--verbose')
  const li = argv.indexOf('--level')
  const only = li >= 0 ? argv[li + 1] : null
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'index.json').sort()
  const results = []
  for (const f of files) {
    try {
      const r = analyse(f)
      if (r && (!only || r.level === only)) results.push(r)
    } catch (e) {
      results.push({ id: f, file: f, level: null, words: 0, tenses: {}, issues: [{ type: 'error', detail: `JSON illisible : ${e.message}` }] })
    }
  }
  const flagged = results.filter((r) => r.issues.length)
  const stats = {}
  for (const r of results) {
    const l = r.level || '??'
    stats[l] ||= { total: 0, flagged: 0, tooLong: 0, badTense: 0 }
    stats[l].total++
    if (r.issues.length) stats[l].flagged++
    if (r.issues.some((i) => i.type === 'length')) stats[l].tooLong++
    if (r.issues.some((i) => i.type === 'tense')) stats[l].badTense++
  }
  if (asJson) {
    console.log(JSON.stringify({ norms: NORMS, stats, flagged: flagged.map(({ tenses, ...r }) => r) , total: results.length }, null, 2))
  } else {
    console.log(`Contrôle de niveau - ${results.length} textes analysés (heuristique ; mode ${strict ? 'strict' : 'rapport'})`)
    for (const lvl of Object.keys(NORMS)) {
      const list = flagged.filter((r) => r.level === lvl).sort((a, b) => b.words - a.words)
      if (!list.length) continue
      console.log(`\n== ${lvl} : ${list.length} texte(s) hors norme ==`)
      for (const r of list) {
        console.log(`- ${r.id} (${r.words} mots)`)
        for (const i of r.issues) console.log(`    ${i.type === 'length' ? 'longueur' : i.type === 'tense' ? 'temps' : 'erreur'} : ${i.detail}`)
      }
    }
    const err = flagged.filter((r) => !r.level || !NORMS[r.level])
    for (const r of err) console.log(`- ${r.id} : niveau inconnu/erreur ${r.issues.map((i) => i.detail).join(' ; ')}`)
    console.log('\nRésumé par niveau (hors norme / total ; trop longs ; temps interdits)')
    for (const [l, s] of Object.entries(stats).sort()) console.log(`  ${l}: ${s.flagged}/${s.total} ; longueur ${s.tooLong} ; temps ${s.badTense}`)
    if (verbose) console.log('\n(--verbose : les extraits fautifs sont listés ci-dessus)')
  }
  if (strict && flagged.length) process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
