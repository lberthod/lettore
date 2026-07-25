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

function loadEntry(word) {
  entry.value = word ? lookupDictionary(word) : null
}

watch(() => props.word, (w) => {
  query.value = w || ''
  loadEntry(w)
}, { immediate: true })

const results = computed(() => (entry.value ? [] : searchDictionary(query.value)))

function speak(word) {
  speakItalian(word, { rate: 1 })
}
</script>

<template>
  <SceneLayout title="Dizio" accent="nario" tagline="Cherchez un mot italien" wide>
    <p class="hint">
      Dictionnaire italien-français : définition, nature grammaticale, exemples et conjugaison.
      <strong>Version pilote</strong> — seuls {{ dictionaryEntryCount() }} mots sont couverts pour l'instant
      (autour de « abbandonare »), le temps de valider le format avant de générer le dictionnaire complet.
    </p>

    <div class="search">
      <input
        v-model="query"
        type="text"
        placeholder="Cherchez un mot italien…"
        autocomplete="off"
        @keydown.enter="entry = lookupDictionary(query)"
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
      <p class="pos">{{ entry.pos }}</p>
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
        Aucun résultat pour « {{ query }} » dans l'échantillon pilote actuel.
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
        <h3 class="section-title">Mots disponibles dans le pilote</h3>
        <ul class="results">
          <li v-for="r in allLemmas()" :key="r.lemma">
            <RouterLink :to="{ name: 'dictionary', params: { word: r.lemma } }" class="result">
              <span class="result-lemma">{{ r.lemma }}</span>
              <span class="result-fr">{{ r.fr }}</span>
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
