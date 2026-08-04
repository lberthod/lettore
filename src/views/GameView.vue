<script setup>
import { computed, shallowRef } from 'vue'
import SceneLayout from '../components/SceneLayout.vue'
import AbbinaGame from '../components/games/AbbinaGame.vue'
import ImpiccatoGame from '../components/games/ImpiccatoGame.vue'
import AnagrammaGame from '../components/games/AnagrammaGame.vue'
import VeroFalsoGame from '../components/games/VeroFalsoGame.vue'
import ScalaCecrGame from '../components/games/ScalaCecrGame.vue'
import ConiugaExpressGame from '../components/games/ConiugaExpressGame.vue'
import CheTempoGame from '../components/games/CheTempoGame.vue'
import TraduciLaFraseGame from '../components/games/TraduciLaFraseGame.vue'
import RimettiInOrdineGame from '../components/games/RimettiInOrdineGame.vue'
import IndovinaLivelloGame from '../components/games/IndovinaLivelloGame.vue'
import CheGenereGame from '../components/games/CheGenereGame.vue'
import VerbiIrregolariGame from '../components/games/VerbiIrregolariGame.vue'
import ParoleDelCuoreGame from '../components/games/ParoleDelCuoreGame.vue'
import RipassaErroriGame from '../components/games/RipassaErroriGame.vue'
import SfidaATempoGame from '../components/games/SfidaATempoGame.vue'

// Un jeu = une carte du menu + le composant chargé quand on la sélectionne.
// Regroupés ici plutôt qu'éparpillés : ce fichier est le seul point qui
// connaît la liste complète des 15 jeux.
const GAMES = [
  {
    key: 'abbina',
    title: 'Abbina le parole',
    description: 'Retrouvez les paires italien-français avant de vous tromper trop souvent.',
    icon: '🔗',
    component: AbbinaGame,
  },
  {
    key: 'impiccato',
    title: 'Impiccato',
    description: 'Devinez le mot italien lettre par lettre avant d’épuiser vos vies.',
    icon: '🎯',
    component: ImpiccatoGame,
  },
  {
    key: 'anagramma',
    title: 'Anagramma',
    description: 'Remettez les lettres dans l’ordre avant la fin du chrono.',
    icon: '🔤',
    component: AnagrammaGame,
  },
  {
    key: 'vero-falso',
    title: 'Vero o Falso',
    description: 'Vrai ou faux : la traduction proposée est-elle la bonne ?',
    icon: '⚡',
    component: VeroFalsoGame,
  },
  {
    key: 'scala-cecr',
    title: 'Scala CECR',
    description: 'Grimpez les niveaux A1 à C2 en enchaînant les bonnes réponses.',
    icon: '🏔️',
    component: ScalaCecrGame,
  },
  {
    key: 'coniuga-express',
    title: 'Coniuga Express',
    description: 'Conjuguez le verbe donné au temps et à la personne demandés.',
    icon: '✍️',
    component: ConiugaExpressGame,
  },
  {
    key: 'che-tempo',
    title: 'Che tempo è?',
    description: 'Reconnaissez le temps grammatical d’une forme conjuguée.',
    icon: '🕰️',
    component: CheTempoGame,
  },
  {
    key: 'traduci-frase',
    title: 'Traduci la frase',
    description: 'Retrouvez la bonne traduction française d’une phrase italienne authentique.',
    icon: '💬',
    component: TraduciLaFraseGame,
  },
  {
    key: 'rimetti-ordine',
    title: 'Rimetti in ordine',
    description: 'Remettez les mots d’une phrase italienne dans le bon ordre.',
    icon: '🧩',
    component: RimettiInOrdineGame,
  },
  {
    key: 'indovina-livello',
    title: 'Indovina il livello',
    description: 'Devinez le niveau CECR d’un extrait de texte authentique.',
    icon: '📊',
    component: IndovinaLivelloGame,
  },
  {
    key: 'che-genere',
    title: 'Che genere?',
    description: 'Devinez le genre littéraire d’un extrait de texte.',
    icon: '📚',
    component: CheGenereGame,
  },
  {
    key: 'verbi-irregolari',
    title: 'Verbi irregolari',
    description: 'Choisissez la bonne forme au présent des verbes irréguliers courants.',
    icon: '🌀',
    component: VerbiIrregolariGame,
  },
  {
    key: 'parole-del-cuore',
    title: 'Parole del cuore',
    description: 'Révisez vos propres mots favoris enregistrés en lisant.',
    icon: '💛',
    component: ParoleDelCuoreGame,
  },
  {
    key: 'ripassa-errori',
    title: 'Ripassa i tuoi errori',
    description: 'Rejouez vos erreurs de production écrite sous forme de jeu.',
    icon: '🩹',
    component: RipassaErroriGame,
  },
  {
    key: 'sfida-tempo',
    title: 'Sfida a tempo',
    description: 'Répondez au plus grand nombre de questions en 60 secondes.',
    icon: '⏱️',
    component: SfidaATempoGame,
  },
]

const activeKey = shallowRef(null)
const activeGame = computed(() => GAMES.find((g) => g.key === activeKey.value) || null)

function openGame(key) {
  activeKey.value = key
}

function backToMenu() {
  activeKey.value = null
}
</script>

<template>
  <SceneLayout
    title="Gio"
    accent="chi"
    tagline="Quinze jeux courts pour réviser le vocabulaire, la grammaire et les textes italiens autrement."
    wide
    :compact="!activeGame"
  >
    <template v-if="!activeGame">
      <div class="game-grid">
        <button
          v-for="game in GAMES"
          :key="game.key"
          type="button"
          class="game-card"
          @click="openGame(game.key)"
        >
          <span class="game-icon" aria-hidden="true">{{ game.icon }}</span>
          <span class="game-title">{{ game.title }}</span>
          <span class="game-description">{{ game.description }}</span>
        </button>
      </div>
    </template>

    <template v-else>
      <button type="button" class="back-link" @click="backToMenu">← Tutti i giochi</button>
      <h2 class="game-title-heading">{{ activeGame.title }}</h2>
      <component :is="activeGame.component" :key="activeGame.key" />
    </template>
  </SceneLayout>
</template>

<style scoped>
.game-title-heading {
  margin: 0 0 1rem;
}

.game-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.game-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.4rem;
  text-align: left;
  background: #fffaf3;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 14px;
  padding: 1.25rem;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
}

.game-card:hover,
.game-card:focus-visible {
  border-color: #b0692e;
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(44, 38, 32, 0.1);
  outline: none;
}

.game-icon {
  font-size: 1.8rem;
  line-height: 1;
}

.game-title {
  font-weight: 700;
  color: #2c2620;
  font-size: 1.05rem;
}

.game-description {
  color: #6b6156;
  font-size: 0.88rem;
  line-height: 1.4;
}

.back-link {
  display: inline-block;
  background: none;
  border: none;
  color: #b0692e;
  font-family: inherit;
  font-size: 0.92rem;
  cursor: pointer;
  padding: 0;
  margin-bottom: 0.8rem;
}

.back-link:hover {
  text-decoration: underline;
}

/* Mobile : les 15 jeux doivent tenir sur un seul écran sans défilement,
   pas une carte par ligne (15 écrans à faire défiler) — grille compacte
   icône + titre, description masquée (elle reste lisible dans l'écran du
   jeu lui-même une fois ouvert). */
@media (max-width: 480px) {
  .game-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .game-card {
    align-items: center;
    text-align: center;
    gap: 0.25rem;
    padding: 0.6rem 0.3rem;
    border-radius: 10px;
  }

  .game-icon {
    font-size: 1.5rem;
  }

  .game-title {
    font-size: 0.72rem;
    line-height: 1.15;
  }

  .game-description {
    display: none;
  }
}
</style>
