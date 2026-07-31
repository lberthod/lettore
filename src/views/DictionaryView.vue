<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { ttsSupported, speakItalian } from '../tts.js'
import { lookupDictionary, searchDictionary, allLemmas, dictionaryEntryCount } from '../lib/dictionary.js'

const props = defineProps({
  word: { type: String, default: '' },
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

    <div class="search">
      <input
        v-model="query"
        type="text"
        placeholder="Cherchez un mot italien…"
        autocomplete="off"
        @keydown.enter="lookupOnEnter"
      />
    </div>

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
  </SceneLayout>
</template>

<style scoped>
.hint {
  font-size: 0.9rem;
  line-height: 1.6;
  color: #6b6156;
  margin-top: 0.6rem;
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
  color: #a89c8c;
}

.alphabet {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 1rem;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid #e4d9c6;
}

.letter {
  min-width: 1.9rem;
  height: 1.9rem;
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
  gap: 0.25rem;
  margin: 0.7rem 0 1rem;
}

.prefix {
  min-width: 2.4rem;
  height: 1.6rem;
  padding: 0 0.4rem;
  border: 1px solid #e4d9c6;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.6);
  color: #8a8072;
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
}

.index-fr {
  font-size: 0.8rem;
  color: #8a8072;
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

.btn-conj:hover {
  background: #b0692e;
  color: #faf6f0;
}
</style>
