<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
// Repli local si l'API taxonomy est injoignable : mêmes thèmes, pas d'aller-retour.
import localTaxonomy from '../texts/category.json'
import { fetchQuota } from '../lib/generation.js'
import {
  correctText,
  fetchTaxonomy,
  CORRECTION_MAX_CHARS,
} from '../lib/correction.js'

const text = ref('')

// Solde de crédits (comme CreateTextView) : la correction coûte 1 crédit et
// est réservée aux rôles à crédits (premium_plus/enseignant) — le serveur
// reste la seule source de vérité, ceci n'est qu'un affichage informatif.
const quota = ref(null)
async function refreshQuota() {
  quota.value = await fetchQuota()
}
onMounted(refreshQuota)

const CORRECTION_COST = 1
const canCorrect = computed(() => {
  if (!quota.value) return true // pas chargé : le serveur tranchera
  if (quota.value.type !== 'credits') return false
  return quota.value.remaining >= CORRECTION_COST
})
// Rôle sans crédits (gratuit, premium lecture) : la correction fait partie
// de Premium IA, comme la génération — bannière de blocage plutôt que refus
// serveur après coup.
const blocked = computed(() => quota.value && quota.value.type !== 'credits')

// Suggestion de sujet optionnelle : un thème de la taxonomie tiré au sort
// (GET /leggendo/taxonomy, repli sur la copie locale si l'API ne répond pas).
const taxonomy = ref(null)
const suggestion = ref(null)
async function suggestTopic() {
  if (!taxonomy.value) {
    taxonomy.value = (await fetchTaxonomy()) || localTaxonomy
  }
  const themes = taxonomy.value.themes || []
  if (!themes.length) return
  const pool = themes.filter((t) => t.id !== suggestion.value?.id)
  suggestion.value = pool[Math.floor(Math.random() * pool.length)] || themes[0]
}

// État de la correction (synchrone, quelques secondes — pas de job).
const working = ref(false)
const error = ref('')
const result = ref(null)
const resultEl = ref(null)

async function submit() {
  if (working.value) return
  working.value = true
  error.value = ''
  result.value = null
  try {
    result.value = await correctText(text.value)
    await nextTick()
    resultEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (err) {
    error.value = err.message
  } finally {
    working.value = false
    refreshQuota()
  }
}

// Étiquettes des types d'erreur (mêmes identifiants que le serveur).
const TYPE_LABELS = {
  grammatica: 'Grammatica',
  lessico: 'Lessico',
  registro: 'Registro',
  ortografia: 'Ortografia',
}
// Erreurs groupées par type, dans un ordre stable, groupes vides omis.
const groupedErrors = computed(() => {
  if (!result.value?.errors) return []
  return Object.keys(TYPE_LABELS)
    .map((type) => ({
      type,
      label: TYPE_LABELS[type],
      items: result.value.errors.filter((e) => e.type === type),
    }))
    .filter((g) => g.items.length)
})
</script>

<template>
  <SceneLayout title="Scri" accent="vi" tagline="Production écrite" narrow>
    <p>
      Écrivez librement en italien — quelques phrases suffisent. Notre
      correcteur pédagogique corrige votre texte, explique chaque erreur en
      français et estime votre niveau. Une correction coûte 1 crédit.
    </p>

    <p v-if="blocked" class="quota-banner blocked">
      La correction de textes fait partie de la formule
      <RouterLink :to="{ name: 'pricing' }">Premium IA</RouterLink> — votre
      formule actuelle ne l'inclut pas.
    </p>
    <p v-else-if="quota?.type === 'credits'" class="quota-banner">
      {{ quota.remaining }} crédit{{ quota.remaining > 1 ? 's' : '' }} sur
      {{ quota.limit }} restant{{ quota.remaining > 1 ? 's' : '' }} ce mois-ci.
    </p>

    <form class="form" @submit.prevent="submit">
      <fieldset class="fields" :disabled="working">
        <p class="suggest-row">
          <button type="button" class="link-btn" @click="suggestTopic">
            💡 Suggérer un sujet
          </button>
          <span v-if="suggestion" class="suggestion">
            {{ suggestion.icon }} <strong>{{ suggestion.name }}</strong> — {{ suggestion.hint }}
          </span>
        </p>
        <label>
          <span class="label-line">
            Votre texte en italien
            <small class="char-count">{{ text.length }}/{{ CORRECTION_MAX_CHARS }}</small>
          </span>
          <textarea
            v-model="text"
            rows="8"
            required
            :maxlength="CORRECTION_MAX_CHARS"
            placeholder="Ieri sono andato al mercato con mia sorella. Abbiamo comprato…"
          ></textarea>
        </label>
      </fieldset>
      <button class="btn-primary" type="submit" :disabled="working || !canCorrect || !text.trim()">
        <span v-if="working" class="spinner" aria-hidden="true"></span>
        {{ working ? 'Correction en cours…' : 'Corriger mon texte' }}
      </button>
      <p v-if="working" class="hint working" role="status">
        ✏️ Correction en cours — quelques secondes…
      </p>
      <p v-if="error" class="hint error">
        ⚠ {{ error }}
        <button type="button" class="link-btn" @click="submit">Réessayer</button>
      </p>
    </form>

    <article v-if="result" ref="resultEl" class="correction">
      <h2>La tua correzione</h2>
      <p class="correction-meta">
        Niveau estimé : <span class="level-badge">{{ result.level_estimate }}</span>
        · {{ result.errors.length }}
        erreur{{ result.errors.length > 1 ? 's' : '' }} relevée{{ result.errors.length > 1 ? 's' : '' }}
      </p>

      <h3>Testo corretto</h3>
      <p class="corrected-text">{{ result.corrected }}</p>

      <p v-if="!result.errors.length" class="no-errors">
        🎉 Bravissimo ! Aucune erreur relevée dans votre texte.
      </p>
      <section v-for="group in groupedErrors" :key="group.type" class="error-group">
        <h3>
          <span class="type-badge" :class="group.type">{{ group.label }}</span>
          <small class="type-count">{{ group.items.length }}</small>
        </h3>
        <div v-for="(e, i) in group.items" :key="i" class="error-item">
          <p class="error-diff">
            <span class="original">{{ e.original }}</span>
            <span class="arrow" aria-hidden="true">→</span>
            <span class="fixed">{{ e.correction }}</span>
          </p>
          <p class="error-explanation">{{ e.explanation }}</p>
        </div>
      </section>
    </article>
  </SceneLayout>
</template>

<style scoped>
.fields {
  border: none;
  padding: 0;
  margin: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.fields:disabled {
  opacity: 0.6;
}

.suggest-row {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.6rem;
}

.suggestion {
  color: #6b6156;
  font-size: 0.85rem;
  line-height: 1.4;
}

.label-line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
}

.char-count {
  color: #6b6156;
  font-size: 0.78rem;
  font-weight: 400;
}

.hint.working {
  color: #b0692e;
}

.hint.error {
  color: #a33a2a;
}

.spinner {
  display: inline-block;
  width: 0.85em;
  height: 0.85em;
  margin-right: 0.45em;
  vertical-align: -0.1em;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.quota-banner {
  margin: 0.8rem 0 1.2rem;
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  background: rgba(176, 105, 46, 0.08);
  border: 1px solid rgba(176, 105, 46, 0.25);
  font-size: 0.9rem;
}

.quota-banner.blocked {
  background: rgba(163, 58, 42, 0.08);
  border-color: rgba(163, 58, 42, 0.3);
  color: #a33a2a;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: #b0692e;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
  font-size: 0.88rem;
}

.correction {
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(176, 105, 46, 0.35);
}

.correction h2 {
  font-family: 'Georgia', 'Times New Roman', serif;
  margin-bottom: 0.2rem;
}

.correction-meta {
  color: #6b6156;
  font-size: 0.88rem;
  margin-top: 0;
}

.level-badge {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: #b0692e;
  color: #faf6f0;
  font-weight: 700;
  font-size: 0.82rem;
}

.corrected-text {
  white-space: pre-line;
  line-height: 1.75;
  padding: 0.8rem 1rem;
  border-radius: 10px;
  background: rgba(61, 122, 61, 0.07);
  border: 1px solid rgba(61, 122, 61, 0.25);
}

.no-errors {
  color: #3d7a3d;
  font-weight: 700;
}

.error-group {
  margin-top: 1.4rem;
}

.error-group h3 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.type-badge {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
  border: 1px solid transparent;
}

/* Une teinte par type d'erreur, dans la palette papier de l'app. */
.type-badge.grammatica {
  background: rgba(163, 58, 42, 0.1);
  border-color: rgba(163, 58, 42, 0.35);
  color: #a33a2a;
}

.type-badge.lessico {
  background: rgba(176, 105, 46, 0.12);
  border-color: rgba(176, 105, 46, 0.4);
  color: #6f4722;
}

.type-badge.registro {
  background: rgba(90, 96, 150, 0.12);
  border-color: rgba(90, 96, 150, 0.4);
  color: #4a5086;
}

.type-badge.ortografia {
  background: rgba(61, 122, 61, 0.1);
  border-color: rgba(61, 122, 61, 0.35);
  color: #3d7a3d;
}

.type-count {
  color: #6b6156;
  font-size: 0.8rem;
  font-weight: 400;
}

.error-item {
  margin: 0.5rem 0 0.9rem;
  padding: 0.6rem 0.9rem;
  border: 1px solid rgba(107, 97, 86, 0.25);
  border-radius: 10px;
}

.error-diff {
  margin: 0 0 0.3rem;
  line-height: 1.6;
}

.original {
  text-decoration: line-through;
  text-decoration-color: rgba(163, 58, 42, 0.7);
  color: #a33a2a;
}

.arrow {
  margin: 0 0.4rem;
  color: #6b6156;
}

.fixed {
  color: #3d7a3d;
  font-weight: 700;
}

.error-explanation {
  margin: 0;
  color: #4a4238;
  font-size: 0.92rem;
  line-height: 1.55;
}
</style>
