<script setup>
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ttsSupported, speakItalian } from '../tts.js'
import { progress, isFavorite, toggleFavorite, isKnown, markKnown } from '../progress.js'

const props = defineProps({
  words: { type: Array, required: true }, // [{ word, translation }]
  textId: { type: String, required: true },
})

defineEmits(['close'])

// Copie locale : les mots triés (connu / ajouté) disparaissent immédiatement
// de la liste sans attendre un recalcul de la prop parente.
const remaining = ref(props.words.filter((w) => !isFavorite(w.word) && !isKnown(w.word)))

function speak(word) {
  speakItalian(word, { rate: progress.ttsRate })
}

function setKnown(word) {
  markKnown(word)
  remaining.value = remaining.value.filter((w) => w.word !== word)
}

function addToVocab(entry) {
  toggleFavorite({ word: entry.word, translation: entry.translation, textId: props.textId })
  remaining.value = remaining.value.filter((w) => w.word !== entry.word)
}
</script>

<template>
  <div class="vocab-modal" @click.self="$emit('close')">
    <div class="vocab-panel">
      <button
        class="vocab-close"
        title="Fermer le mode vocabulaire"
        aria-label="Fermer le mode vocabulaire"
        @click="$emit('close')"
      >
        ✕
      </button>

      <h2>📖 Mode vocabulaire</h2>

      <template v-if="remaining.length">
        <p class="count">
          {{ remaining.length }}
          {{ remaining.length > 1 ? 'mots à trier' : 'mot à trier' }} — pour
          chacun, marquez-le « connu » ou ajoutez-le à votre vocabulaire.
        </p>
        <ul class="list">
          <li v-for="w in remaining" :key="w.word" class="entry">
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
              <button
                class="btn add"
                title="Ajouter à mon vocabulaire"
                @click="addToVocab(w)"
              >
                ★ Ajouter
              </button>
            </span>
          </li>
        </ul>
      </template>

      <div v-else class="done">
        <p>✓ Tous les mots de ce texte sont triés.</p>
        <RouterLink :to="{ name: 'words' }">Voir mes mots →</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vocab-modal {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.2rem;
  background: rgba(44, 38, 32, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.vocab-panel {
  position: relative;
  width: min(640px, 100%);
  max-height: min(85vh, 100%);
  overflow-y: auto;
  padding: 1.8rem 2rem;
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 18px;
  background: rgba(255, 253, 248, 0.97);
  box-shadow: 0 24px 60px rgba(44, 38, 32, 0.35);
}

.vocab-panel h2 {
  margin: 0 0 0.4rem;
  font-size: 1.3rem;
}

.vocab-close {
  position: absolute;
  top: 0.8rem;
  right: 0.9rem;
  width: 2rem;
  height: 2rem;
  border: 1px solid rgba(138, 90, 43, 0.35);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
  color: #6b6156;
  font-size: 0.85rem;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}

.vocab-close:hover {
  color: #b0692e;
  border-color: #b0692e;
}

.count {
  margin: 0 0 1.1rem;
  font-size: 0.9rem;
  color: #6b6156;
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

.done {
  padding: 1.2rem 0;
  text-align: center;
  font-size: 0.98rem;
}

.done a {
  color: #b0692e;
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
