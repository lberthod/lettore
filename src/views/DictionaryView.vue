<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { ttsSupported, speakItalian, stopSpeaking } from '../tts.js'
import {
  lookupDictionary,
  searchDictionary,
  allLemmas,
  dictionaryEntryCount,
  allProperNouns,
} from '../lib/dictionary.js'

const props = defineProps({
  word: { type: String, default: '' },
})

// Onglet « Nomi propri » : villes, personnages, œuvres… rencontrés dans les
// textes mais absents du dictionnaire courant (un nom propre n'est pas un
// lemme de dictionnaire classique) — voir dictionary.js/proper-nouns.json.
const mode = ref('dizionario') // 'dizionario' | 'nomi-propri'
const properNouns = ref([])
allProperNouns().then((list) => (properNouns.value = list))

const properQuery = ref('')
const filteredProperNouns = computed(() => {
  const q = properQuery.value.trim().toLowerCase()
  const list = q
    ? properNouns.value.filter(
        (p) => p.name.toLowerCase().includes(q) || p.fr.toLowerCase().includes(q)
      )
    : properNouns.value
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'it'))
})

const query = ref(props.word || '')
const entry = ref(null) // fiche exacte affichée (si un mot précis est demandé)
const results = ref([])

async function loadEntry(word) {
  entry.value = word ? await lookupDictionary(word) : null
  if (!entry.value) results.value = await searchDictionary(query.value)
}

watch(() => props.word, (w) => {
  query.value = w || ''
  loadEntry(w)
}, { immediate: true })

watch(query, async (q) => {
  if (entry.value) return
  results.value = await searchDictionary(q)
})

async function lookupOnEnter() {
  entry.value = await lookupDictionary(query.value)
  if (!entry.value) results.value = await searchDictionary(query.value)
}

// Vue « vrai dictionnaire » : index alphabétique, une lettre à la fois.
// Chargé à la demande (voir lib/dictionary.js) : vide le temps du premier
// import(), rempli dès qu'il résout.
const lemmasList = ref([])
allLemmas().then((l) => (lemmasList.value = l))

const entryCount = ref(0)
dictionaryEntryCount().then((n) => (entryCount.value = n))

const letters = computed(() => {
  const set = new Set()
  for (const l of lemmasList.value) {
    const first = l.lemma[0]?.toUpperCase()
    if (first) set.add(/[A-Z]/.test(first) ? first : '#')
  }
  return [...set].sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b, 'it')))
})

const selectedLetter = ref('')

watch(letters, (ls) => {
  if (!selectedLetter.value && ls.length) selectedLetter.value = ls[0]
}, { immediate: true })

const letterResults = computed(() => {
  if (!selectedLetter.value) return []
  return lemmasList.value.filter((l) => {
    const first = l.lemma[0]?.toUpperCase()
    const bucket = /[A-Z]/.test(first) ? first : '#'
    return bucket === selectedLetter.value
  })
})

// Le dataset se remplit dans l'ordre alphabétique : certaines lettres
// (ex. « A ») concentrent l'essentiel des mots pendant que d'autres sont
// encore vides. Au-delà du seuil, on affine par les 2 premières lettres
// (comme l'onglet d'un vrai dictionnaire) pour garder des listes lisibles.
const SPLIT_THRESHOLD = 60

// Ignore les espaces/apostrophes (« a fondo », « c'è ») pour que le préfixe
// reflète les vraies lettres du mot plutôt que sa ponctuation.
function prefixOf(lemma) {
  const letters = lemma.replace(/[^a-zà-ÿ]/gi, '')
  return (letters.slice(0, 2) || lemma[0] || '').toUpperCase()
}

const prefixes = computed(() => {
  if (letterResults.value.length <= SPLIT_THRESHOLD) return []
  const set = new Set()
  for (const l of letterResults.value) {
    set.add(prefixOf(l.lemma))
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'it'))
})

const selectedPrefix = ref('')

watch(prefixes, (ps) => {
  if (ps.length && !ps.includes(selectedPrefix.value)) selectedPrefix.value = ps[0]
}, { immediate: true })

const displayResults = computed(() => {
  if (!prefixes.value.length) return letterResults.value
  return letterResults.value.filter((l) => prefixOf(l.lemma) === selectedPrefix.value)
})

function selectLetter(letter) {
  selectedLetter.value = letter
  selectedPrefix.value = ''
  query.value = ''
  entry.value = null
}

function selectPrefix(prefix) {
  selectedPrefix.value = prefix
}

function speak(word) {
  speakItalian(word, { rate: 1 })
}

// --- Mode aléatoire (session audio) : pioche N lemmes au hasard, résout
// chaque fiche complète, puis les enchaîne une par une avec lecture vocale
// du mot, de la définition italienne et d'une phrase d'exemple.
const SESSION_PRESETS = [10, 20, 50, 100]
const sessionSize = ref(20)
const sessionPanelOpen = ref(false)
const sessionLoading = ref(false)
const sessionActive = ref(false)
const sessionQueue = ref([])
const sessionIndex = ref(0)
const autoplay = ref(true)
const autoAdvance = ref(true)
let advanceTimer = null
// Incrémenté à chaque annulation (nextCard/prevCard/stop) : la chaîne de
// lecture en cours capture sa valeur et se compare à la valeur courante
// avant de continuer — sans ça, `stopSpeaking()` déclenche `onerror` sur
// l'utterance annulée, qui rappelle `onEnd` et fait avancer la séquence une
// deuxième fois par-dessus la nouvelle carte déjà affichée.
let playToken = 0

const sessionCurrent = computed(() => sessionQueue.value[sessionIndex.value] || null)

function shuffled(list) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function clearAdvanceTimer() {
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
}

// Pause entre deux segments lus : sans elle, le moteur vocal enchaîne
// l'utterance suivante avant d'avoir relâché la précédente (surtout quand
// c'est le même mot répété), et les deux se chevauchent en un son confus
// (« stipare » + « stipare » perçus comme « stiapre »).
const SPEECH_GAP_MS = 350

function playSequence(parts, i, token) {
  if (token !== playToken) return
  if (i >= parts.length) {
    if (autoAdvance.value) advanceTimer = setTimeout(nextCard, 1800)
    return
  }
  const part = parts[i]
  speakItalian(part.text, {
    rate: 0.9,
    lang: part.lang,
    onEnd: () => {
      if (token !== playToken) return
      advanceTimer = setTimeout(() => playSequence(parts, i + 1, token), SPEECH_GAP_MS)
    },
  })
}

// Séquence lue à voix haute : le mot répété 3 fois (mémorisation), sa
// traduction française, la définition italienne, puis la phrase d'exemple
// dans les deux langues — chaque partie porte sa langue (`it-IT` / `fr-FR`)
// pour que le moteur TTS choisisse la bonne voix.
function playCurrentCard() {
  const e = sessionCurrent.value
  if (!e || !ttsSupported) return
  clearAdvanceTimer()
  playToken++
  const parts = [
    { text: e.lemma, lang: 'it-IT' },
    { text: e.lemma, lang: 'it-IT' },
    { text: e.lemma, lang: 'it-IT' },
  ]
  if (e.fr) parts.push({ text: e.fr, lang: 'fr-FR' })
  if (e.definition_it) parts.push({ text: e.definition_it, lang: 'it-IT' })
  if (e.examples?.[0]?.it) parts.push({ text: e.examples[0].it, lang: 'it-IT' })
  if (e.examples?.[0]?.fr) parts.push({ text: e.examples[0].fr, lang: 'fr-FR' })
  playSequence(parts, 0, playToken)
}

async function startRandomSession() {
  sessionLoading.value = true
  const picked = shuffled(await allLemmas()).slice(0, sessionSize.value)
  // Chargées en parallèle plutôt qu'une par une : à 100 mots, l'attente
  // séquentielle (un aller-retour par fiche) se faisait sentir avant l'entrée
  // en session. Promise.all conserve l'ordre de `picked` malgré des réponses
  // qui arrivent dans le désordre.
  const entries = (await Promise.all(picked.map((l) => lookupDictionary(l.lemma)))).filter(Boolean)
  sessionQueue.value = entries
  sessionIndex.value = 0
  sessionPanelOpen.value = false
  sessionLoading.value = false
  entry.value = null
  sessionActive.value = true
  if (autoplay.value) playCurrentCard()
}

function nextCard() {
  clearAdvanceTimer()
  playToken++
  stopSpeaking()
  if (sessionIndex.value + 1 < sessionQueue.value.length) {
    sessionIndex.value++
    if (autoplay.value) playCurrentCard()
  } else {
    endRandomSession()
  }
}

function prevCard() {
  clearAdvanceTimer()
  playToken++
  stopSpeaking()
  if (sessionIndex.value > 0) {
    sessionIndex.value--
    if (autoplay.value) playCurrentCard()
  }
}

function endRandomSession() {
  clearAdvanceTimer()
  playToken++
  stopSpeaking()
  sessionActive.value = false
  sessionQueue.value = []
}

onUnmounted(() => {
  clearAdvanceTimer()
  stopSpeaking()
})

// Registre de langue : champ optionnel des shards (absent = neutro, jamais
// affiché — voir scripts/backfill-dictionary-register.mjs). On ne badge que
// les valeurs connues, au cas où une donnée inattendue traînerait.
const KNOWN_REGISTERS = ['formale', 'informale', 'letterario', 'dialettale']
const registerBadge = computed(() =>
  KNOWN_REGISTERS.includes(entry.value?.register) ? entry.value.register : null
)
</script>

<template>
  <SceneLayout title="Dizio" accent="nario" tagline="Cherchez un mot italien" wide>
    <p class="hint">
      Dictionnaire italien-français : définition, nature grammaticale, exemples et conjugaison.
      {{ entryCount }} mots couverts pour l'instant, en cours d'enrichissement.
    </p>

    <div class="mode-tabs">
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === 'dizionario' }"
        @click="mode = 'dizionario'"
      >
        Dizionario
      </button>
      <button
        type="button"
        class="mode-tab"
        :class="{ active: mode === 'nomi-propri' }"
        @click="mode = 'nomi-propri'"
      >
        Nomi propri <span class="count">{{ properNouns.length }}</span>
      </button>
    </div>

    <template v-if="mode === 'nomi-propri'">
      <div class="search">
        <input
          v-model="properQuery"
          type="text"
          placeholder="Cherchez un nom propre…"
          autocomplete="off"
        />
      </div>
      <ul class="proper-list">
        <li v-for="p in filteredProperNouns" :key="p.surface" class="proper-card">
          <div class="proper-head">
            <span class="proper-name">{{ p.name }}</span>
            <span class="proper-category">{{ p.category }}</span>
          </div>
          <p class="proper-fr"><strong>{{ p.fr }}</strong></p>
          <p class="proper-desc">{{ p.description_it }}</p>
          <p class="proper-desc proper-desc-fr">{{ p.description_fr }}</p>
        </li>
      </ul>
    </template>

    <template v-else>
    <div class="search">
      <input
        v-model="query"
        type="text"
        placeholder="Cherchez un mot italien…"
        autocomplete="off"
        @keydown.enter="lookupOnEnter"
      />
    </div>

    <div v-if="!sessionActive" class="random-mode">
      <button type="button" class="btn-random" @click="sessionPanelOpen = !sessionPanelOpen">
        🎲 Mode aléatoire
      </button>

      <div v-if="sessionPanelOpen" class="random-panel">
        <p class="random-hint">Choisissez combien de mots réviser, à l'oral, dans cette session.</p>
        <div class="presets">
          <button
            v-for="n in SESSION_PRESETS"
            :key="n"
            type="button"
            class="preset"
            :class="{ active: sessionSize === n }"
            @click="sessionSize = n"
          >
            {{ n }}
          </button>
          <input
            v-model.number="sessionSize"
            type="number"
            min="1"
            max="500"
            class="preset-custom"
            aria-label="Nombre de mots personnalisé"
          />
        </div>
        <label class="autoplay-toggle">
          <input v-model="autoplay" type="checkbox" />
          Lecture audio automatique
        </label>
        <label v-if="autoplay" class="autoplay-toggle">
          <input v-model="autoAdvance" type="checkbox" />
          Passer au mot suivant automatiquement
        </label>
        <button
          type="button"
          class="btn-start-session"
          :disabled="sessionLoading || !sessionSize"
          @click="startRandomSession"
        >
          {{ sessionLoading ? 'Préparation…' : `Commencer (${sessionSize} mots)` }}
        </button>
      </div>
    </div>

    <div v-if="sessionActive && sessionCurrent" class="entry-card session-card">
      <p class="session-progress">
        Mot {{ sessionIndex + 1 }} / {{ sessionQueue.length }}
      </p>
      <h2 class="lemma">
        {{ sessionCurrent.lemma }}
        <button
          v-if="ttsSupported"
          class="speak"
          title="Réécouter la fiche"
          aria-label="Réécouter la fiche"
          @click="playCurrentCard"
        >
          🔊
        </button>
      </h2>
      <p class="pos">{{ sessionCurrent.pos }}</p>
      <p class="fr"><strong>{{ sessionCurrent.fr }}</strong></p>
      <p class="definition">{{ sessionCurrent.definition_it }}</p>

      <div v-if="sessionCurrent.examples?.length" class="examples">
        <p v-for="(ex, i) in sessionCurrent.examples" :key="i" class="example">
          « {{ ex.it }} » <span class="example-fr">— {{ ex.fr }}</span>
        </p>
      </div>

      <div class="session-actions">
        <button type="button" class="btn-nav" :disabled="sessionIndex === 0" @click="prevCard">← Précédent</button>
        <button type="button" class="btn-nav" @click="nextCard">
          {{ sessionIndex + 1 < sessionQueue.length ? 'Suivant →' : 'Terminer' }}
        </button>
      </div>
      <button type="button" class="session-quit" @click="endRandomSession">Arrêter la session</button>
    </div>

    <template v-if="!sessionActive">
    <div v-if="entry" class="entry-card">
      <RouterLink class="back" :to="{ name: 'dictionary' }" @click="entry = null">← Nouvelle recherche</RouterLink>
      <h2 class="lemma">
        {{ entry.lemma }}
        <button
          v-if="ttsSupported"
          class="speak"
          title="Écouter en italien"
          aria-label="Écouter en italien"
          @click="speak(entry.lemma)"
        >
          🔊
        </button>
      </h2>
      <p class="pos">
        {{ entry.pos }}
        <span v-if="registerBadge" class="register" :class="`register-${registerBadge}`">
          {{ registerBadge }}
        </span>
      </p>
      <p class="fr"><strong>{{ entry.fr }}</strong></p>
      <p class="definition">{{ entry.definition_it }}</p>

      <div v-if="entry.examples?.length" class="examples">
        <p v-for="(ex, i) in entry.examples" :key="i" class="example">
          « {{ ex.it }} » <span class="example-fr">— {{ ex.fr }}</span>
        </p>
      </div>

      <p v-if="entry.synonyms?.length" class="synonyms">
        Synonymes : {{ entry.synonyms.join(', ') }}
      </p>

      <RouterLink
        v-if="entry.isVerb && entry.conjugation"
        class="btn-conj"
        :to="{ name: 'conjugation', params: { verbo: entry.lemma } }"
      >
        Voir la conjugaison complète →
      </RouterLink>

      <p class="see-also">
        Règles d'accord, pluriels, prépositions articulées :
        <RouterLink :to="{ name: 'grammar' }">voir la page Grammatica</RouterLink>.
      </p>
    </div>

    <template v-else>
      <p v-if="query && !results.length" class="hint">
        Aucun résultat pour « {{ query }} » dans le dictionnaire actuel.
      </p>

      <ul v-if="results.length" class="results">
        <li v-for="r in results" :key="r.lemma">
          <RouterLink :to="{ name: 'dictionary', params: { word: r.lemma } }" class="result">
            <span class="result-lemma">{{ r.lemma }}</span>
            <span class="result-fr">{{ r.fr }}</span>
          </RouterLink>
        </li>
      </ul>

      <template v-else-if="!query">
        <nav class="alphabet" aria-label="Index alphabétique">
          <button
            v-for="l in letters"
            :key="l"
            type="button"
            class="letter"
            :class="{ active: l === selectedLetter }"
            @click="selectLetter(l)"
          >
            {{ l }}
          </button>
        </nav>

        <nav v-if="prefixes.length" class="prefixes" aria-label="Affiner par préfixe">
          <button
            v-for="p in prefixes"
            :key="p"
            type="button"
            class="prefix"
            :class="{ active: p === selectedPrefix }"
            @click="selectPrefix(p)"
          >
            {{ p }}
          </button>
        </nav>

        <h3 class="section-title">
          {{ selectedPrefix || selectedLetter }} <span class="count">({{ displayResults.length }})</span>
        </h3>
        <ul class="index-list">
          <li v-for="r in displayResults" :key="r.lemma">
            <RouterLink :to="{ name: 'dictionary', params: { word: r.lemma } }" class="index-entry">
              <span class="index-lemma">{{ r.lemma }}</span>
              <span class="index-fr">{{ r.fr }}</span>
            </RouterLink>
          </li>
        </ul>
      </template>
    </template>
    </template>
    </template>
  </SceneLayout>
</template>

<style scoped>
.hint {
  font-size: 0.9rem;
  line-height: 1.6;
  color: #6b6156;
  margin-top: 0.6rem;
}

.mode-tabs {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.mode-tab {
  padding: 0.45rem 0.9rem;
  border: 1px solid #e4d9c6;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  color: #6b6156;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}

.mode-tab.active {
  background: #2c2620;
  border-color: #2c2620;
  color: #faf6f0;
}

.mode-tab .count {
  opacity: 0.7;
  margin-left: 0.3rem;
  font-weight: 400;
}

.proper-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.75rem;
}

.proper-card {
  padding: 0.8rem 1rem;
  border: 1px solid #e4d9c6;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.85);
}

.proper-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.proper-name {
  font-weight: 700;
  color: #2c2620;
  font-size: 1.05rem;
}

.proper-category {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  /* #6b6156 (Sprint 2.1) : #a89c8c échouait le contraste WCAG AA. */
  color: #6b6156;
}

.proper-fr {
  margin: 0.25rem 0;
  color: #b0692e;
}

.proper-desc {
  margin: 0.15rem 0;
  font-size: 0.88rem;
  line-height: 1.4;
  color: #6b6156;
}

.proper-desc-fr {
  font-style: italic;
  /* #6b6156 (Sprint 2.1) : #8a8072 échouait le contraste WCAG AA
     (≈3.6:1). */
  color: #6b6156;
}

.search {
  margin: 1.2rem 0;
}

.search input {
  width: 100%;
  padding: 0.7rem 1rem;
  border: 1px solid #d8cfc2;
  border-radius: 8px;
  font-size: 1rem;
  font-family: inherit;
  background: rgba(255, 255, 255, 0.85);
}

.search input:focus {
  outline: none;
  border-color: #b0692e;
}

.section-title {
  color: #6b6156;
  font-size: 0.85rem;
  font-weight: 700;
  margin: 1.2rem 0 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.count {
  font-weight: 400;
  text-transform: none;
  /* #6b6156 (Sprint 2.1) : #a89c8c échouait le contraste WCAG AA. */
  color: #6b6156;
}

.alphabet {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 1rem;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid #e4d9c6;
}

.letter {
  /* 44px (Analyse Optimisation UX Mobile.md Sprint 1.4) : nav principale
     du dictionnaire, la plus utilisée de cet écran. flex-wrap absorbe déjà
     le surcroît de largeur en ajoutant des lignes, pas de grille figée
     à recalculer (contrairement à Giochi/Classici avant leur correctif). */
  min-width: 2.75rem;
  height: 2.75rem;
  padding: 0 0.3rem;
  border: 1px solid #e4d9c6;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.7);
  color: #6b6156;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s, color 0.12s;
}

.letter:hover {
  border-color: #b0692e;
  color: #b0692e;
}

.letter.active {
  background: #b0692e;
  border-color: #b0692e;
  color: #faf6f0;
}

.prefixes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.7rem 0 1rem;
}

.prefix {
  /* 44px (Analyse Optimisation UX Mobile.md Sprint 1.4). */
  min-width: 2.75rem;
  height: 2.75rem;
  padding: 0 0.4rem;
  border: 1px solid #e4d9c6;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.6);
  /* #6b6156 (Sprint 2.1) : #8a8072 échouait le contraste WCAG AA (≈3.6:1
     sur fond clair) ; #6b6156 est la couleur "texte secondaire" utilisée
     partout ailleurs dans l'app (5.8:1). */
  color: #6b6156;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s, color 0.12s;
}

.prefix:hover {
  border-color: #b0692e;
  color: #b0692e;
}

.prefix.active {
  background: #2c2620;
  border-color: #2c2620;
  color: #faf6f0;
}

.index-list {
  list-style: none;
  margin: 0;
  padding: 0;
  columns: 4 220px;
  column-gap: 1.2rem;
}

.index-list li {
  break-inside: avoid;
}

.index-entry {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.28rem 0.2rem;
  text-decoration: none;
  border-bottom: 1px dotted #e4d9c6;
  line-height: 1.35;
}

.index-entry:hover .index-lemma {
  color: #b0692e;
}

.index-lemma {
  font-weight: 600;
  color: #2c2620;
  font-size: 0.9rem;
  white-space: nowrap;
  /* Ellipse plutôt que débordement (Analyse Optimisation UX Mobile.md
     Sprint 3.3) : .index-list a une largeur de colonne fixe (220px), un
     lemme long pouvait déborder — même traitement que .index-fr juste
     à côté, pour cohérence. */
  overflow: hidden;
  text-overflow: ellipsis;
}

.index-fr {
  font-size: 0.8rem;
  /* #6b6156 (Sprint 2.1) : #8a8072 échouait le contraste WCAG AA, affiché
     à côté de chaque lemme de l'index — élément central du dictionnaire. */
  color: #6b6156;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.5rem;
}

.result {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.6rem 0.9rem;
  border: 1px solid #e4d9c6;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  transition: border-color 0.12s;
}

.result:hover {
  border-color: #b0692e;
}

.result-lemma {
  font-weight: 600;
  color: #2c2620;
}

.result-fr {
  font-size: 0.85rem;
  color: #6b6156;
}

.entry-card {
  padding: 1.2rem 1.4rem;
  border: 1px solid #e4d9c6;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.85);
}

.back {
  display: inline-block;
  font-size: 0.85rem;
  color: #b0692e;
  margin-bottom: 0.8rem;
}

.lemma {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  color: #2c2620;
}

.speak {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  opacity: 0.7;
  vertical-align: middle;
}

.speak:hover {
  opacity: 1;
}

.pos {
  margin: 0.2rem 0 0.6rem;
  font-style: italic;
  color: #6b6156;
  font-size: 0.9rem;
}

/* Badge de registre de langue (formale, informale, letterario, dialettale) —
   petit pill discret dans la palette beige/brune de la page ; « neutro »
   n'est jamais affiché (champ absent des données). */
.register {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0.08rem 0.55rem;
  border: 1px solid #e4d9c6;
  border-radius: 999px;
  background: rgba(250, 246, 240, 0.9);
  color: #6f4722;
  font-size: 0.72rem;
  font-style: normal;
  font-weight: 600;
  letter-spacing: 0.03em;
  vertical-align: middle;
}

.register-formale {
  border-color: #c9bda8;
  background: #f1ebe0;
  color: #5c5344;
}

.register-informale {
  border-color: #e0c3a4;
  background: #f7ead9;
  color: #b0692e;
}

.register-letterario {
  border-color: #cdbfd0;
  background: #f0e9f1;
  color: #6d5470;
}

.register-dialettale {
  border-color: #bfcbb2;
  background: #ecf1e4;
  color: #5c6f47;
}

.fr {
  font-size: 1.15rem;
  margin: 0 0 0.5rem;
  color: #b0692e;
}

.definition {
  margin: 0 0 0.8rem;
  line-height: 1.6;
}

.examples {
  margin: 0 0 0.8rem;
  padding: 0.6rem 0.8rem;
  border-left: 3px solid #e4d9c6;
  background: rgba(250, 246, 240, 0.7);
}

.example {
  margin: 0.2rem 0;
  font-size: 0.95rem;
}

.example-fr {
  color: #6b6156;
}

.synonyms {
  font-size: 0.9rem;
  color: #6b6156;
  margin: 0 0 0.8rem;
}

.btn-conj {
  display: inline-block;
  padding: 0.5rem 1rem;
  border: 1px solid #b0692e;
  border-radius: 999px;
  color: #b0692e;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  transition: background 0.12s, color 0.12s;
}

.see-also {
  margin-top: 0.8rem;
  font-size: 0.85rem;
  color: #6b6156;
}

.see-also a {
  color: #b0692e;
  font-weight: 600;
}

.btn-conj:hover {
  background: #b0692e;
  color: #faf6f0;
}

.random-mode {
  margin: 0.8rem 0 1.2rem;
}

.btn-random {
  padding: 0.5rem 1rem;
  border: 1px solid #b0692e;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  color: #b0692e;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.btn-random:hover {
  background: #b0692e;
  color: #faf6f0;
}

.random-panel {
  margin-top: 0.7rem;
  padding: 1rem 1.1rem;
  border: 1px solid #e4d9c6;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.85);
}

.random-hint {
  margin: 0 0 0.7rem;
  font-size: 0.88rem;
  color: #6b6156;
}

.presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.7rem;
}

.preset {
  /* 44px (Analyse Optimisation UX Mobile.md Sprint 1.4). */
  min-width: 2.75rem;
  height: 2.75rem;
  padding: 0 0.5rem;
  border: 1px solid #e4d9c6;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
  color: #6b6156;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s, color 0.12s;
}

.preset:hover {
  border-color: #b0692e;
  color: #b0692e;
}

.preset.active {
  background: #b0692e;
  border-color: #b0692e;
  color: #faf6f0;
}

.preset-custom {
  width: 4.2rem;
  height: 2.75rem;
  padding: 0 0.5rem;
  border: 1px solid #d8cfc2;
  border-radius: 8px;
  /* 1rem/16px (Analyse Optimisation UX Mobile.md Sprint 3.3) : ce champ
     n'est pas dans la classe .form globale (style.css) qui applique déjà
     cette règle anti-zoom iOS ailleurs — à 0.9rem/14.4px il restait
     déclencheur de zoom au focus. */
  font-size: 1rem;
  font-family: inherit;
  background: rgba(255, 255, 255, 0.85);
}

.autoplay-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.88rem;
  color: #6b6156;
  margin-bottom: 0.5rem;
  cursor: pointer;
}

.btn-start-session {
  margin-top: 0.4rem;
  padding: 0.55rem 1.1rem;
  border: none;
  border-radius: 999px;
  background: #b0692e;
  color: #faf6f0;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s;
}

.btn-start-session:hover {
  background: #9a5a25;
}

.btn-start-session:disabled {
  opacity: 0.6;
  cursor: default;
}

.session-card {
  text-align: center;
}

.session-progress {
  margin: 0 0 0.6rem;
  font-size: 0.8rem;
  /* #6b6156 (Sprint 2.1) : #a89c8c échouait le contraste WCAG AA
     (≈2.5:1), affiché en continu pendant toute la session audio. */
  color: #6b6156;
}

.session-actions {
  display: flex;
  justify-content: center;
  gap: 0.7rem;
  margin-top: 1rem;
}

.btn-nav {
  /* ~44px de haut (Analyse Optimisation UX Mobile.md Sprint 1.4) : répété
     à chaque mot pendant toute la session. */
  padding: 0.75rem 1.1rem;
  border-radius: 999px;
  border: 1px solid #b0692e;
  background: #b0692e;
  color: #faf6f0;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s;
}

.btn-nav:hover {
  background: #9a5a25;
}

.btn-nav:disabled {
  opacity: 0.5;
  cursor: default;
  background: rgba(255, 255, 255, 0.7);
  color: #b0692e;
}

.session-quit {
  margin-top: 1rem;
  background: none;
  border: none;
  color: #6b6156;
  font-size: 0.8rem;
  cursor: pointer;
  text-decoration: underline;
  opacity: 0.7;
}
</style>
