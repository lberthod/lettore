<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { ttsSupported, speakItalian } from '../tts.js'
import {
  progress,
  isFavorite,
  toggleFavorite,
  isKnown,
  markKnown,
  toggleVocabText,
} from '../progress.js'

// Chaque texte du catalogue est un chunk séparé, chargé à la demande —
// mêmes chunks que ReaderView.vue (le cache du bundler est partagé).
const textModules = import.meta.glob('../texts/*.json', { import: 'default' })

const loading = ref(true)
const texts = ref([]) // [{ id, title, words }] des textes ajoutés au mode vocabulaire

async function loadTexts() {
  loading.value = true
  const loaded = await Promise.all(
    progress.vocabTexts.map(async (id) => {
      const loader = textModules[`../texts/${id}.json`]
      const data = loader
        ? await loader()
        : await (await import('../lib/userTexts.js')).loadUserText(id)
      return data ? { id, title: data.title, words: data.words || {} } : null
    })
  )
  texts.value = loaded.filter(Boolean)
  loading.value = false
}

onMounted(loadTexts)

// Fusionne le lexique de tous les textes ajoutés, en gardant le premier
// texte source rencontré pour chaque mot (utile pour l'ajout aux favoris).
const words = computed(() => {
  const byWord = new Map()
  for (const t of texts.value) {
    for (const [word, translation] of Object.entries(t.words)) {
      if (!byWord.has(word)) byWord.set(word, { word, translation, textId: t.id })
    }
  }
  return [...byWord.values()]
    .filter((w) => !isFavorite(w.word) && !isKnown(w.word))
    .sort((a, b) => a.word.localeCompare(b.word, 'it'))
})

function speak(word) {
  speakItalian(word, { rate: progress.ttsRate })
}

function setKnown(word) {
  markKnown(word)
}

function addToVocab(entry) {
  toggleFavorite({ word: entry.word, translation: entry.translation, textId: entry.textId })
}

function removeText(id) {
  toggleVocabText(id)
  texts.value = texts.value.filter((t) => t.id !== id)
}
</script>

<template>
  <SceneLayout title="Mode " accent="vocabulaire" tagline="Trier le vocabulaire des textes lus" narrow>
    <p>
      Depuis un texte, cliquez sur « Ajouter au vocabulaire » pour l'inclure
      ici. Pour chaque mot, marquez-le connu ou ajoutez-le à
      <RouterLink :to="{ name: 'words' }">Mes mots</RouterLink>.
    </p>

    <div v-if="texts.length" class="included">
      <span v-for="t in texts" :key="t.id" class="chip">
        {{ t.title }}
        <button
          type="button"
          class="chip-remove"
          title="Retirer ce texte du mode vocabulaire"
          @click="removeText(t.id)"
        >
          ✕
        </button>
      </span>
    </div>

    <p v-if="loading" class="hint">Chargement…</p>

    <p v-else-if="!texts.length" class="hint">
      Aucun texte ajouté pour l'instant —
      <RouterLink :to="{ name: 'library' }">choisissez un texte</RouterLink>
      et cliquez sur « Ajouter au vocabulaire » en bas de la lecture.
    </p>

    <template v-else-if="words.length">
      <p class="count">
        {{ words.length }} {{ words.length > 1 ? 'mots à trier' : 'mot à trier' }}
      </p>
      <ul class="list">
        <li v-for="w in words" :key="w.word" class="entry">
          <span class="word">
            {{ w.word }}
            <button
              v-if="ttsSupported"
              class="speak"
              title="Écouter en italien"
              aria-label="Écouter en italien"
              @click="speak(w.word)"
            >
              🔊
            </button>
          </span>
          <span class="translation">{{ w.translation }}</span>
          <span class="actions">
            <button class="btn known" title="Je connais déjà ce mot" @click="setKnown(w.word)">
              ✓ Connu
            </button>
            <button class="btn add" title="Ajouter à mon vocabulaire" @click="addToVocab(w)">
              ★ Ajouter
            </button>
          </span>
        </li>
      </ul>
    </template>

    <p v-else class="hint">
      ✓ Tous les mots des textes ajoutés sont triés —
      <RouterLink :to="{ name: 'library' }">ajoutez un autre texte</RouterLink>.
    </p>
  </SceneLayout>
</template>

<style scoped>
.hint {
  font-size: 0.95rem;
  line-height: 1.7;
  margin-top: 1rem;
}

.included {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1.2rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.4rem 0.3rem 0.7rem;
  border-radius: 999px;
  border: 1px solid rgba(176, 105, 46, 0.3);
  background: rgba(255, 255, 255, 0.7);
  font-size: 0.82rem;
  color: #6b6156;
}

.chip-remove {
  background: none;
  border: none;
  color: #a34430;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.1rem;
  opacity: 0.7;
}

.chip-remove:hover {
  opacity: 1;
}

.count {
  color: #6b6156;
  font-size: 0.85rem;
  margin: 1.2rem 0 0.6rem;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.entry {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0.8rem;
  align-items: center;
  padding: 0.6rem 0.9rem;
  border: 1px solid #e4d9c6;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.85);
}

.word {
  font-weight: 600;
  font-size: 1.02rem;
}

.speak {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0 0.2rem;
  opacity: 0.7;
}

.speak:hover {
  opacity: 1;
}

.translation {
  font-size: 0.95rem;
  color: #4a4038;
}

.actions {
  display: flex;
  gap: 0.4rem;
}

.btn {
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s, border-color 0.12s;
}

.btn.known {
  border: 1px solid #4a7c59;
  background: #fff;
  color: #4a7c59;
}

.btn.known:hover {
  background: #4a7c59;
  color: #faf6f0;
}

.btn.add {
  border: 1px solid #b0692e;
  background: #fff;
  color: #b0692e;
}

.btn.add:hover {
  background: #b0692e;
  color: #faf6f0;
}

@media (max-width: 560px) {
  .entry {
    grid-template-columns: 1fr;
    text-align: left;
  }

  .actions {
    justify-content: flex-start;
  }
}
</style>
