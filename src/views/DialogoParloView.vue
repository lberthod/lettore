<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import SceneLayout from '../components/SceneLayout.vue'
import TranslationOverlay from '../components/TranslationOverlay.vue'
import dialoghiData from '../data/dialoghi_it.json'
import { lookupDictionary, lookupProperNoun } from '../lib/dictionary.js'
import { parseItalianNumberWord } from '../lib/italianNumbers.js'

// Un mot comme « d'Italia » ou « dell'industria » est capturé comme UN SEUL
// token par la regex de découpage (apostrophe = caractère de mot) : sans ça,
// on chercherait la traduction de « d'italia » entier, qui n'existe jamais
// dans le dictionnaire. On tente donc, en repli, le mot après l'article élidé.
const ELISIONS = ["dell'", "nell'", "sull'", "dall'", "all'", "un'", "d'", "l'", "c'"]
function stripElision(word) {
  const w = word.toLowerCase()
  for (const prefix of ELISIONS) {
    if (w.startsWith(prefix) && w.length > prefix.length) return word.slice(prefix.length)
  }
  return null
}

// Contenu pré-généré en Parler-TTS (voix homme grave / femme grave) : chaque
// ligne du dialogue est un fichier public/audio/<dialogue.id>_<n>.mp3, généré
// par generate_dialoghi.py à partir de src/data/dialoghi_it.json. Certains
// fichiers peuvent ne pas encore exister (génération encore en cours) : le
// bouton reste cliquable, la lecture échoue silencieusement dans ce cas.

const tab = ref('quotidiano')
const levelFilter = ref('tutti')
const search = ref('')
// Aucun dialogue sélectionné → liste seule (mobile) / panneau vide (desktop).
// Sélectionné → panneau de détail à côté de la liste (desktop) ou à la place
// de la liste (mobile, navigation en drill-down façon Réglages, sans modal).
const activeDialogo = ref(null)

const quotidiano = computed(() => dialoghiData.quotidiano)
const storia = computed(() => dialoghiData.storia)
const activeDialoghi = computed(() => (tab.value === 'quotidiano' ? quotidiano.value : storia.value))

const availableLevels = computed(() => {
  const set = new Set(activeDialoghi.value.map((d) => d.level).filter(Boolean))
  return ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].filter((l) => set.has(l))
})

const filteredDialoghi = computed(() => {
  const q = search.value.trim().toLowerCase()
  return activeDialoghi.value.filter((d) => {
    if (levelFilter.value !== 'tutti' && d.level !== levelFilter.value) return false
    if (q && !d.title.toLowerCase().includes(q)) return false
    return true
  })
})

// Repartir sur « tutti » si le filtre de niveau n'existe pas dans l'onglet
// qu'on vient de sélectionner (ex. onglet storia après avoir choisi A1, qui
// n'existe que côté quotidiano).
watch(tab, () => {
  levelFilter.value = 'tutti'
  search.value = ''
})

// Suivi « écouté » : signal simple (dialogue lancé en entier au moins une
// fois), persisté en local — cohérent avec le reste de l'app (progress.js)
// mais namespace dédié, pas de lien avec les textes du lecteur classique.
const LISTENED_KEY = 'lettore.dialogoparlo.listened'
function loadListened() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LISTENED_KEY)) || [])
  } catch {
    return new Set()
  }
}
const listenedIds = ref(loadListened())
const celebrate = ref(false)
let celebrateTimer = null
function markListened(id) {
  if (listenedIds.value.has(id)) return
  const next = new Set(listenedIds.value)
  next.add(id)
  listenedIds.value = next
  localStorage.setItem(LISTENED_KEY, JSON.stringify([...next]))
  celebrate.value = true
  clearTimeout(celebrateTimer)
  celebrateTimer = setTimeout(() => (celebrate.value = false), 2200)
}

// Ligne actuellement lue (surbrillance façon karaoké pendant « Ascolta tutto »).
const playingIndex = ref(-1)

// Traduction de la phrase entière (pas juste un mot) : bascule un
// affichage ligne par ligne, indépendant du dictionnaire (texte français
// pré-généré, voir line.fr dans dialoghi_it.json).
const shownTranslations = ref(new Set())
function toggleLineTranslation(i) {
  const next = new Set(shownTranslations.value)
  if (next.has(i)) next.delete(i)
  else next.add(i)
  shownTranslations.value = next
}

function openDialogo(dialogo) {
  activeDialogo.value = dialogo
  overlay.value = null
  shownTranslations.value = new Set()
  resetPlayback()
}

function closeDialogo() {
  activeDialogo.value = null
  overlay.value = null
  resetPlayback()
}

function lineId(dialogo, index) {
  return `${dialogo.id}_${index + 1}`
}

// Découpe une réplique en mots cliquables (traduction au clic, dictionnaire
// général — pas de lexique par texte ici, contrairement au lecteur) et
// séparateurs (espaces, ponctuation) affichés tels quels.
const isWord = (token) => /^\p{L}/u.test(token)
function splitTokens(text) {
  return text.split(/(\p{L}[\p{L}'’-]*)/u).filter((t) => t.length)
}

const overlay = ref(null) // { x, y, original, translation, loading, error }

function closeOverlay() {
  overlay.value = null
}

// Cascade de recherche : dictionnaire général → mot après article élidé
// (« d'Italia » → « Italia ») → nom propre (villes, personnages, œuvres…)
// → nombre écrit en toutes lettres (« millequattrocentonovantadue » → 1492).
async function resolveTranslation(word) {
  const entry = await lookupDictionary(word)
  if (entry?.fr) return entry.fr

  const stripped = stripElision(word)
  if (stripped) {
    const strippedEntry = await lookupDictionary(stripped)
    if (strippedEntry?.fr) return strippedEntry.fr
  }

  const proper = await lookupProperNoun(stripped || word)
  if (proper?.fr) return proper.fr

  const number = parseItalianNumberWord(word)
  if (number !== null) return String(number)

  return null
}

async function onWordClick(word, event) {
  event.stopPropagation()
  const rect = event.target.getBoundingClientRect()
  overlay.value = {
    x: rect.left + rect.width / 2,
    y: rect.bottom + 8,
    original: word,
    translation: '',
    loading: true,
    error: '',
  }
  const translation = await resolveTranslation(word)
  if (overlay.value?.original !== word) return // une autre traduction a été demandée depuis
  overlay.value = {
    ...overlay.value,
    translation: translation || '',
    loading: false,
    error: translation ? '' : 'Pas de traduction trouvée',
  }
}

let currentAudio = null
// Incrémenté uniquement lors d'un vrai arrêt (changer de ligne, de dialogue,
// fermer le panneau) : la boucle playNext capture sa valeur et se compare à
// la valeur courante avant de continuer. La pause, elle, N'INCRÉMENTE PAS ce
// jeton — on veut juste suspendre l'Audio en cours (currentAudio.pause())
// et le reprendre exactement là où il s'est arrêté (currentAudio.play()),
// sans relancer la ligne depuis le début.
let playToken = 0
const isPlayingAll = ref(false)
const isPaused = ref(false)

function resetPlayback() {
  playToken++
  isPlayingAll.value = false
  isPaused.value = false
  playingIndex.value = -1
  if (currentAudio) currentAudio.pause()
}

function playLine(id, index = -1) {
  resetPlayback()
  playingIndex.value = index
  currentAudio = new Audio(`/audio/${id}.mp3`)
  currentAudio.addEventListener('ended', () => {
    if (playingIndex.value === index) playingIndex.value = -1
  })
  currentAudio.play().catch(() => {})
}

// Toujours repartir de la première ligne, qu'on soit en train de jouer,
// en pause ou à l'arrêt — contrairement à playAll() qui reprend où on en est.
function restartAll(dialogo) {
  resetPlayback()
  playAll(dialogo)
}

function playAll(dialogo) {
  // En cours de lecture → pause en place (l'audio garde sa position).
  if (isPlayingAll.value) {
    isPlayingAll.value = false
    isPaused.value = true
    if (currentAudio) currentAudio.pause()
    return
  }
  // En pause sur ce même dialogue → reprend au même endroit, sans relancer
  // la séquence (le jeton n'a pas changé, l'écouteur "ended" est toujours là).
  if (isPaused.value && currentAudio) {
    isPlayingAll.value = true
    isPaused.value = false
    currentAudio.play().catch(() => {})
    return
  }
  // Nouveau départ.
  playToken++
  const token = playToken
  isPlayingAll.value = true
  isPaused.value = false
  if (currentAudio) currentAudio.pause()
  const ids = dialogo.lines.map((_, i) => lineId(dialogo, i))
  let i = 0
  const playNext = () => {
    if (token !== playToken) return
    if (i >= ids.length) {
      playingIndex.value = -1
      isPlayingAll.value = false
      isPaused.value = false
      markListened(dialogo.id)
      return
    }
    playingIndex.value = i
    const audio = new Audio(`/audio/${ids[i]}.mp3`)
    currentAudio = audio
    i += 1
    audio.addEventListener('ended', playNext, { once: true })
    audio.play().catch(playNext)
  }
  playNext()
}

// Quitter la page (navigation, retour, démontage) doit couper l'audio en
// cours : sans ça une ligne ou « Ascolta tutto » continue de jouer alors
// qu'on est reparti ailleurs dans l'appli.
onBeforeUnmount(() => {
  resetPlayback()
})
</script>

<template>
  <SceneLayout
    title="Dialogo"
    accent="Parlo"
    tagline="Dialogues en italien à écouter — vie quotidienne et histoire, voix homme/femme"
    wide
  >
    <div class="tabs">
      <button
        type="button"
        class="tab"
        :class="{ active: tab === 'quotidiano' }"
        @click="tab = 'quotidiano'"
      >
        Vita quotidiana <span class="count">{{ quotidiano.length }}</span>
      </button>
      <button
        type="button"
        class="tab"
        :class="{ active: tab === 'storia' }"
        @click="tab = 'storia'"
      >
        Storia e cultura <span class="count">{{ storia.length }}</span>
      </button>
    </div>

    <div class="toolbar">
      <input v-model="search" type="text" class="search" placeholder="Cerca un dialogo…" autocomplete="off" />
      <div class="level-filters">
        <button
          type="button"
          class="level-chip"
          :class="{ active: levelFilter === 'tutti' }"
          @click="levelFilter = 'tutti'"
        >
          Tutti
        </button>
        <button
          v-for="l in availableLevels"
          :key="l"
          type="button"
          class="level-chip"
          :class="{ active: levelFilter === l }"
          @click="levelFilter = l"
        >
          {{ l }}
        </button>
      </div>
    </div>

    <div class="layout" :class="{ 'detail-open': activeDialogo }">
      <aside class="list-panel">
        <p v-if="!filteredDialoghi.length" class="empty-hint">Nessun dialogo corrisponde alla ricerca.</p>
        <ul class="dialoghi-list">
          <li v-for="dialogo in filteredDialoghi" :key="dialogo.id">
            <button
              type="button"
              class="card"
              :class="{ selected: activeDialogo?.id === dialogo.id }"
              @click="openDialogo(dialogo)"
            >
              <span class="card-status" :class="{ done: listenedIds.has(dialogo.id) }" aria-hidden="true">
                {{ listenedIds.has(dialogo.id) ? '✓' : '' }}
              </span>
              <span class="card-title">{{ dialogo.title }}</span>
              <span v-if="dialogo.level" class="level-badge">{{ dialogo.level }}</span>
              <span class="chevron" aria-hidden="true">▸</span>
            </button>
          </li>
        </ul>
      </aside>

      <section v-if="activeDialogo" class="detail-panel">
        <button type="button" class="back-link" @click="closeDialogo">← Torna alla lista</button>
        <div class="detail-header">
          <h2>{{ activeDialogo.title }}</h2>
          <span v-if="activeDialogo.level" class="level-badge">{{ activeDialogo.level }}</span>
        </div>
        <div class="play-controls">
          <button type="button" class="play-all" :class="{ playing: isPlayingAll }" @click="playAll(activeDialogo)">
            {{ isPlayingAll ? '⏸' : '▶️' }}
            {{ isPlayingAll ? 'Pausa' : isPaused ? 'Riprendi' : 'Ascolta tutto il dialogo' }}
          </button>
          <button
            v-if="isPlayingAll || isPaused"
            type="button"
            class="restart-all"
            aria-label="Ricomincia dall'inizio"
            title="Ricomincia dall'inizio"
            @click="restartAll(activeDialogo)"
          >
            ↺
          </button>
        </div>
        <ul class="lines">
          <li
            v-for="(line, i) in activeDialogo.lines"
            :key="i"
            class="line"
            :class="[line.speaker, { playing: playingIndex === i }]"
          >
            <span class="avatar" :class="line.speaker" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="8.5" r="3.5" fill="currentColor" />
                <path
                  d="M4.5 20c0-4.14 3.36-7.5 7.5-7.5s7.5 3.36 7.5 7.5"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  fill="none"
                />
              </svg>
            </span>
            <div class="bubble">
              <div class="bubble-text">
                <template v-for="(token, ti) in splitTokens(line.text)" :key="ti">
                  <span
                    v-if="isWord(token)"
                    class="word"
                    role="button"
                    tabindex="0"
                    @click="onWordClick(token, $event)"
                    >{{ token }}</span
                  ><template v-else>{{ token }}</template>
                </template>
                <button
                  v-if="line.fr"
                  type="button"
                  class="translate-line"
                  :class="{ active: shownTranslations.has(i) }"
                  aria-label="Traduire la phrase en français"
                  title="Traduire la phrase en français"
                  @click="toggleLineTranslation(i)"
                >
                  FR
                </button>
                <button
                  type="button"
                  class="play-line"
                  :class="{ playing: playingIndex === i }"
                  @click="playLine(lineId(activeDialogo, i), i)"
                  aria-label="Écouter"
                >
                  {{ playingIndex === i ? '🔊' : '▶️' }}
                </button>
              </div>
              <p v-if="line.fr && shownTranslations.has(i)" class="line-fr">{{ line.fr }}</p>
            </div>
          </li>
        </ul>
      </section>

      <section v-else class="detail-placeholder">
        <p>👈 Seleziona un dialogo dalla lista per iniziare.</p>
      </section>
    </div>

    <Transition name="pop">
      <div v-if="celebrate" class="celebrate-toast">🎉 Dialogo completato!</div>
    </Transition>

    <Teleport to="body">
      <TranslationOverlay v-if="overlay" v-bind="overlay" @close="closeOverlay" />
    </Teleport>
  </SceneLayout>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.tab {
  padding: 0.5rem 1rem;
  border: 1px solid #d9c9a8;
  border-radius: 999px;
  background: #fffaf0;
  cursor: pointer;
  font-size: 0.95rem;
  color: #5a4a30;
}

.tab.active {
  background: #2c2620;
  color: #fdf3e3;
  border-color: #2c2620;
}

.tab .count {
  opacity: 0.7;
  margin-left: 0.35rem;
  font-size: 0.85em;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 1.25rem;
}

.search {
  flex: 1;
  min-width: 200px;
  padding: 0.5rem 0.8rem;
  border: 1px solid #d8cfc2;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
  background: rgba(255, 255, 255, 0.85);
}

.search:focus {
  outline: none;
  border-color: #b0692e;
}

.level-filters {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.level-chip {
  padding: 0.35rem 0.7rem;
  border: 1px solid #e4d9c6;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  color: #8a8072;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.level-chip:hover {
  border-color: #b0692e;
  color: #b0692e;
}

.level-chip.active {
  background: #2c2620;
  border-color: #2c2620;
  color: #faf6f0;
}

.layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
  align-items: start;
}

@media (min-width: 900px) {
  .layout {
    grid-template-columns: minmax(300px, 380px) 1fr;
  }
}

.empty-hint {
  color: #8a8072;
  font-size: 0.9rem;
  padding: 1rem 0;
}

.dialoghi-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: calc(100vh - 14rem);
  overflow-y: auto;
}

@media (max-width: 899px) {
  .dialoghi-list {
    max-height: none;
    overflow-y: visible;
  }
  /* Navigation en drill-down façon Réglages : sur mobile, un dialogue
     sélectionné remplace la liste plutôt que de s'afficher à côté. */
  .layout.detail-open .list-panel {
    display: none;
  }
}

.card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid #e3d5b8;
  border-radius: 0.6rem;
  background: #fffdf8;
  cursor: pointer;
  text-align: left;
  font-size: 0.95rem;
  color: #2c2620;
}

.card:hover {
  border-color: #b0692e;
}

.card.selected {
  border-color: #2c2620;
  background: #f7efdf;
}

.card-status {
  flex-shrink: 0;
  width: 1.1rem;
  color: #7a9a6f;
  font-weight: 700;
  text-align: center;
}

.card-title {
  flex: 1;
  font-weight: 600;
}

.level-badge {
  flex-shrink: 0;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: #e9dcc0;
  color: #5a4a30;
}

.chevron {
  color: #8a7a5a;
}

.detail-panel {
  border: 1px solid #e3d5b8;
  border-radius: 0.6rem;
  background: #fffdf8;
  padding: 1.25rem;
}

@media (min-width: 900px) {
  .detail-panel {
    position: sticky;
    top: 1rem;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
  }
}

.detail-placeholder {
  display: none;
  border: 1px dashed #e3d5b8;
  border-radius: 0.6rem;
  padding: 2.5rem 1.25rem;
  text-align: center;
  color: #8a8072;
}

@media (min-width: 900px) {
  .detail-placeholder {
    display: block;
  }
}

.back-link {
  display: none;
  border: none;
  background: none;
  color: #b0692e;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0 0 0.75rem;
}

@media (max-width: 899px) {
  .back-link {
    display: inline-block;
  }
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.detail-header h2 {
  margin: 0;
  font-size: 1.2rem;
}

.play-controls {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}

.play-all {
  padding: 0.3rem 0.65rem;
  border: 1px solid #d9c9a8;
  border-radius: 999px;
  background: none;
  color: #6b5d47;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.play-all:hover {
  border-color: #b0692e;
  color: #b0692e;
}

.play-all.playing {
  border-color: #a34e4e;
  color: #a34e4e;
  background: #f7e9e9;
}

.restart-all {
  width: 1.9rem;
  height: 1.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d9c9a8;
  border-radius: 50%;
  background: none;
  color: #6b5d47;
  font-size: 0.95rem;
  cursor: pointer;
}

.restart-all:hover {
  border-color: #b0692e;
  color: #b0692e;
}

.lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* Bulles façon messagerie : uomo à gauche, donna à droite — repère rapide
   de qui parle, en restant compact (pas de ligne d'actions séparée : FR et
   ▶️ sont inline avec le texte). */
.line {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 88%;
}

.line.donna {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.avatar {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f0e4c8;
}

.avatar svg {
  width: 0.85rem;
  height: 0.85rem;
}

.avatar.uomo {
  background: #dfe6ee;
  color: #4a6b8a;
}

.avatar.donna {
  background: #f0dfe6;
  color: #a34e6f;
}

.bubble {
  position: relative;
  padding: 0.4rem 0.6rem;
  border-radius: 10px;
  background: #f2ead9;
}

.line.donna .bubble {
  background: #e8ecdf;
}

.line.playing .bubble {
  box-shadow: 0 0 0 2px #b0692e;
}

.bubble-text {
  font-size: 0.9rem;
  line-height: 1.4;
}

.translate-line {
  display: inline-block;
  flex-shrink: 0;
  border: none;
  background: rgba(0, 0, 0, 0.06);
  color: #8a7355;
  cursor: pointer;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
  padding: 0.2rem 0.32rem;
  border-radius: 3px;
  margin-left: 0.3rem;
  vertical-align: middle;
}

.translate-line:hover {
  color: #b0692e;
}

.translate-line.active {
  background: #2c2620;
  color: #fdf3e3;
}

.line-fr {
  margin: 0.3rem 0 0;
  padding: 0.25rem 0.5rem;
  font-size: 0.82rem;
  font-style: italic;
  color: #6b5d47;
  background: rgba(255, 255, 255, 0.6);
  border-left: 2px solid #d9c9a8;
  border-radius: 0 4px 4px 0;
}

.word {
  cursor: pointer;
  border-radius: 3px;
}

.word:hover,
.word:focus-visible {
  background: #d9c9a8;
}

.play-line {
  display: inline-block;
  flex-shrink: 0;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0 0.2rem;
  vertical-align: middle;
}

.celebrate-toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  background: #2c2620;
  color: #fdf3e3;
  padding: 0.7rem 1.3rem;
  border-radius: 999px;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  z-index: 200;
}

.pop-enter-active {
  animation: pop-in 0.3s ease-out;
}

.pop-leave-active {
  animation: pop-in 0.25s ease-in reverse;
}

@keyframes pop-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(12px) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}
</style>
