<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { ttsSupported, speakItalian } from '../tts.js'
import { getConjugation } from '../lib/dictionary.js'

const props = defineProps({
  verbo: { type: String, required: true },
})

const conjugation = computed(() => getConjugation(props.verbo))

const TENSES = [
  { key: 'presente', label: 'Presente' },
  { key: 'passatoProssimo', label: 'Passato prossimo' },
  { key: 'imperfetto', label: 'Imperfetto' },
  { key: 'futuro', label: 'Futuro' },
  { key: 'congiuntivoPresente', label: 'Congiuntivo presente' },
  { key: 'condizionale', label: 'Condizionale' },
]

const PERSONS = ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro']
const IMPERATIVE_PERSONS = ['tu', 'lei', 'noi', 'voi', 'loro']

function speak(form) {
  speakItalian(form, { rate: 1 })
}
</script>

<template>
  <SceneLayout title="Coniuga" :accent="verbo" tagline="Tableau de conjugaison" wide>
    <RouterLink class="back" :to="{ name: 'dictionary', params: { word: verbo } }">
      ← Retour à la fiche « {{ verbo }} »
    </RouterLink>

    <template v-if="conjugation">
      <div v-for="tense in TENSES" :key="tense.key" class="tense-block">
        <h3 class="tense-title">{{ tense.label }}</h3>
        <ul class="forms">
          <li v-for="p in PERSONS" :key="p" class="form">
            <span class="person">{{ p }}</span>
            <span class="value">
              {{ conjugation[tense.key]?.[p] ?? '—' }}
              <button
                v-if="ttsSupported && conjugation[tense.key]?.[p]"
                class="speak"
                title="Écouter en italien"
                aria-label="Écouter en italien"
                @click="speak(conjugation[tense.key][p])"
              >
                🔊
              </button>
            </span>
          </li>
        </ul>
      </div>

      <div v-if="conjugation.imperativo" class="tense-block">
        <h3 class="tense-title">Imperativo</h3>
        <ul class="forms">
          <li v-for="p in IMPERATIVE_PERSONS" :key="p" class="form">
            <span class="person">{{ p }}</span>
            <span class="value">{{ conjugation.imperativo[p] ?? '—' }}</span>
          </li>
        </ul>
      </div>
    </template>

    <p v-else class="hint">
      Aucune table de conjugaison disponible pour « {{ verbo }} » dans l'échantillon pilote actuel.
    </p>
  </SceneLayout>
</template>

<style scoped>
.back {
  display: inline-block;
  font-size: 0.85rem;
  color: #b0692e;
  margin-bottom: 1rem;
}

.hint {
  font-size: 0.9rem;
  color: #6b6156;
}

.tense-block {
  margin-bottom: 1.4rem;
}

.tense-title {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  color: #2c2620;
  border-bottom: 1px solid #e4d9c6;
  padding-bottom: 0.3rem;
}

.forms {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.4rem;
}

.form {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.35rem 0.7rem;
  border: 1px solid #e4d9c6;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.85);
  font-size: 0.92rem;
}

.person {
  color: #6b6156;
}

.value {
  font-weight: 600;
  color: #2c2620;
}

.speak {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  opacity: 0.6;
  margin-left: 0.2rem;
}

.speak:hover {
  opacity: 1;
}
</style>
