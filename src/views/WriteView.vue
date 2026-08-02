<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import CorrectionRetry from '../components/CorrectionRetry.vue'
// Repli local si l'API taxonomy est injoignable : mêmes thèmes, pas d'aller-retour.
import localTaxonomy from '../texts/category.json'
import textsIndex from '../texts/index.json'
import { fetchQuota } from '../lib/generation.js'
import {
  correctText,
  fetchTaxonomy,
  CORRECTION_MAX_CHARS,
} from '../lib/correction.js'
import { progress, logActivity, addErrorCard } from '../progress.js'
import { selectPriorityErrors } from '../lib/correctionRetry.js'
import { isCatalogText, loadCatalogText } from '../lib/protectedContent.js'
import { saveDraft, loadDraft, clearDraft } from '../lib/writingDraft.js'
import { currentUser } from '../lib/auth.js'
import {
  CONTENT_ACTIONS,
  pickGuidedPrompt,
  contentActionById,
  wordsForLevel,
  levelTier,
  pickWordsFrom,
} from '../lib/writingPrompts.js'

const route = useRoute()

// --- Trois modes (IntegartioNOptimsaitonPedago.MD §7.1) ---
const mode = ref('libero') // 'libero' | 'guidato' | 'contenuto'

const text = ref('')

// Niveau de référence pour adapter les mots utiles (§7.2) et le nombre
// d'erreurs prioritaires du feedback (§7.3) : le dernier niveau mesuré s'il
// existe, sinon un repli neutre (B, ni trop simple ni trop exigeant).
const referenceLevel = computed(() => progress.skills?.scrittura?.levels?.at(-1) || 'B1')

// Confirmation avant de perdre le contexte d'un texte non encore corrigé
// (0.1) : `result` non nul signifie que le texte a déjà été envoyé au
// serveur, donc rien à perdre. Le texte reste par ailleurs sauvegardé
// localement (saveDraft) pour le contexte quitté — on peut donc le vider
// sans risque une fois la confirmation acceptée.
function guardChange(applyChange) {
  if (text.value.trim() && !result.value) {
    const ok = window.confirm(
      "Vous avez un texte non corrigé. Changer maintenant videra le champ (votre brouillon reste enregistré sur cet appareil). Continuer ?"
    )
    if (!ok) return
    text.value = ''
    result.value = null
  }
  applyChange()
}

// --- Mode guidé ---
const guidedPrompt = ref(pickGuidedPrompt())
function newGuidedPrompt() {
  guardChange(() => {
    guidedPrompt.value = pickGuidedPrompt(guidedPrompt.value?.id)
    resetAids()
  })
}

// --- Mode lié à un contenu : textes terminés (quiz réussi ou marqués lus) ---
const sourceTexts = computed(() =>
  textsIndex.filter((t) => progress.readTexts.includes(t.id))
)
const sourceTextId = ref(null)
// Proxy utilisé par le <select> du template : passe par guardChange avant
// de changer de sujet, comme chooseMode.
const sourceTextIdModel = computed({
  get: () => sourceTextId.value,
  set: (id) => guardChange(() => {
    sourceTextId.value = id
  }),
})
const contentActionId = ref('riassumere')
const contentAction = computed(() => contentActionById(contentActionId.value))
const selectedSource = computed(() => sourceTexts.value.find((t) => t.id === sourceTextId.value) || null)

// Lexique du texte choisi, chargé à la demande (seulement utile pour
// « réutiliser des mots ») — même chargement que VocabularyView.vue.
const sourceWords = ref({})
const reuseWords = ref([]) // 3 mots choisis pour l'action 'riuso'

async function loadSourceWords(id) {
  sourceWords.value = {}
  reuseWords.value = []
  if (!id) return
  const data = isCatalogText(id)
    ? await loadCatalogText(id)
    : await (await import('../lib/userTexts.js')).loadUserText(id)
  sourceWords.value = data?.words || {}
  if (contentActionId.value === 'riuso') shuffleReuseWords()
}

function shuffleReuseWords() {
  reuseWords.value = pickWordsFrom(sourceWords.value, 3)
}

watch(sourceTextId, (id) => loadSourceWords(id))
watch(contentActionId, (id) => {
  resetAids()
  if (id === 'riuso' && sourceTextId.value) shuffleReuseWords()
})

// Suit un lien de continuité (§9.1/9.3 : depuis un texte lu ou une révision
// de vocabulaire) sans imposer une navigation parallèle : query params lus
// une seule fois au montage, la vue reste utilisable normalement ensuite.
onMounted(() => {
  const q = route.query
  if (q.mode === 'contenuto' || q.mode === 'guidato') mode.value = q.mode
  if (q.sourceTextId && sourceTexts.value.some((t) => t.id === q.sourceTextId)) {
    sourceTextId.value = q.sourceTextId
  }
  if (q.action && CONTENT_ACTIONS.some((a) => a.id === q.action)) {
    contentActionId.value = q.action
  }
  if (q.words) {
    const words = String(q.words).split(',').filter(Boolean).slice(0, 3)
    if (words.length) reuseWords.value = words
  }
  refreshQuota()
  checkForDraft()
})

function chooseMode(m) {
  if (m === mode.value) return
  guardChange(() => {
    mode.value = m
    resetAids()
  })
}

// --- Brouillon local (0.1 — filet de sécurité) : une entrée par couple
// (mode, sujet), isolée par compte comme dailySession.js. Le sujet est le
// prompt guidé en mode 'guidato', le texte de départ en mode 'contenuto'
// (repli sur l'action si aucun texte choisi), rien en mode libre.
const draftPromptId = computed(() => {
  if (mode.value === 'guidato') return guidedPrompt.value?.id || null
  if (mode.value === 'contenuto') return sourceTextId.value || contentActionId.value || null
  return null
})

function draftContext() {
  return { uid: currentUser.value?.uid || null, mode: mode.value, promptId: draftPromptId.value }
}

const pendingDraft = ref(null)
const lastSavedAt = ref(null)

// N'affiche l'offre de reprise que si l'utilisateur n'a pas déjà commencé à
// taper autre chose dans ce contexte — jamais d'écrasement forcé.
function checkForDraft() {
  if (text.value.trim()) {
    pendingDraft.value = null
    return
  }
  const draft = loadDraft(draftContext())
  pendingDraft.value = draft && draft.text?.trim() ? draft : null
}

function restoreDraft() {
  if (!pendingDraft.value) return
  text.value = pendingDraft.value.text
  pendingDraft.value = null
}

function dismissDraft() {
  pendingDraft.value = null
}

watch([mode, draftPromptId], checkForDraft)

const DRAFT_DEBOUNCE_MS = 800
let draftTimer = null
watch(text, (val) => {
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    if (!val.trim()) {
      clearDraft(draftContext())
      lastSavedAt.value = null
      return
    }
    const savedAt = Date.now()
    saveDraft({ ...draftContext(), text: val, savedAt })
    lastSavedAt.value = savedAt
  }, DRAFT_DEBOUNCE_MS)
})

onBeforeUnmount(() => {
  if (draftTimer) clearTimeout(draftTimer)
})

const wordCount = computed(() => (text.value.trim() ? text.value.trim().split(/\s+/).length : 0))

const savedAtLabel = computed(() => {
  if (!lastSavedAt.value) return ''
  const d = new Date(lastSavedAt.value)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `Enregistré sur cet appareil à ${hh}:${mm}`
})

// --- Aides progressives (§7.2) : reformulation, idées, mots utiles,
// amorces de phrases, exemple complet — dans cet ordre, chacune facultative.
// L'usage est enregistré (helpUsed) car il change la valeur diagnostique du
// texte produit (§7.4).
const AID_ORDER = [
  { key: 'reformulation', label: 'Reformuler la consigne' },
  { key: 'idees', label: 'Idées' },
  { key: 'mots', label: 'Mots utiles' },
  { key: 'amorces', label: 'Amorces de phrases' },
  { key: 'esempio', label: 'Exemple complet' },
]

const helpUsed = ref([])
const revealedAids = ref(new Set())

function resetAids() {
  helpUsed.value = []
  revealedAids.value = new Set()
}

// Source des aides selon le mode : le prompt guidé, ou l'action liée au
// contenu. En mode libre, il n'y a pas de consigne à aider.
const aidSource = computed(() => {
  if (mode.value === 'guidato') return guidedPrompt.value
  if (mode.value === 'contenuto') return contentAction.value
  return null
})

const aidContent = computed(() => {
  const src = aidSource.value
  if (!src) return {}
  return {
    reformulation: src.reformulation || '',
    idees: src.ideas || [],
    mots: wordsForLevel(src.words, referenceLevel.value),
    amorces: src.starters || [],
    esempio: src.example || '',
  }
})

// N'affiche un bouton d'aide que si le contenu correspondant existe pour ce
// mode (ex. pas d'exemple complet enregistré pour « réutiliser des mots »).
const availableAids = computed(() =>
  AID_ORDER.filter((a) => {
    const v = aidContent.value[a.key]
    return Array.isArray(v) ? v.length > 0 : !!v
  })
)

function revealAid(key) {
  if (revealedAids.value.has(key)) return
  const next = new Set(revealedAids.value)
  next.add(key)
  revealedAids.value = next
  helpUsed.value = [...helpUsed.value, key]
}

// --- Solde de crédits (comme CreateTextView) : la correction coûte 1 crédit
// et est réservée aux rôles à crédits (premium_plus/enseignant) — le serveur
// reste la seule source de vérité, ceci n'est qu'un affichage informatif. ---
const quota = ref(null)
async function refreshQuota() {
  quota.value = await fetchQuota()
}

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

// Suggestion de sujet optionnelle (mode libre uniquement) : un thème de la
// taxonomie tiré au sort (GET /leggendo/taxonomy, repli sur la copie locale).
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

// La consigne effectivement proposée à l'utilisateur, pour affichage — pas
// envoyée au serveur (seul le texte l'est) : elle sert de repère, pas de
// prompt IA.
const instructionLine = computed(() => {
  if (mode.value === 'guidato') return guidedPrompt.value?.situation || ''
  if (mode.value === 'contenuto') {
    if (!selectedSource.value && !reuseWords.value.length) return ''
    if (contentActionId.value === 'riuso') {
      return reuseWords.value.length
        ? `Réutilisez ces mots : ${reuseWords.value.join(', ')}.`
        : contentAction.value.instruction
    }
    return contentAction.value.instruction
  }
  return ''
})

// --- État de la correction (synchrone, quelques secondes — pas de job). ---
const working = ref(false)
const error = ref('')
const result = ref(null)
const resultEl = ref(null)
// Événement 'scrittura' de cette correction : conservé pour y ajouter
// retryCount/retrySuccess/errorTypes une fois la reprise (CorrectionRetry)
// terminée, plutôt que de logger un second événement séparé.
const activityEvent = ref(null)

// Nombre d'erreurs prioritaires retravaillées : plafonné selon le niveau
// (§7.3 — un débutant retravaille moins d'erreurs à la fois).
const maxRetryErrors = computed(() => (levelTier(referenceLevel.value) === 'A' ? 1 : 2))

async function submit() {
  if (working.value) return
  working.value = true
  error.value = ''
  result.value = null
  activityEvent.value = null
  try {
    result.value = await correctText(text.value, instructionLine.value || undefined)
    const errors = Array.isArray(result.value.errors) ? result.value.errors : []
    const priorityCount = selectPriorityErrors(errors, { max: maxRetryErrors.value }).length
    const wordCount = text.value.trim() ? text.value.trim().split(/\s+/).length : 0
    // Transfert (§15.1/§9.3) : combien des mots suggérés après une révision
    // se retrouvent dans le texte produit — seulement le compte, jamais les
    // mots ni le texte eux-mêmes.
    const lowerText = text.value.toLowerCase()
    const reuseWordsUsed = reuseWords.value.filter((w) => lowerText.includes(String(w).toLowerCase())).length
    // Capture pédagogique (§7.4) : la session compte dans le parcours
    // (touchStreak est appelé par logActivity), chaque erreur devient une
    // carte de révision (dédupliquée par contenu dans addErrorCard), et le
    // texte intégral n'est jamais enregistré dans le journal d'activité.
    activityEvent.value = logActivity({
      skill: 'scrittura',
      level: result.value.level_estimate,
      mode: mode.value,
      promptId: mode.value === 'guidato' ? guidedPrompt.value?.id : null,
      sourceTextId: mode.value === 'contenuto' ? sourceTextId.value : null,
      wordCount,
      helpUsed: [...helpUsed.value],
      errorCount: errors.length,
      priorityErrorCount: priorityCount,
      reuseWordsOffered: reuseWords.value.length,
      reuseWordsUsed,
    })
    if (draftTimer) clearTimeout(draftTimer)
    clearDraft(draftContext())
    lastSavedAt.value = null
    pendingDraft.value = null
    for (const e of errors) {
      addErrorCard({
        original: e.original,
        correction: e.correction,
        explanation: e.explanation,
        type: e.type,
        source: 'scrivi',
        sourceId: mode.value === 'contenuto' ? sourceTextId.value : null,
      })
    }
    await nextTick()
    resultEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (err) {
    error.value = err.message
  } finally {
    working.value = false
    refreshQuota()
  }
}

// Reprise après feedback (section 5) : on complète l'événement 'scrittura'
// déjà loggé plutôt que d'en créer un second pour la même correction.
function onRetryComplete({ retryCount, retrySuccess, errorTypes }) {
  if (!activityEvent.value) return
  activityEvent.value.retryCount = retryCount
  activityEvent.value.retrySuccess = retrySuccess
  activityEvent.value.errorTypes = errorTypes
}

// Étiquettes du statut de réussite communicative (Sprint 1.1) — même
// vocabulaire que COMMUNICATIVE_STATUSES côté serveur (schema.mjs).
const COMMUNICATIVE_LABELS = {
  atteint: '🎯 Objectif atteint',
  partiel: '🎯 Objectif partiellement atteint',
  a_completer: '🎯 Objectif à compléter',
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

// Note de feedback adaptée au niveau (§7.3) : langage et attentes changent
// avec le palier, sans jamais inventer une règle grammaticale.
const LEVEL_NOTES = {
  A: 'Débutant : on se concentre sur une seule correction prioritaire et des explications simples en français.',
  B: 'Intermédiaire : on travaille surtout la cohésion et le registre, avec des explications un peu plus fines.',
  C: 'Avancé : on regarde le naturel, la précision et l’implicite — jamais de faute inventée sur une formulation déjà correcte.',
}
const levelNote = computed(() => LEVEL_NOTES[levelTier(result.value?.level_estimate)] || '')
</script>

<template>
  <SceneLayout title="Scri" accent="vi" tagline="Production écrite" narrow>
    <p>
      Écrivez en italien — quelques phrases suffisent. Notre correcteur
      pédagogique corrige votre texte, explique chaque erreur en français et
      estime votre niveau. Une correction coûte 1 crédit.
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

    <!-- Trois modes (§7.1) -->
    <div class="mode-row" role="tablist" aria-label="Mode d'écriture">
      <button
        type="button"
        class="mode-btn"
        :class="{ active: mode === 'libero' }"
        role="tab"
        :aria-selected="mode === 'libero'"
        @click="chooseMode('libero')"
      >
        ✍️ Libre
      </button>
      <button
        type="button"
        class="mode-btn"
        :class="{ active: mode === 'guidato' }"
        role="tab"
        :aria-selected="mode === 'guidato'"
        @click="chooseMode('guidato')"
      >
        🧭 Guidé
      </button>
      <button
        type="button"
        class="mode-btn"
        :class="{ active: mode === 'contenuto' }"
        role="tab"
        :aria-selected="mode === 'contenuto'"
        @click="chooseMode('contenuto')"
      >
        📖 Lié à un texte
      </button>
    </div>

    <!-- Panneau du mode guidé -->
    <div v-if="mode === 'guidato'" class="prompt-panel">
      <p class="prompt-situation">{{ guidedPrompt.situation }}</p>
      <p class="prompt-meta">
        Destinataire : <strong>{{ guidedPrompt.recipient }}</strong>
      </p>
      <p class="prompt-goal">{{ guidedPrompt.goal }}</p>
      <button type="button" class="link-btn" @click="newGuidedPrompt">
        🔄 Autre situation
      </button>
    </div>

    <!-- Panneau du mode lié à un contenu -->
    <div v-else-if="mode === 'contenuto'" class="prompt-panel">
      <p v-if="!sourceTexts.length && !reuseWords.length" class="hint">
        Terminez d'abord un texte pour pouvoir écrire à son sujet —
        <RouterLink :to="{ name: 'library' }">choisir un texte →</RouterLink>
      </p>
      <template v-else>
        <label v-if="sourceTexts.length" class="content-field">
          Texte de départ
          <select v-model="sourceTextIdModel">
            <option :value="null" disabled>Choisir un texte terminé…</option>
            <option v-for="t in sourceTexts" :key="t.id" :value="t.id">
              {{ t.title }} ({{ t.level }})
            </option>
          </select>
        </label>
        <label class="content-field">
          Consigne
          <select v-model="contentActionId">
            <option v-for="a in CONTENT_ACTIONS" :key="a.id" :value="a.id">
              {{ a.label }}
            </option>
          </select>
        </label>
        <p v-if="contentActionId !== 'riuso'" class="prompt-goal">
          {{ contentAction.instruction }}
        </p>
        <template v-else>
          <p class="prompt-goal">{{ contentAction.instruction }}</p>
          <p v-if="reuseWords.length" class="reuse-words">
            <span v-for="w in reuseWords" :key="w" class="reuse-word">{{ w }}</span>
            <button v-if="selectedSource" type="button" class="link-btn" @click="shuffleReuseWords">
              🔄 Autres mots
            </button>
          </p>
          <p v-else class="hint">Choisissez un texte pour proposer des mots à réutiliser.</p>
        </template>
      </template>
    </div>

    <!-- Aides progressives (§7.2), pour les modes guidé et lié à un contenu -->
    <div v-if="availableAids.length" class="aids">
      <div class="aids-buttons">
        <button
          v-for="a in availableAids"
          :key="a.key"
          type="button"
          class="aid-btn"
          :class="{ used: revealedAids.has(a.key) }"
          @click="revealAid(a.key)"
        >
          {{ a.label }}
        </button>
      </div>
      <div v-if="revealedAids.size" class="aids-content">
        <p v-if="revealedAids.has('reformulation')" class="aid-block">
          💬 {{ aidContent.reformulation }}
        </p>
        <ul v-if="revealedAids.has('idees')" class="aid-block aid-list">
          <li v-for="(idea, i) in aidContent.idees" :key="i">{{ idea }}</li>
        </ul>
        <p v-if="revealedAids.has('mots')" class="aid-block">
          <span v-for="(w, i) in aidContent.mots" :key="i" class="aid-word">{{ w }}</span>
        </p>
        <p v-if="revealedAids.has('amorces')" class="aid-block">
          <span v-for="(s, i) in aidContent.amorces" :key="i" class="aid-starter">{{ s }}</span>
        </p>
        <p v-if="revealedAids.has('esempio')" class="aid-block esempio">
          {{ aidContent.esempio }}
        </p>
      </div>
    </div>

    <p v-if="pendingDraft" class="draft-banner">
      📝 Vous avez un brouillon non envoyé pour ce sujet.
      <button type="button" class="link-btn" @click="restoreDraft">Reprendre mon brouillon</button>
      <button type="button" class="link-btn" @click="dismissDraft">Ignorer</button>
    </p>

    <form class="form" @submit.prevent="submit">
      <fieldset class="fields" :disabled="working">
        <p v-if="mode === 'libero'" class="suggest-row">
          <button type="button" class="link-btn" @click="suggestTopic">
            💡 Suggérer un sujet
          </button>
          <span v-if="suggestion" class="suggestion">
            {{ suggestion.icon }} <strong>{{ suggestion.name }}</strong> — {{ suggestion.hint }}
          </span>
        </p>
        <p v-else-if="instructionLine" class="instruction-line">📝 {{ instructionLine }}</p>
        <label>
          <span class="label-line">
            Votre texte en italien
            <small class="char-count">
              {{ text.length }}/{{ CORRECTION_MAX_CHARS }} · {{ wordCount }} mot{{ wordCount > 1 ? 's' : '' }}
            </small>
          </span>
          <textarea
            v-model="text"
            rows="8"
            required
            :maxlength="CORRECTION_MAX_CHARS"
            placeholder="Ieri sono andato al mercato con mia sorella. Abbiamo comprato…"
          ></textarea>
          <small v-if="savedAtLabel" class="draft-saved">{{ savedAtLabel }}</small>
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

      <!-- Réussite communicative (Sprint 1.1) : absente en mode libre ou pour
           un résultat mis en cache avant ce champ — un simple statut + une
           phrase, jamais un score, distinct du détail linguistique ci-dessous. -->
      <p v-if="result.communicative" class="communicative-note" :class="result.communicative.status">
        <span class="communicative-status">{{ COMMUNICATIVE_LABELS[result.communicative.status] || result.communicative.status }}</span>
        {{ result.communicative.note }}
      </p>

      <p class="correction-meta">
        Niveau estimé : <span class="level-badge">{{ result.level_estimate }}</span>
        · {{ result.errors.length }}
        erreur{{ result.errors.length > 1 ? 's' : '' }} relevée{{ result.errors.length > 1 ? 's' : '' }}
      </p>
      <p v-if="levelNote" class="level-note">{{ levelNote }}</p>

      <h3>Testo corretto</h3>
      <p class="corrected-text">{{ result.corrected }}</p>

      <p v-if="!result.errors.length" class="no-errors">
        🎉 Bravissimo ! Aucune erreur relevée dans votre texte.
      </p>
      <p v-else class="review-note">
        📌 {{ result.errors.length }}
        erreur{{ result.errors.length > 1 ? 's' : '' }}
        ajoutée{{ result.errors.length > 1 ? 's' : '' }} à vos révisions —
        <RouterLink :to="{ name: 'words' }">réviser →</RouterLink>
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

      <CorrectionRetry
        v-if="result.errors.length"
        :errors="result.errors"
        source="scrivi"
        :max-errors="maxRetryErrors"
        @complete="onRetryComplete"
      />
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

.mode-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 1rem 0;
}

.mode-btn {
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  border: 1px solid rgba(176, 105, 46, 0.35);
  background: #fff;
  color: #6f4722;
  font: inherit;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
}

.mode-btn.active {
  background: #b0692e;
  border-color: #b0692e;
  color: #faf6f0;
}

.prompt-panel {
  margin: 0 0 1rem;
  padding: 0.8rem 1rem;
  border-radius: 12px;
  background: rgba(90, 96, 150, 0.06);
  border: 1px solid rgba(90, 96, 150, 0.25);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.prompt-situation {
  margin: 0;
  font-weight: 700;
  color: #2c2620;
}

.prompt-meta {
  margin: 0;
  font-size: 0.88rem;
  color: #6b6156;
}

.prompt-goal {
  margin: 0;
  font-size: 0.92rem;
  color: #4a4238;
}

.content-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.85rem;
  color: #6b6156;
}

.content-field select {
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  border: 1px solid rgba(107, 97, 86, 0.4);
  background: #fffaf3;
  font: inherit;
}

.reuse-words {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.reuse-word {
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  background: rgba(176, 105, 46, 0.12);
  border: 1px solid rgba(176, 105, 46, 0.4);
  color: #6f4722;
  font-weight: 700;
  font-size: 0.85rem;
}

.aids {
  margin: 0 0 1rem;
}

.aids-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.aid-btn {
  padding: 0.32rem 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(176, 105, 46, 0.35);
  background: #fff;
  color: #b0692e;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.aid-btn.used {
  background: rgba(176, 105, 46, 0.1);
}

.aids-content {
  margin-top: 0.6rem;
  padding: 0.7rem 0.9rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid #e4d9c6;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.aid-block {
  margin: 0;
  font-size: 0.9rem;
  color: #4a4238;
  line-height: 1.55;
}

.aid-list {
  padding-left: 1.2rem;
}

.aid-word,
.aid-starter {
  display: inline-block;
  margin: 0 0.35rem 0.3rem 0;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: rgba(107, 97, 86, 0.1);
  font-size: 0.85rem;
}

.esempio {
  font-style: italic;
}

.instruction-line {
  margin: 0;
  font-size: 0.92rem;
  color: #4a4238;
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

.draft-banner {
  margin: 0 0 1rem;
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  background: rgba(90, 96, 150, 0.08);
  border: 1px solid rgba(90, 96, 150, 0.25);
  font-size: 0.88rem;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.6rem;
}

.draft-saved {
  display: block;
  margin-top: 0.3rem;
  color: #6b6156;
  font-size: 0.78rem;
}

.hint {
  font-size: 0.9rem;
  color: #6b6156;
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

/* Réussite communicative (Sprint 1.1) : statut neutre, volontairement
   distinct du niveau CECR (badge) et des erreurs (rouge/vert) — ce n'est pas
   un score, juste un repère de compréhension mutuelle. */
.communicative-note {
  margin: 0.4rem 0 0.9rem;
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  background: rgba(107, 97, 86, 0.07);
  border: 1px solid rgba(107, 97, 86, 0.25);
  font-size: 0.92rem;
  color: #4a4238;
  line-height: 1.5;
}

.communicative-status {
  font-weight: 700;
  margin-right: 0.4rem;
}

.communicative-note.a_completer {
  background: rgba(176, 105, 46, 0.08);
  border-color: rgba(176, 105, 46, 0.3);
}

.level-note {
  margin: 0.3rem 0 0.8rem;
  padding: 0.5rem 0.8rem;
  border-radius: 8px;
  background: rgba(90, 96, 150, 0.08);
  color: #4a5086;
  font-size: 0.85rem;
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

.review-note {
  color: #6b6156;
  font-size: 0.88rem;
}

.review-note a {
  color: #b0692e;
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
