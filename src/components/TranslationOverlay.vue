<script setup>
import { RouterLink } from 'vue-router'

defineProps({
  x: Number,
  y: Number,
  original: String,
  translation: String,
  loading: Boolean,
  error: String,
  isSentence: Boolean,
  canSpeak: Boolean,
  canFavorite: Boolean,
  isFavorite: Boolean,
})

defineEmits(['close', 'speak', 'favorite'])
</script>

<template>
  <div
    class="overlay"
    :class="{ sentence: isSentence }"
    :style="isSentence ? null : { left: x + 'px', top: y + 'px' }"
    @click.stop
  >
    <button class="close" title="Fermer" aria-label="Fermer" @click="$emit('close')">×</button>
    <div class="original">
      <button
        v-if="canSpeak"
        class="speak"
        title="Écouter en italien"
        aria-label="Écouter en italien"
        @click="$emit('speak')"
      >
        🔊
      </button>
      {{ original }}
    </div>
    <div v-if="loading" class="loading">Traduction…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="translation">
      {{ translation }}
      <button
        v-if="canFavorite"
        class="fav"
        :class="{ active: isFavorite }"
        :title="isFavorite ? 'Retirer de mes mots' : 'Ajouter à mes mots'"
        :aria-label="isFavorite ? 'Retirer de mes mots' : 'Ajouter à mes mots'"
        :aria-pressed="isFavorite"
        @click="$emit('favorite')"
      >
        {{ isFavorite ? '★' : '☆' }}
      </button>
      <RouterLink
        v-if="!isSentence && original"
        class="more"
        :to="{ name: 'dictionary', params: { word: original } }"
        title="En savoir plus (dictionnaire)"
        aria-label="En savoir plus (dictionnaire)"
      >
        ℹ︎
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  /* Le lecteur défile dans le layout scène : coordonnées de viewport */
  position: fixed;
  /* Au-dessus de NativeTabBar/NativeAccountButton (z-index: 500) : un mot
     traduit près du bas de l'écran ne doit jamais passer sous la barre. */
  z-index: 600;
  max-width: 320px;
  background: #2c2620;
  color: #faf6f0;
  border-radius: 10px;
  padding: 0.6rem 1.8rem 0.7rem 0.9rem;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
  font-size: 0.95rem;
  line-height: 1.4;
  transform: translateX(-50%);
  animation: pop 0.12s ease-out;
}

/* Les phrases sont larges : on les affiche toujours centrées à l'écran */
.overlay.sentence {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(560px, calc(100vw - 2rem));
  max-width: none;
  font-size: 1.05rem;
  padding: 1rem 2.2rem 1.1rem 1.2rem;
  animation: pop-center 0.12s ease-out;
}

@keyframes pop {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

@keyframes pop-center {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) translateY(4px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) translateY(0);
  }
}

.original {
  font-style: italic;
  opacity: 0.65;
  font-size: 0.82rem;
  margin-bottom: 0.25rem;
}

.translation {
  font-weight: 600;
}

.loading {
  opacity: 0.7;
}

.error {
  color: #ffb3a7;
}

.close {
  position: absolute;
  top: 0.25rem;
  right: 0.4rem;
  background: none;
  border: none;
  color: inherit;
  opacity: 0.6;
  font-size: 1rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close:hover {
  opacity: 1;
}

.speak {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0;
  margin-right: 0.2rem;
  opacity: 0.8;
}

.speak:hover {
  opacity: 1;
}

.fav {
  background: none;
  border: none;
  color: #f0c869;
  cursor: pointer;
  font-size: 1rem;
  padding: 0 0.15rem;
  margin-left: 0.25rem;
  opacity: 0.85;
  vertical-align: -1px;
}

.fav:hover,
.fav.active {
  opacity: 1;
}

.more {
  color: inherit;
  text-decoration: none;
  font-size: 0.9rem;
  padding: 0 0.15rem;
  margin-left: 0.25rem;
  opacity: 0.7;
  vertical-align: -1px;
}

.more:hover {
  opacity: 1;
}
</style>
