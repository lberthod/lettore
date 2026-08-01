<script setup>
import { computed, onMounted, ref } from 'vue'
import SceneLayout from '../components/SceneLayout.vue'
import QuizSection from '../components/QuizSection.vue'
import { RouterLink, useRoute } from 'vue-router'
import { ttsSupported, speakItalian } from '../tts.js'
import { buildExercise, checkExerciseAnswer } from '../lib/errorExercises.js'

const route = useRoute()

function speak(text) {
  speakItalian(text, { rate: 0.9 })
}

// Sommaire de navigation rapide (page = référence à consulter section par
// section, pas un long parcours à faire défiler — voir audit pédagogique).
// Chaque section est un <details> replié par défaut : le clic sur une pastille
// déplie la bonne section avant que le navigateur ne fasse défiler jusqu'à elle.
const SECTIONS = [
  { id: 'nom', label: 'Le nom' },
  { id: 'articles', label: 'Articles' },
  { id: 'adjectif', label: 'Adjectif' },
  { id: 'possessifs', label: 'Possessifs' },
  { id: 'demonstratifs', label: 'Démonstratifs' },
  { id: 'prepositions', label: 'Prépositions' },
  { id: 'piacere', label: 'Piacere' },
  { id: 'pronoms', label: 'Pronoms' },
  { id: 'negation', label: 'Négation' },
  { id: 'comparatif', label: 'Comparatif' },
  { id: 'quantite', label: 'Molto/tanto' },
  { id: 'interrogation', label: 'Questions' },
  { id: 'ortho-cg', label: 'Sons c/g' },
  { id: 'ortho-accents', label: 'Doubles & accents' },
  { id: 'quiz', label: 'Verifica' },
]

const pageRoot = ref(null)

function topics() {
  return pageRoot.value ? Array.from(pageRoot.value.querySelectorAll('details.topic')) : []
}

function openTopic(id) {
  const el = pageRoot.value?.querySelector(`#${id}`)
  if (el) el.open = true
}

function expandAll() {
  topics().forEach((d) => (d.open = true))
}

function collapseAll() {
  topics().forEach((d) => (d.open = false))
}

// Lien direct vers une ancre (partagé, ou retour arrière) : ouvrir la bonne
// section au lieu de faire défiler vers un <details> resté fermé.
onMounted(() => {
  const id = window.location.hash?.slice(1)
  if (id) openTopic(id)
})

const QUIZ_BASE = [
  {
    q: 'Quel est le pluriel de « il problema » ?',
    options: ['i problemi', 'le probleme', 'i probleme', 'la problema'],
    correct: 0,
    explanation:
      '« problema » est masculin malgré son -a final : comme les autres mots grecs en -ma (programma, poeta), il suit le pluriel masculin en -i.',
  },
  {
    q: 'Comment dit-on « une voiture rouge » ?',
    options: ['una rossa macchina', 'una macchina rossa', 'un macchina rosso', 'una macchina rosso'],
    correct: 1,
    explanation:
      "L'adjectif se place après le nom et s'accorde avec lui : macchina est féminin, donc rossa.",
  },
  {
    q: 'Quel article précède « zio » (oncle) ?',
    options: ["il zio", 'lo zio', "l'zio", 'la zio'],
    correct: 1,
    explanation:
      'Devant un mot commençant par une consonne suivie d\'une autre consonne, z, gn ou ps, on utilise lo (et gli, uno au pluriel/indéfini).',
  },
  {
    q: 'Comment dit-on « ma mère » ?',
    options: ['la mia madre', 'mia madre', 'la madre mia', 'mia la madre'],
    correct: 1,
    explanation:
      "Devant un nom de famille au singulier non affectueux, le possessif se met sans article : mia madre, tuo fratello — mais i miei genitori (pluriel) reprend l'article.",
  },
]

const QUIZ_PREPOSITIONS = [
  {
    q: '« Vado ___ mare » (a + il)',
    options: ['al', 'del', 'nel', 'dal'],
    correct: 0,
    explanation: 'a + il → al.',
  },
  {
    q: '« Il libro ___ studente » (di + lo)',
    options: ['dello', 'del', 'dei', 'degli'],
    correct: 0,
    explanation: 'di + lo → dello (devant s+consonne, z, gn…).',
  },
  {
    q: 'Comment dit-on « entre les livres » ?',
    options: ['tra i libri', 'tra il libri', 'fra di libri', 'tra dei libri'],
    correct: 0,
    explanation: 'tra/fra sont interchangeables et suivis directement de l\'article défini, sans di.',
  },
  {
    q: 'Comment dit-on « quel livre ? » devant « libro » ?',
    options: ['quel libro', 'quello libro', "quell'libro", 'quel\'libro'],
    correct: 0,
    explanation:
      'quello se décline comme les prépositions articulées avec l\' : quel (+ consonne simple), quello/quell\' (+ s+cons./voyelle), quella (fém.)…',
  },
]

const QUIZ_PRONOMS = [
  {
    q: 'Comment traduire « Je le vois » ?',
    options: ['Lo vedo', 'Gli vedo', 'Vedo lo', 'Il vedo'],
    correct: 0,
    explanation: 'Le pronom complément direct se place avant le verbe conjugué : Lo vedo.',
  },
  {
    q: 'Comment dit-on « J\'aime la pizza » (littéralement « la pizza me plaît ») ?',
    options: ['Mi piace la pizza', 'Io piaccio la pizza', 'Amo piace la pizza', 'La pizza piace'],
    correct: 0,
    explanation:
      'piacere fonctionne à l\'envers du français : le sujet grammatical est la chose aimée, la personne est un complément indirect (mi, ti, gli…).',
  },
  {
    q: '« Je lui parle » (à Marco, un homme) se traduit par :',
    options: ['Gli parlo', 'Lo parlo', 'Le parlo', 'Ci parlo'],
    correct: 0,
    explanation:
      'Complément indirect masculin singulier : gli. Le est réservé au féminin (a lei) — piège fréquent, le français ne fait pas cette distinction avec « lui ».',
  },
]

const QUIZ_ORTHOGRAPHE = [
  {
    q: 'Quel mot signifie « ballon » ?',
    options: ['pala', 'palla', 'polla', 'paglia'],
    correct: 1,
    explanation: 'palla (deux l) = ballon ; pala (un seul l) = pelle.',
  },
  {
    q: 'Quelle graphie donne le son [dj] doux, comme dans « giorno » ?',
    options: ['gh', 'gi', 'gu', 'gl'],
    correct: 1,
    explanation: 'ge/gi se prononcent [dj] doux ; il faut gh pour garder le son [g] dur devant e/i.',
  },
  {
    q: '« Sì » (oui) et « si » se distinguent par :',
    options: [
      "l'accent, qui différencie l'adverbe du pronom réfléchi",
      'la prononciation, très différente',
      'le genre grammatical',
      "rien, ce sont deux graphies d'un même mot",
    ],
    correct: 0,
    explanation:
      "L'accent écrit sert justement à distinguer des mots courts autrement identiques : è/e, là/la, sì/si, dà/da.",
  },
]

// Un seul quiz récapitulatif en fin de page plutôt que dispersé section par
// section — voir retour utilisateur : mieux vaut un mode « Verifica la
// comprensione » unique à la fin qu'un quiz intégré à chaque rubrique.
const QUIZ_ALL = [...QUIZ_BASE, ...QUIZ_PREPOSITIONS, ...QUIZ_PRONOMS, ...QUIZ_ORTHOGRAPHE]

// --- Continuité depuis une carte d'erreur (§9.4) : ouverture sur une ancre
// précise (voir WordsView.vue → lib/grammarLinks.js) + 2-3 micro-exercices,
// dont au moins un reprend le contexte personnel de l'erreur. Les questions
// génériques réutilisent les quiz déjà écrits pour la section concernée
// plutôt que d'en inventer de nouveaux.
const TOPIC_QUIZ = {
  nom: QUIZ_BASE,
  adjectif: QUIZ_BASE,
  possessifs: QUIZ_BASE,
  articles: QUIZ_BASE,
  prepositions: QUIZ_PREPOSITIONS,
  demonstratifs: QUIZ_PREPOSITIONS,
  pronoms: QUIZ_PRONOMS,
  piacere: QUIZ_PRONOMS,
  negation: QUIZ_PRONOMS,
  comparatif: QUIZ_BASE,
  quantite: QUIZ_BASE,
  'ortho-cg': QUIZ_ORTHOGRAPHE,
  'ortho-accents': QUIZ_ORTHOGRAPHE,
}

// Erreur personnelle transmise par la carte d'origine (query, jamais le
// texte complet d'une production — juste une phrase et sa correction).
const personalExercise = computed(() => {
  const q = route.query
  if (q.from !== 'erreur' || !q.errOriginal || !q.errCorrection) return null
  return buildExercise({
    original: q.errOriginal,
    correction: q.errCorrection,
    explanation: q.errExplanation || '',
    type: q.errType || 'grammatica',
  })
})

const microTopicQuiz = computed(() => {
  const topic = route.query.topic
  const list = (topic && TOPIC_QUIZ[topic]) || []
  return list.slice(0, personalExercise.value ? 2 : 3)
})

const showMicroExercises = computed(
  () => !!personalExercise.value || microTopicQuiz.value.length > 0
)

const microAttempt = ref('')
const microFeedback = ref(null) // null | 'correct' | 'wrong'

function checkMicro() {
  if (!personalExercise.value || !microAttempt.value.trim()) return
  microFeedback.value = checkExerciseAnswer(personalExercise.value, microAttempt.value)
    ? 'correct'
    : 'wrong'
}

function chooseMicroOption(opt) {
  microAttempt.value = opt
  microFeedback.value = opt === personalExercise.value.correct ? 'correct' : 'wrong'
}
</script>

<template>
  <SceneLayout title="Gramm" accent="atica" tagline="Grammaire et orthographe italiennes" wide>
    <div ref="pageRoot">
      <p class="intro">
        L'essentiel de la grammaire et de l'orthographe italiennes, expliqué en français. Pour les
        verbes et leurs conjugaisons, voir la
        <RouterLink :to="{ name: 'verbs' }">page Verbi</RouterLink>. Chaque section se déplie au
        clic — ouvrez seulement ce dont vous avez besoin.
      </p>

      <!-- Arrivée depuis une carte d'erreur (§9.4) : 2-3 micro-exercices,
           dont au moins un reprend le contexte personnel de l'erreur. -->
      <section v-if="showMicroExercises" class="micro-panel">
        <h3>Micro-exercices</h3>

        <div v-if="personalExercise" class="micro-item">
          <p class="micro-context">D'après une erreur que vous avez faite :</p>
          <template v-if="personalExercise.kind === 'chooseBetween'">
            <div class="micro-options">
              <button
                v-for="opt in personalExercise.options"
                :key="opt"
                type="button"
                class="micro-option"
                :class="{
                  correct: microFeedback && opt === personalExercise.correct,
                  wrong: microFeedback && microAttempt === opt && opt !== personalExercise.correct,
                }"
                :disabled="!!microFeedback"
                @click="chooseMicroOption(opt)"
              >
                {{ opt }}
              </button>
            </div>
          </template>
          <template v-else>
            <p class="micro-prompt">{{ personalExercise.prompt }}</p>
            <input
              v-model="microAttempt"
              type="text"
              class="micro-input"
              autocomplete="off"
              placeholder="Votre réponse…"
              @keydown.enter.prevent="checkMicro"
            />
            <button type="button" class="fold-btn" @click="checkMicro">Vérifier</button>
          </template>
          <p v-if="microFeedback" class="micro-feedback" :class="microFeedback">
            {{ microFeedback === 'correct' ? '✓ Correct !' : `Pas tout à fait — réponse attendue : ${personalExercise.answer || personalExercise.correct}` }}
          </p>
        </div>

        <QuizSection v-if="microTopicQuiz.length" :questions="microTopicQuiz" />
      </section>

      <div class="nav-row">
        <nav class="quick-nav" aria-label="Aller à une section">
          <a
            v-for="s in SECTIONS"
            :key="s.id"
            class="quick-nav-pill"
            :href="`#${s.id}`"
            @click="openTopic(s.id)"
          >
            {{ s.label }}
          </a>
        </nav>
        <div class="fold-controls">
          <button type="button" class="fold-btn" @click="expandAll">Tout déplier</button>
          <button type="button" class="fold-btn" @click="collapseAll">Tout replier</button>
        </div>
      </div>

      <details id="nom" class="topic" open>
        <summary><h2>Le nom : genre et pluriel</h2></summary>
        <p>
          Chaque nom italien a un genre (masculin ou féminin) et un pluriel qui se forme en
          <strong>changeant la voyelle finale</strong> — jamais avec un « s » comme en français :
        </p>
        <ul>
          <li><strong>-o → -i</strong> (masculin) : <em>libro → libri</em>, <em>ragazzo → ragazzi</em></li>
          <li><strong>-a → -e</strong> (féminin) : <em>casa → case</em>, <em>ragazza → ragazze</em></li>
          <li>
            <strong>-e → -i</strong> (les deux genres) : <em>il cane → i cani</em>,
            <em>la notte → le notti</em>
          </li>
          <li>
            Invariables : mots accentués sur la finale (<em>la città → le città</em>,
            <em>il caffè → i caffè</em>) et mots étrangers (<em>il film → i film</em>)
          </li>
          <li>
            Pièges classiques : <em>il problema, il programma, il poeta</em> sont masculins malgré
            le <em>-a</em> (pluriel <em>-i</em> : <em>i problemi</em>) ; <em>la mano</em> est
            féminin et suit le pluriel <em>-o → -i</em> par exception (<em>le mani</em>) ;
            <em>l'uovo → le uova</em>, <em>il braccio → le braccia</em> changent carrément de genre
            au pluriel.
          </li>
        </ul>
        <p class="note">
          Astuce : c'est cette même terminaison (-o/-a/-e, singulier ou pluriel) qui détermine
          l'accord de l'article et de l'adjectif dans les deux sections suivantes.
        </p>
      </details>

      <details id="articles" class="topic">
        <summary><h2>Les articles</h2></summary>
        <p>
          L'article s'accorde en genre et en nombre avec le nom, mais aussi selon la <strong>première
          lettre du mot qui suit</strong> — c'est la grande différence avec le français.
        </p>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Défini sing.</th>
              <th>Défini plur.</th>
              <th>Indéfini</th>
              <th>Devant…</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td rowspan="3">Masculin</td>
              <td><em>il</em> libro</td>
              <td><em>i</em> libri</td>
              <td><em>un</em> libro</td>
              <td>consonne « simple »</td>
            </tr>
            <tr>
              <td><em>lo</em> studente, <em>lo</em> zio</td>
              <td><em>gli</em> studenti</td>
              <td><em>uno</em> studente</td>
              <td>s + consonne, z, gn, ps…</td>
            </tr>
            <tr>
              <td><em>l'</em>amico</td>
              <td><em>gli</em> amici</td>
              <td><em>un</em> amico</td>
              <td>voyelle</td>
            </tr>
            <tr>
              <td rowspan="2">Féminin</td>
              <td><em>la</em> casa</td>
              <td><em>le</em> case</td>
              <td><em>una</em> casa</td>
              <td>consonne</td>
            </tr>
            <tr>
              <td><em>l'</em>amica</td>
              <td><em>le</em> amiche</td>
              <td><em>un'</em>amica</td>
              <td>voyelle</td>
            </tr>
          </tbody>
        </table>
        <p class="example">
          <em>Lo zio abita in città, l'amico di mio fratello.</em>
          <button v-if="ttsSupported" class="speak" title="Écouter en italien" aria-label="Écouter en italien" @click="speak('Lo zio abita in città, l\'amico di mio fratello.')">🔊</button>
          — « L'oncle habite en ville, l'ami de mon frère. »
        </p>
      </details>

      <details id="adjectif" class="topic">
        <summary><h2>L'adjectif</h2></summary>
        <p>
          Il s'accorde avec le nom : <em>ragazzo italian<strong>o</strong> → ragazzi
          italian<strong>i</strong></em>, <em>ragazza italian<strong>a</strong> → ragazze
          italian<strong>e</strong></em>. Les adjectifs en <em>-e</em> n'ont que deux formes :
          <em>un film interessant<strong>e</strong> → due film interessant<strong>i</strong></em>.
        </p>
        <p>
          Contrairement au français, l'adjectif se place le plus souvent
          <strong>après</strong> le nom : <em>una macchina rossa</em>
          <button v-if="ttsSupported" class="speak" title="Écouter en italien" aria-label="Écouter en italien" @click="speak('una macchina rossa')">🔊</button>
          (« une voiture rouge »), <em>un ragazzo simpatico</em> (« un garçon sympa »).
        </p>
        <p class="note">
          Exception fréquente : une poignée d'adjectifs courts et très courants se placent volontiers
          <strong>avant</strong> le nom, avec parfois un sens légèrement différent : <em>bello, buono,
          grande, piccolo, giovane, vecchio, nuovo, stesso, altro</em> —
          <em>una bella casa</em> (une belle maison), <em>un grand'uomo</em> (un grand homme, au sens
          figuré) contre <em>un uomo grande</em> (un homme de haute taille).
        </p>
      </details>

      <details id="possessifs" class="topic">
        <summary><h2>Les possessifs</h2></summary>
        <p>
          Contrairement au français (<em>mon, ma, mes…</em>), le possessif italien s'accorde avec
          la chose possédée, pas avec le possesseur, et se fait précéder de l'article, comme un
          adjectif ordinaire :
        </p>
        <table>
          <thead>
            <tr><th></th><th>Masc. sing.</th><th>Fém. sing.</th><th>Masc. plur.</th><th>Fém. plur.</th></tr>
          </thead>
          <tbody>
            <tr><td>mon/ma/mes</td><td>il mio</td><td>la mia</td><td>i miei</td><td>le mie</td></tr>
            <tr><td>ton/ta/tes</td><td>il tuo</td><td>la tua</td><td>i tuoi</td><td>le tue</td></tr>
            <tr><td>son/sa/ses</td><td>il suo</td><td>la sua</td><td>i suoi</td><td>le sue</td></tr>
            <tr><td>notre/nos</td><td>il nostro</td><td>la nostra</td><td>i nostri</td><td>le nostre</td></tr>
            <tr><td>votre/vos</td><td>il vostro</td><td>la vostra</td><td>i vostri</td><td>le vostre</td></tr>
            <tr><td>leur(s)</td><td>il loro</td><td>la loro</td><td>i loro</td><td>le loro</td></tr>
          </tbody>
        </table>
        <p class="warn">
          <strong>Piège :</strong> devant un nom de famille au <strong>singulier</strong> et non
          affectueux, l'article disparaît : <em>mia madre, tuo fratello, sua sorella</em>
          <button v-if="ttsSupported" class="speak" title="Écouter en italien" aria-label="Écouter en italien" @click="speak('mia madre, tuo fratello, sua sorella')">🔊</button>.
          Il revient au pluriel (<em>i miei genitori</em>) ou avec un diminutif/adjectif
          (<em>la mia mamma, il mio fratellino</em>).
        </p>
      </details>

      <details id="demonstratifs" class="topic">
        <summary><h2>Les démonstratifs : questo et quello</h2></summary>
        <p>
          <strong>Questo</strong> (ce, celui-ci) est régulier à quatre formes : <em>questo libro,
          questa casa, questi libri, queste case</em>.
        </p>
        <p>
          <strong>Quello</strong> (ce, celui-là) est plus piégeux : il se décline
          <strong>comme les prépositions articulées</strong> de la section suivante
          (<em>quel, quello, quell', quella, quei, quegli, quelle</em>) :
        </p>
        <ul>
          <li><em>quel libro</em> (devant consonne simple), <em>quei libri</em> au pluriel</li>
          <li><em>quello studente, quello zio</em> (devant s+consonne, z…), <em>quegli studenti</em></li>
          <li><em>quell'amico, quell'amica</em> (devant voyelle), <em>quegli amici, quelle amiche</em></li>
          <li><em>quella casa</em> (féminin devant consonne), <em>quelle case</em></li>
        </ul>
      </details>

      <details id="prepositions" class="topic">
        <summary><h2>Les prépositions articulées</h2></summary>
        <p>
          Les prépositions <em>di, a, da, in, su</em> fusionnent obligatoirement avec l'article
          défini :
        </p>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>il</th>
              <th>lo</th>
              <th>l'</th>
              <th>la</th>
              <th>i</th>
              <th>gli</th>
              <th>le</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><strong>di</strong></td><td>del</td><td>dello</td><td>dell'</td><td>della</td><td>dei</td><td>degli</td><td>delle</td></tr>
            <tr><td><strong>a</strong></td><td>al</td><td>allo</td><td>all'</td><td>alla</td><td>ai</td><td>agli</td><td>alle</td></tr>
            <tr><td><strong>da</strong></td><td>dal</td><td>dallo</td><td>dall'</td><td>dalla</td><td>dai</td><td>dagli</td><td>dalle</td></tr>
            <tr><td><strong>in</strong></td><td>nel</td><td>nello</td><td>nell'</td><td>nella</td><td>nei</td><td>negli</td><td>nelle</td></tr>
            <tr><td><strong>su</strong></td><td>sul</td><td>sullo</td><td>sull'</td><td>sulla</td><td>sui</td><td>sugli</td><td>sulle</td></tr>
          </tbody>
        </table>
        <p class="example">
          <em>Vado <strong>al</strong> mare</em>
          <button v-if="ttsSupported" class="speak" title="Écouter en italien" aria-label="Écouter en italien" @click="speak('Vado al mare')">🔊</button>
          (a + il), <em>il libro <strong>dello</strong> studente</em>
          <button v-if="ttsSupported" class="speak" title="Écouter en italien" aria-label="Écouter en italien" @click="speak('il libro dello studente')">🔊</button>
          (di + lo), <em>i libri <strong>sugli</strong> scaffali</em>
          <button v-if="ttsSupported" class="speak" title="Écouter en italien" aria-label="Écouter en italien" @click="speak('i libri sugli scaffali')">🔊</button>
          (su + gli), <em>esco <strong>dalla</strong> scuola</em>
          <button v-if="ttsSupported" class="speak" title="Écouter en italien" aria-label="Écouter en italien" @click="speak('esco dalla scuola')">🔊</button>
          (da + la).
        </p>
        <p class="note">
          <strong>tra</strong> et <strong>fra</strong> (entre, parmi) sont interchangeables et ne
          fusionnent <strong>jamais</strong> avec l'article : <em>tra i libri, fra le case</em>. On
          choisit l'une ou l'autre simplement pour éviter deux sons identiques qui se suivent
          (<em>fra fratelli</em> plutôt que <em>tra tratelli</em>).
        </p>
      </details>

      <details id="piacere" class="topic">
        <summary><h2>Piacere et les verbes à construction inversée</h2></summary>
        <p>
          <strong>Piacere</strong> (aimer, plaire) fonctionne à l'envers du français : ce n'est pas
          la personne qui est sujet, mais <strong>la chose aimée</strong>. La personne devient un
          pronom complément indirect (<em>mi, ti, gli, le, ci, vi, gli</em>) :
        </p>
        <ul>
          <li>
            <em>Mi piace la pizza</em>
            <button v-if="ttsSupported" class="speak" title="Écouter en italien" aria-label="Écouter en italien" @click="speak('Mi piace la pizza')">🔊</button>
            — littéralement « la pizza me plaît », jamais <em>« io piaccio la pizza »</em>.
          </li>
          <li>
            <em>Mi piacciono i libri</em>
            <button v-if="ttsSupported" class="speak" title="Écouter en italien" aria-label="Écouter en italien" @click="speak('Mi piacciono i libri')">🔊</button>
            — le verbe s'accorde avec ce qui plaît, pas avec la personne : <em>piace</em> au
            singulier, <em>piacciono</em> si plusieurs choses plaisent.
          </li>
          <li>
            <em>A Marco piace il calcio</em> (à Marco, le foot plaît) — pour préciser la personne,
            on ajoute <em>a + nom</em> en tête de phrase.
          </li>
        </ul>
        <p class="note">
          Même logique pour <em>servire</em> (avoir besoin : <em>mi serve tempo</em>, « il me faut
          du temps ») et <em>mancare</em> (manquer : <em>mi manchi</em>, « tu me manques » —
          là encore la personne qui manque est sujet en italien, complément en français inversé).
        </p>
      </details>

      <details id="pronoms" class="topic">
        <summary><h2>Les pronoms personnels compléments</h2></summary>
        <p class="warn">
          <strong>Le point le plus piégeux de cette page pour un francophone :</strong> le pronom se
          <strong>soude</strong> à l'infinitif et à l'impératif — une construction que le français
          n'a pas (« le voir », « dis-moi » restent séparés).
        </p>
        <ul>
          <li>
            <strong>Directs</strong> : <em>mi, ti, lo, la, ci, vi, li, le</em> —
            <em>Lo vedo</em> (je le vois), <em>La conosco</em> (je la connais).
          </li>
          <li>
            <strong>Indirects</strong> : <em>mi, ti, gli, le, ci, vi, gli</em> —
            <em>Gli parlo</em> (je lui parle, à lui), <em>Le scrivo</em> (je lui écris, à elle).
            Le français dit « lui » dans les deux cas ; l'italien distingue le genre du
            destinataire — confusion fréquente entre <em>gli</em> et <em>le</em>.
          </li>
          <li>
            <strong>ne</strong> et <strong>ci</strong> ne se traduisent pas toujours comme « en » et
            « y » : <em>Ne prendo due</em> (j'en prends deux) est obligatoire même là où le français
            familier omettrait « en » ; <em>ci</em> sert aussi de pronom « nous » (<em>ci vede</em>,
            il nous voit) en plus du sens locatif « y » (<em>Ci vado domani</em>, j'y vais demain) —
            le contexte seul les distingue.
          </li>
          <li>
            Le pronom se soude à l'infinitif et à l'impératif :
            <em>voglio veder<strong>lo</strong></em>
            <button v-if="ttsSupported" class="speak" title="Écouter en italien" aria-label="Écouter en italien" @click="speak('voglio vederlo')">🔊</button>,
            <em>dim<strong>mi</strong></em> (dis-moi)
            <button v-if="ttsSupported" class="speak" title="Écouter en italien" aria-label="Écouter en italien" @click="speak('dimmi')">🔊</button>.
          </li>
        </ul>
      </details>

      <details id="negation" class="topic">
        <summary><h2>La négation</h2></summary>
        <p>
          <strong>Non</strong> se place juste avant le verbe conjugué, sans deuxième mot comme le
          « pas » français : <em>Non parlo italiano</em> (je ne parle pas italien).
        </p>
        <p>
          Avec <em>mai</em> (jamais), <em>niente</em> (rien) et <em>nessuno</em> (personne), l'italien
          <strong>double la négation</strong> quand ces mots suivent le verbe — contrairement au
          français, où « ne » et « jamais/rien/personne » se suffisent :
        </p>
        <ul>
          <li><em>Non ho visto nessuno</em> (je n'ai vu personne)</li>
          <li><em>Non mangio mai la carne</em> (je ne mange jamais de viande)</li>
          <li><em>Non capisco niente</em> (je ne comprends rien)</li>
        </ul>
      </details>

      <details id="comparatif" class="topic">
        <summary><h2>Comparatif et superlatif</h2></summary>
        <p>
          <strong>Comparatif</strong> : <em>più... di</em> (plus... que) devant un nom/pronom,
          <em>più... che</em> devant deux adjectifs ou compléments comparés directement :
          <em>Marco è più alto di Luca</em> ; <em>È più intelligente che simpatico</em>.
          <em>meno... di/che</em> fonctionne pareil pour « moins ».
        </p>
        <p>
          <strong>Superlatif relatif</strong> : <em>il/la più... di</em> — <em>il ragazzo più alto
          della classe</em> (le garçon le plus grand de la classe).
        </p>
        <p>
          <strong>Superlatif absolu</strong> : on ajoute <em>-issimo/-issima/-issimi/-issime</em> à
          l'adjectif, sans « très » ni « extrêmement » :
          <em>bello → bellissimo</em>
          <button v-if="ttsSupported" class="speak" title="Écouter en italien" aria-label="Écouter en italien" @click="speak('bellissimo')">🔊</button>
          (magnifique), <em>buono → buonissimo</em>.
        </p>
      </details>

      <details id="quantite" class="topic">
        <summary><h2>Molto, tanto, poco, troppo : adjectif ou adverbe ?</h2></summary>
        <p>
          Ces quatre mots changent de comportement selon leur fonction — un piège fréquent :
        </p>
        <ul>
          <li>
            <strong>Adjectifs</strong> (accordés, devant un nom) : <em>molt<strong>i</strong> libri</em>
            (beaucoup de livres), <em>poch<strong>e</strong> idee</em> (peu d'idées).
          </li>
          <li>
            <strong>Adverbes</strong> (invariables, devant un adjectif/verbe) : <em>molto
            bello</em> (très beau), <em>troppo stanco</em> (trop fatigué) — jamais de -i/-e final ici.
          </li>
        </ul>
        <p class="note">
          Comparez : <em>ho molt<strong>i</strong> amici</em> (adjectif, s'accorde) contre
          <em>sono molto felice</em> (adverbe, invariable).
        </p>
      </details>

      <details id="interrogation" class="topic">
        <summary><h2>L'interrogation</h2></summary>
        <p>
          Pas d'inversion sujet-verbe comme en français : à l'oral comme à l'écrit, l'intonation (ou
          le point d'interrogation) suffit à transformer une affirmation en question :
          <em>Parli italiano?</em> (tu parles italien ?)
        </p>
        <p>Les principaux mots interrogatifs :</p>
        <ul>
          <li><em>che, cosa, che cosa</em> — quoi, que</li>
          <li><em>chi</em> — qui</li>
          <li><em>come</em> — comment</li>
          <li><em>dove</em> — où</li>
          <li><em>quando</em> — quand</li>
          <li><em>perché</em> — pourquoi (sert aussi à répondre « parce que »)</li>
          <li><em>quanto/quanta/quanti/quante</em> — combien (s'accorde, contrairement au français)</li>
        </ul>
      </details>

      <details id="ortho-cg" class="topic">
        <summary><h2>Orthographe : les sons c et g</h2></summary>
        <p>La lettre suivante décide de la prononciation — et le <em>h</em> sert à « durcir » :</p>
        <table>
          <thead>
            <tr>
              <th>Graphie</th>
              <th>Son</th>
              <th>Exemples</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>ca, co, cu / che, chi</td><td>[k] dur</td><td><em>casa, perché, chilo</em></td></tr>
            <tr><td>ce, ci</td><td>[tch] doux</td><td><em>cena, ciao, cinema</em></td></tr>
            <tr><td>ga, go, gu / ghe, ghi</td><td>[g] dur</td><td><em>gatto, spaghetti, ghiaccio</em></td></tr>
            <tr><td>ge, gi</td><td>[dj] doux</td><td><em>gelato, giorno</em></td></tr>
            <tr><td>gn</td><td>comme « gn » de agneau</td><td><em>gnocchi, signore, bagno</em></td></tr>
            <tr><td>gli</td><td>« l mouillé » (≈ ll de fille)</td><td><em>famiglia, figlio, aglio</em></td></tr>
            <tr><td>sce, sci</td><td>[ch]</td><td><em>pesce, uscire, sciare</em></td></tr>
          </tbody>
        </table>
        <p class="example">
          <em>Mangio il gelato mentre ascolto la musica.</em>
          <button v-if="ttsSupported" class="speak" title="Écouter en italien" aria-label="Écouter en italien" @click="speak('Mangio il gelato mentre ascolto la musica.')">🔊</button>
          — « Je mange une glace en écoutant de la musique. »
        </p>
        <p class="note">
          Conséquence à l'écrit : au pluriel, <em>amica → amiche</em> (le <em>h</em> garde le son
          dur), mais <em>amico → amici</em> (le son devient doux).
        </p>
      </details>

      <details id="ortho-accents" class="topic">
        <summary><h2>Orthographe : consonnes doubles et accents</h2></summary>
        <ul>
          <li>
            Les <strong>consonnes doubles</strong> se prononcent réellement plus longues et changent
            le sens : <em>pala</em> (pelle) / <em>palla</em> (ballon)
            <button v-if="ttsSupported" class="speak" title="Écouter en italien" aria-label="Écouter en italien" @click="speak('pala, palla')">🔊</button>,
            <em>caro</em> (cher) / <em>carro</em> (chariot), <em>sono</em> (je suis) /
            <em>sonno</em> (sommeil), <em>nono</em> (neuvième) / <em>nonno</em> (grand-père).
          </li>
          <li>
            L'<strong>accent écrit</strong> n'apparaît que sur la voyelle finale :
            <em>città, però, perché, più, caffè</em>. Il distingue aussi des mots courts :
            <em>è</em> (il est) / <em>e</em> (et), <em>là</em> (là-bas) / <em>la</em> (article),
            <em>sì</em> (oui) / <em>si</em> (pronom), <em>dà</em> (il donne) / <em>da</em> (de).
          </li>
          <li>
            L'<strong>élision</strong> se marque par l'apostrophe devant voyelle :
            <em>l'amico, un'ora, dov'è, c'è</em>.
          </li>
          <li>
            Le <strong>h</strong> est toujours muet : il ne s'écrit qu'au présent de <em>avere</em>
            (<em>ho, hai, ha, hanno</em>) et dans les graphies <em>che/chi, ghe/ghi</em>.
          </li>
          <li>
            Pas de <em>y, k, w, x, j</em> en dehors des mots étrangers — l'italien s'écrit presque
            comme il se prononce.
          </li>
        </ul>
      </details>

      <section id="quiz" class="quiz-wrap">
        <QuizSection :questions="QUIZ_ALL" />
      </section>

      <section class="outro">
        <h2>Pour aller plus loin</h2>
        <p>
          La grammaire s'assimile surtout en lisant : chaque structure revue en contexte s'ancre
          mieux qu'une règle apprise isolément. Explorez les
          <RouterLink :to="{ name: 'library' }">textes gradués</RouterLink>, la liste des
          <RouterLink :to="{ name: 'verbs' }">verbes avec conjugaison complète</RouterLink> et le
          <RouterLink :to="{ name: 'dictionary' }">dictionnaire</RouterLink>.
        </p>
      </section>
    </div>
  </SceneLayout>
</template>

<style scoped>
.intro {
  margin: 0 0 1rem;
  font-size: 0.95rem;
  line-height: 1.65;
  color: #4a4238;
}

.micro-panel {
  margin: 0 0 1.4rem;
  padding: 0.9rem 1.1rem;
  border-radius: 12px;
  background: rgba(90, 96, 150, 0.06);
  border: 1px solid rgba(90, 96, 150, 0.25);
}

.micro-panel h3 {
  margin: 0 0 0.6rem;
  font-size: 1rem;
  color: #2c2620;
}

.micro-item {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e4d9c6;
}

.micro-context {
  margin: 0 0 0.4rem;
  font-size: 0.82rem;
  color: #6b6156;
  font-style: italic;
}

.micro-prompt {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: #2c2620;
}

.micro-input {
  padding: 0.45rem 0.7rem;
  border-radius: 8px;
  border: 1px solid rgba(107, 97, 86, 0.4);
  background: #fffaf3;
  font: inherit;
  margin-right: 0.5rem;
}

.micro-options {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}

.micro-option {
  text-align: left;
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  border: 1px solid #d8cfc2;
  background: #faf6f0;
  cursor: pointer;
}

.micro-option.correct {
  background: #e3f0e6;
  border-color: #4a7c59;
  color: #35674a;
}

.micro-option.wrong {
  background: #f8e3de;
  border-color: #a34430;
  color: #a34430;
}

.micro-feedback {
  margin: 0.5rem 0 0;
  font-weight: 700;
  font-size: 0.9rem;
}

.micro-feedback.correct {
  color: #3d7a3d;
}

.micro-feedback.wrong {
  color: #a34430;
}

.nav-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.6rem;
  position: sticky;
  top: 0;
  z-index: 1;
  margin: 0 0 1.4rem;
  padding: 0.7rem 0;
  background: rgba(253, 243, 227, 0.92);
  backdrop-filter: blur(4px);
  border-bottom: 1px solid #e4d9c6;
}

.quick-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  flex: 1;
}

.quick-nav-pill {
  font-size: 0.78rem;
  font-weight: 600;
  color: #7a4a22;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid #e4d9c6;
  border-radius: 999px;
  padding: 0.32rem 0.75rem;
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.quick-nav-pill:hover {
  background: #f3e2c4;
  border-color: #d9b98a;
}

.fold-controls {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}

.fold-btn {
  font-size: 0.78rem;
  font-weight: 600;
  color: #b0692e;
  background: none;
  border: 1px solid #d9b98a;
  border-radius: 999px;
  padding: 0.32rem 0.75rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease;
}

.fold-btn:hover {
  background: #f3e2c4;
}

.topic {
  margin-bottom: 0.6rem;
  padding: 0 0.2rem;
  border-bottom: 1px solid #eee1ce;
  scroll-margin-top: 4.4rem;
}

.topic summary {
  list-style: none;
  cursor: pointer;
  padding: 0.7rem 1.6rem 0.7rem 0;
  position: relative;
}

.topic summary::-webkit-details-marker {
  display: none;
}

.topic summary::after {
  content: '+';
  position: absolute;
  right: 0.2rem;
  top: 0.6rem;
  font-size: 1.1rem;
  font-weight: 400;
  color: #b0692e;
  transition: transform 0.15s ease;
}

.topic[open] summary::after {
  content: '−';
}

.topic summary:hover h2 {
  color: #b0692e;
}

.topic > *:not(summary) {
  padding-bottom: 1rem;
}

.quiz-wrap {
  margin-top: 1.6rem;
  padding-top: 1.2rem;
  border-top: 2px solid #eee1ce;
  scroll-margin-top: 4.4rem;
}

.outro {
  margin-top: 1.4rem;
}

h2 {
  margin: 0;
  font-size: 1.15rem;
  color: #2c2620;
  display: inline;
}

p,
li {
  font-size: 0.93rem;
  line-height: 1.65;
  color: #4a4238;
}

p {
  margin: 0.4rem 0;
}

ul {
  margin: 0.4rem 0;
  padding-left: 1.2rem;
}

li {
  margin: 0.3rem 0;
}

em {
  color: #b0692e;
  font-style: italic;
}

a {
  color: #b0692e;
  font-weight: 600;
}

table {
  width: 100%;
  margin: 0.6rem 0;
  border-collapse: collapse;
  font-size: 0.88rem;
}

th,
td {
  padding: 0.35rem 0.55rem;
  border: 1px solid #eee1ce;
  text-align: left;
  color: #4a4238;
}

th {
  background: rgba(176, 105, 46, 0.08);
  color: #2c2620;
  font-weight: 600;
}

.note {
  font-size: 0.85rem;
  color: #6b6156;
}

.example {
  font-size: 0.9rem;
  color: #4a4238;
}

.warn {
  padding: 0.55rem 0.8rem;
  border-left: 3px solid #a34430;
  border-radius: 0 8px 8px 0;
  background: rgba(163, 68, 48, 0.07);
  font-size: 0.9rem;
  color: #5a4a38;
}

.speak {
  display: inline-flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  opacity: 0.55;
  padding: 0 0.2rem;
  line-height: 1;
  vertical-align: -1px;
}

.speak:hover {
  opacity: 1;
}

/* Tables larges (prépositions, possessifs) : défilement horizontal sur petit écran */
.topic {
  overflow-x: auto;
}
</style>
