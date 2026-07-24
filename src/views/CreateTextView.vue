<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import taxonomy from '../texts/category.json'
import { getAuthInstance } from '../lib/firebase.js'
import { saveUserText, listUserTexts, deleteUserText } from '../lib/userTexts.js'

// API « leggendo » sur le VPS (voir leggendo-server/). La génération est
// asynchrone : POST /generate → { jobId }, puis on sonde /jobs/<id>.
const API_BASE =
  import.meta.env.VITE_LEGGENDO_API || 'https://api.loicberthod.ch/leggendo'

const theme = ref('vita_quotidiana')
const genre = ref('racconto')
const level = ref('A2')
const size = ref('medio')
const title = ref('')
const summary = ref('')

const levels = ['A1', 'A2', 'B1', 'B2', 'C1']
// Certains genres (poésie, théâtre…) ne sont proposés qu'à partir d'un niveau.
const genresForLevel = computed(() =>
  taxonomy.genres.filter((g) => !g.levels || g.levels.includes(level.value))
)
function onLevelChange() {
  if (!genresForLevel.value.some((g) => g.id === genre.value)) {
    genre.value = genresForLevel.value[0]?.id
  }
}

const status = ref('idle') // idle | working | done | error
const error = ref('')
const result = ref(null)
const elapsed = ref(0)
let pollTimer = null
let clockTimer = null

function stopTimers() {
  clearTimeout(pollTimer)
  clearInterval(clockTimer)
  pollTimer = clockTimer = null
}
onBeforeUnmount(stopTimers)

async function generate() {
  status.value = 'working'
  error.value = ''
  result.value = null
  elapsed.value = 0
  clockTimer = setInterval(() => elapsed.value++, 1000)

  try {
    const auth = await getAuthInstance()
    const idToken = await auth?.currentUser?.getIdToken()
    if (!idToken) throw new Error('Connectez-vous pour créer un texte.')

    const res = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        theme: theme.value,
        genre: genre.value,
        level: level.value,
        size: size.value,
        title: title.value,
        summary: summary.value,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
    poll(data.jobId)
  } catch (err) {
    fail(err.message)
  }
}

function poll(jobId) {
  pollTimer = setTimeout(async () => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
      if (data.status === 'done') {
        stopTimers()
        result.value = data.result
        answers.value = {}
        status.value = 'done'
        save(data.result)
      } else if (data.status === 'error') {
        throw new Error(data.error || 'La génération a échoué.')
      } else {
        poll(jobId)
      }
    } catch (err) {
      fail(err.message)
    }
  }, 4000)
}

function fail(message) {
  stopTimers()
  error.value = message
  status.value = 'error'
}

const minutes = computed(() => {
  const m = Math.floor(elapsed.value / 60)
  const s = String(elapsed.value % 60).padStart(2, '0')
  return `${m}:${s}`
})

// Petit quiz interactif sur le texte généré
const answers = ref({})
function answer(qi, oi) {
  if (answers.value[qi] === undefined) answers.value[qi] = oi
}

// --- Persistance Firestore : le texte est enregistré dès la fin de la
// génération, et la liste « Mes textes créés » alimente les liens lecteur. ---
const myTexts = ref([])
const saveState = ref('') // '' | saving | saved | error

async function save(textData) {
  saveState.value = 'saving'
  try {
    const entry = await saveUserText(textData)
    myTexts.value = [entry, ...myTexts.value.filter((e) => e.id !== entry.id)]
    saveState.value = 'saved'
  } catch (err) {
    console.error('Enregistrement du texte :', err)
    saveState.value = 'error'
  }
}

async function removeText(id) {
  if (!confirm('Supprimer ce texte ?')) return
  const backup = myTexts.value
  myTexts.value = myTexts.value.filter((e) => e.id !== id)
  try {
    await deleteUserText(id)
  } catch {
    myTexts.value = backup
  }
}

onMounted(async () => {
  try {
    myTexts.value = await listUserTexts()
  } catch {
    // Pas connecté ou Firestore indisponible : la liste reste vide.
  }
})
</script>

<template>
  <SceneLayout title="Crea il tuo " accent="testo" tagline="Créer son texte" narrow>
    <p>
      Décrivez l'histoire que vous voulez lire : catégorie, forme, niveau,
      longueur, titre et résumé. Notre atelier d'écriture la rédige en italien,
      avec quiz de compréhension — comptez une à plusieurs minutes selon la
      longueur.
    </p>

    <form class="form" @submit.prevent="generate">
      <div class="row">
        <label>
          Catégorie
          <select v-model="theme">
            <option v-for="t in taxonomy.themes" :key="t.id" :value="t.id">
              {{ t.icon }} {{ t.name }}
            </option>
          </select>
        </label>
        <label>
          Sous-catégorie (forme)
          <select v-model="genre">
            <option v-for="g in genresForLevel" :key="g.id" :value="g.id">
              {{ g.icon }} {{ g.name }}
            </option>
          </select>
        </label>
      </div>
      <div class="row">
        <label>
          Niveau
          <select v-model="level" @change="onLevelChange">
            <option v-for="l in levels" :key="l" :value="l">{{ l }}</option>
          </select>
        </label>
        <label>
          Taille
          <select v-model="size">
            <option v-for="s in taxonomy.sizes" :key="s.id" :value="s.id">
              {{ s.name }} (≈ {{ s.targetWords }} mots)
            </option>
          </select>
        </label>
      </div>
      <label>
        Titre
        <input
          v-model="title"
          type="text"
          required
          minlength="3"
          maxlength="120"
          placeholder="Il gatto del faro"
        />
      </label>
      <label>
        Résumé de ce que vous voulez lire
        <textarea
          v-model="summary"
          rows="5"
          required
          minlength="10"
          maxlength="1500"
          placeholder="Un vieux gardien de phare en Ligurie recueille un chat pendant une tempête ; le chat l'aide à retrouver le goût de parler aux gens du village…"
        ></textarea>
      </label>
      <button class="btn-primary" type="submit" :disabled="status === 'working'">
        {{ status === 'working' ? 'Génération en cours…' : 'Générer mon histoire' }}
      </button>
      <p v-if="status === 'working'" class="hint working">
        ✍️ L'histoire s'écrit ({{ minutes }})… Texte, lexique et quiz sont
        générés puis vérifiés : laissez la page ouverte.
      </p>
      <p v-if="status === 'error'" class="hint error">{{ error }}</p>
    </form>

    <article v-if="result" class="story">
      <h2>{{ result.title }}</h2>
      <p class="story-meta">
        Niveau {{ result.level }} · {{ result.wordCount }} mots
        <template v-if="saveState === 'saving'"> · enregistrement…</template>
        <template v-else-if="saveState === 'saved'"> · ✓ enregistré</template>
        <template v-else-if="saveState === 'error'">
          · ⚠ enregistrement impossible
          <button type="button" class="link-btn" @click="save(result)">réessayer</button>
        </template>
      </p>
      <RouterLink
        v-if="saveState === 'saved'"
        class="btn-primary read-link"
        :to="{ name: 'reader', params: { id: result.id } }"
      >
        Lire dans le lecteur (traduction au clic)
      </RouterLink>
      <p v-for="(p, i) in result.paragraphs" :key="i" class="story-p">{{ p }}</p>

      <section v-if="result.questions?.length" class="quiz">
        <h3>Hai capito? — Quiz</h3>
        <div v-for="(q, qi) in result.questions" :key="qi" class="quiz-q">
          <p>{{ qi + 1 }}. {{ q.q }}</p>
          <button
            v-for="(opt, oi) in q.options"
            :key="oi"
            type="button"
            class="quiz-opt"
            :class="{
              good: answers[qi] !== undefined && oi === q.correct,
              bad: answers[qi] === oi && oi !== q.correct,
            }"
            @click="answer(qi, oi)"
          >
            {{ opt }}
          </button>
        </div>
      </section>
    </article>

    <section v-if="myTexts.length" class="my-texts">
      <h2>Mes textes créés</h2>
      <ul>
        <li v-for="t in myTexts" :key="t.id">
          <RouterLink :to="{ name: 'reader', params: { id: t.id } }">
            {{ t.title }}
          </RouterLink>
          <span class="my-meta">{{ t.level }} · {{ t.wordCount }} mots</span>
          <button
            type="button"
            class="link-btn danger"
            title="Supprimer"
            @click="removeText(t.id)"
          >
            supprimer
          </button>
        </li>
      </ul>
    </section>
  </SceneLayout>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

@media (max-width: 560px) {
  .row {
    grid-template-columns: 1fr;
  }
}

.hint.working {
  color: #b0692e;
}

.hint.error {
  color: #a33a2a;
}

.story {
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(176, 105, 46, 0.35);
}

.story h2 {
  font-family: 'Georgia', 'Times New Roman', serif;
  margin-bottom: 0.2rem;
}

.story-meta {
  color: #6b6156;
  font-size: 0.88rem;
  margin-top: 0;
}

.story-p {
  white-space: pre-line;
  line-height: 1.75;
}

.quiz {
  margin-top: 2rem;
}

.quiz-q p {
  font-weight: 700;
  margin-bottom: 0.4rem;
}

.quiz-opt {
  display: block;
  width: 100%;
  text-align: left;
  margin: 0.3rem 0;
  padding: 0.5rem 0.8rem;
  border: 1px solid rgba(107, 97, 86, 0.4);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.quiz-opt:hover {
  border-color: #b0692e;
}

.quiz-opt.good {
  border-color: #3d7a3d;
  background: rgba(61, 122, 61, 0.12);
}

.quiz-opt.bad {
  border-color: #a33a2a;
  background: rgba(163, 58, 42, 0.12);
}

.read-link {
  display: inline-block;
  margin: 0.4rem 0 1rem;
  text-decoration: none;
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

.link-btn.danger {
  color: #a33a2a;
}

.my-texts {
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(176, 105, 46, 0.35);
}

.my-texts h2 {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 1.15rem;
}

.my-texts ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.my-texts li {
  display: flex;
  align-items: baseline;
  gap: 0.7rem;
  padding: 0.45rem 0;
  border-bottom: 1px dashed rgba(107, 97, 86, 0.25);
}

.my-texts a {
  color: #2c2620;
  font-weight: 700;
  text-decoration: none;
}

.my-texts a:hover {
  color: #b0692e;
}

.my-meta {
  color: #6b6156;
  font-size: 0.85rem;
  margin-left: auto;
}
</style>
