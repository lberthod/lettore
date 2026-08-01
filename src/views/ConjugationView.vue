<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { ttsSupported, speakItalian } from '../tts.js'
import { getConjugation } from '../lib/dictionary.js'

const props = defineProps({
  verbo: { type: String, required: true },
})

const conjugation = ref(null)

watch(() => props.verbo, async (v) => {
  conjugation.value = await getConjugation(v)
}, { immediate: true })

const TENSES = [
  { key: 'presente', label: 'Presente' },
  { key: 'passatoProssimo', label: 'Passato prossimo' },
  { key: 'imperfetto', label: 'Imperfetto' },
  { key: 'futuro', label: 'Futuro' },
  { key: 'congiuntivoPresente', label: 'Congiuntivo presente' },
  { key: 'condizionale', label: 'Condizionale' },
]

const PERSONS = ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro']
// Clé « lui/lei » comme dans les données (forme de politesse Lei)
const IMPERATIVE_PERSONS = ['tu', 'lui/lei', 'noi', 'voi', 'loro']

function speak(form) {
  speakItalian(form, { rate: 1 })
}

const ALL_SECTIONS = computed(() => {
  const sections = TENSES.map((t) => ({ key: t.key, label: t.label }))
  if (conjugation.value?.imperativo) {
    sections.push({ key: 'imperativo', label: 'Imperativo' })
  }
  return sections
})
</script>

<template>
  <SceneLayout title="Coniuga" :accent="verbo" tagline="Tableau de conjugaison" wide>
    <div class="top-links">
      <RouterLink class="back" :to="{ name: 'dictionary', params: { word: verbo } }">
        ← Retour à la fiche « {{ verbo }} »
      </RouterLink>
      <RouterLink class="grammar-link" :to="{ name: 'grammar' }">Grammatica →</RouterLink>
    </div>

    <template v-if="conjugation">
      <nav class="quick-nav" aria-label="Aller à un temps">
        <a v-for="s in ALL_SECTIONS" :key="s.key" class="quick-nav-pill" :href="`#t-${s.key}`">
          {{ s.label }}
        </a>
      </nav>

      <div class="tense-grid">
        <section v-for="tense in TENSES" :id="`t-${tense.key}`" :key="tense.key" class="tense-block">
          <h3 class="tense-title">{{ tense.label }}</h3>
          <ul class="conj-rows">
            <li v-for="p in PERSONS" :key="p" class="conj-row">
              <span class="person">{{ p }}</span>
              <span class="value-row">
                <span class="value">{{ conjugation[tense.key]?.[p] ?? '—' }}</span>
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
        </section>

        <section v-if="conjugation.imperativo" id="t-imperativo" class="tense-block">
          <h3 class="tense-title">Imperativo</h3>
          <ul class="conj-rows">
            <li v-for="p in IMPERATIVE_PERSONS" :key="p" class="conj-row">
              <span class="person">{{ p }}</span>
              <span class="value-row">
                <span class="value">{{ conjugation.imperativo[p] ?? '—' }}</span>
                <button
                  v-if="ttsSupported && conjugation.imperativo[p]"
                  class="speak"
                  title="Écouter en italien"
                  aria-label="Écouter en italien"
                  @click="speak(conjugation.imperativo[p])"
                >
                  🔊
                </button>
              </span>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <p v-else class="hint">
      Aucune table de conjugaison disponible pour « {{ verbo }} » dans le dictionnaire actuel.
    </p>
  </SceneLayout>
</template>

<style scoped>
.top-links {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin-bottom: 1rem;
}

.back,
.grammar-link {
  display: inline-block;
  font-size: 0.85rem;
  color: #b0692e;
}

.hint {
  font-size: 0.9rem;
  color: #6b6156;
}

.quick-nav {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 1.4rem;
  padding: 0.7rem 0;
  background: rgba(253, 243, 227, 0.92);
  backdrop-filter: blur(4px);
  border-bottom: 1px solid #e4d9c6;
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

.tense-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.2rem;
  align-items: start;
}

.tense-block {
  scroll-margin-top: 4rem;
  padding: 1rem 1.1rem 1.2rem;
  border: 1px solid #e4d9c6;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.55);
}

.tense-title {
  margin: 0 0 0.7rem;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #b0692e;
  text-transform: uppercase;
  border-bottom: 1px solid #e4d9c6;
  padding-bottom: 0.4rem;
}

.conj-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.conj-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.3rem 0.15rem;
  border-bottom: 1px dashed #e9ddc8;
  font-size: 0.92rem;
}

.conj-row:last-child {
  border-bottom: none;
}

.person {
  color: #8a7e6d;
  font-size: 0.82rem;
  min-width: 4.2rem;
}

.value-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
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
  opacity: 0.5;
  padding: 0.1rem;
  line-height: 1;
}

.speak:hover {
  opacity: 1;
}
</style>
