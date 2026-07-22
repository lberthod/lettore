<script setup>
import { RouterLink } from 'vue-router'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
</script>

<template>
  <section class="method-page">
    <!-- Héros : même scène que l'accueil (ciel, soleil, collines toscanes) -->
    <div class="hero-scene">
      <svg class="scene-svg" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
          <linearGradient id="msky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fdf3e3" />
            <stop offset="100%" stop-color="#f7e3c8" />
          </linearGradient>
          <linearGradient id="mhill1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#d9b98a" />
            <stop offset="100%" stop-color="#cfa873" />
          </linearGradient>
          <linearGradient id="mhill2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#c08b4d" />
            <stop offset="100%" stop-color="#b0692e" />
          </linearGradient>
          <linearGradient id="mhill3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#8a5a2b" />
            <stop offset="100%" stop-color="#6f4722" />
          </linearGradient>
        </defs>

        <rect width="1200" height="520" fill="url(#msky)" />
        <circle class="sun" cx="880" cy="150" r="52" fill="#e8a84c" opacity="0.9" />
        <circle class="sun-halo" cx="880" cy="150" r="80" fill="none" stroke="#e8a84c" stroke-width="1.5" opacity="0.35" />
        <path d="M0 400 Q 200 300 420 360 T 800 350 Q 1020 320 1200 380 L 1200 520 L 0 520 Z" fill="url(#mhill1)" />
        <path d="M0 450 Q 260 360 520 420 T 1200 430 L 1200 520 L 0 520 Z" fill="url(#mhill2)" />
        <path d="M0 500 Q 300 440 640 480 T 1200 490 L 1200 520 L 0 520 Z" fill="url(#mhill3)" />
        <g fill="#5a6e3f">
          <ellipse cx="220" cy="382" rx="9" ry="34" />
          <ellipse cx="244" cy="390" rx="7" ry="27" />
          <ellipse cx="960" cy="400" rx="8" ry="30" />
          <ellipse cx="982" cy="408" rx="6" ry="23" />
        </g>
      </svg>

      <!-- Barre de navigation commune -->
      <SiteHeader />

      <div class="hero-text">
        <p class="tagline">La méthodologie</p>
        <h1 class="title">On apprend l'italien <em>en lisant</em></h1>
      </div>
    </div>

    <!-- Contenu -->
    <article class="content">
      <p>
        <strong>Pas de listes de vocabulaire, pas d'exercices.</strong> Vous
        lisez des textes adaptés à votre niveau, et quand un mot vous échappe,
        sa traduction française apparaît d'un simple clic, sans quitter la
        phrase. Chaque clic transforme une exposition passive en
        <em>remarquage actif</em>, qui aide votre mémoire.
      </p>

      <h2>Trouvez votre zone idéale</h2>
      <p>
        Tout repose sur le bon niveau de difficulté. Si vous comprenez moins de
        90&nbsp;% des mots d'un texte, la lecture devient du déchiffrage et on
        se décourage. Au-delà de 98&nbsp;%, c'est agréable mais il n'y a
        presque rien de nouveau à apprendre. Entre les deux se trouve la zone
        idéale — ce que la recherche appelle <em>i+1</em>&nbsp;: vous comprenez
        l'histoire, et chaque page apporte quelques mots nouveaux. C'est là
        qu'on progresse. Nos textes sont gradués de A1 à C1 pour vous garder
        dans cette zone.
      </p>

      <h2>Les cinq principes</h2>

      <h3>📖 Lire beaucoup, à son niveau — <em>input compréhensible</em></h3>
      <p>
        On acquiert une langue en comprenant des messages, bien plus qu'en
        étudiant ses règles (Krashen). L'idéal&nbsp;: un texte compris à
        ~95&nbsp;%, assez riche pour contenir du nouveau. Nos textes sont
        gradués de A1 à C1 pour vous garder dans cette zone.
      </p>

      <h3>👆 Traduire au clic, sans casser le fil — <em>gloses &amp; remarquage</em></h3>
      <p>
        Chercher dans un dictionnaire interrompt la lecture. Les études
        montrent qu'on retient presque deux fois plus de mots quand la
        traduction est à portée de clic&nbsp;: le geste transforme une
        exposition passive en remarquage actif.
      </p>

      <h3>🔊 Lire en écoutant — <em>double trace</em></h3>
      <p>
        Lire en écoutant simultanément crée une double trace en mémoire —
        écrite et sonore. Précieux entre français et italien&nbsp;: les
        orthographes se ressemblent, les prononciations divergent.
      </p>

      <h3>🤝 L'avantage du francophone — <em>mots transparents</em></h3>
      <p>
        Français et italien partagent environ trois quarts de leur
        vocabulaire&nbsp;: <em lang="it">importante</em>,
        <em lang="it">nazione</em>, <em lang="it">difficile</em>… La vraie
        difficulté&nbsp;? Les faux amis (<em lang="it">salire</em> = monter,
        <em lang="it">cantina</em> = cave) — exactement là où nos traductions
        font la différence.
      </p>

      <h3>🔁 Répéter en contexte — <em>8 à 12 rencontres</em></h3>
      <p>
        Un mot doit être croisé 8 à 12 fois, dans des contextes variés, pour
        être retenu. D'où l'importance du volume&nbsp;: chaque texte recycle le
        vocabulaire fréquent, et chaque rencontre renforce la mémoire.
      </p>

      <h2>Questions fréquentes</h2>

      <h3>Peut-on vraiment apprendre l'italien juste en lisant&nbsp;?</h3>
      <p>
        La compréhension et le vocabulaire, oui — c'est confirmé par plusieurs
        méta-analyses. Pour parler, il faut aussi pratiquer l'oral&nbsp;: la
        lecture extensive est le complément idéal d'un cours ou d'un tandem.
      </p>

      <h3>Quel niveau faut-il pour commencer&nbsp;?</h3>
      <p>
        Aucun. Les textes A1 sont accessibles dès les premiers jours, et le
        français partage trois quarts de son vocabulaire avec l'italien. La
        traduction au clic fait le reste.
      </p>

      <h3>Combien de temps par jour&nbsp;?</h3>
      <p>
        10 à 20 minutes par jour suffisent&nbsp;: la régularité compte plus que
        la durée. C'est le volume cumulé de lecture qui fait la différence.
      </p>

      <h3>Pourquoi la traduction en français&nbsp;?</h3>
      <p>
        Pour les débutants et intermédiaires, la recherche montre que les
        traductions en langue maternelle sont plus efficaces que les
        définitions en langue cible.
      </p>

      <h2>📚 Une méthode validée par la recherche</h2>
      <p>
        Des décennies d'études soutiennent la lecture extensive&nbsp;: Krashen
        (1985) · Nakanishi, <em>TESOL Quarterly</em> (2015) · Jeon &amp; Day
        (2016) · Yanagisawa, Webb &amp; Uchihara, <em>SSLA</em> (2020) ·
        Nation, <em>Cambridge UP</em> (2013).
      </p>

      <div class="actions">
        <RouterLink class="btn-hero" :to="{ name: 'library' }">
          Essayer avec un vrai texte →
        </RouterLink>
        <RouterLink class="btn-ghost" :to="{ name: 'method' }">
          Voir la présentation interactive
        </RouterLink>
      </div>
    </article>

    <!-- Pied de page commun -->
    <SiteFooter />
  </section>
</template>

<style scoped>
.method-page {
  position: fixed;
  inset: 0;
  z-index: 50;
  overflow-y: auto;
  background: linear-gradient(180deg, #fdf3e3 0%, #f7e3c8 100%);
  color: #2c2620;
}

/* --- Héros --- */

.hero-scene {
  position: relative;
  height: clamp(300px, 46vh, 440px);
  overflow: hidden;
}

.scene-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.sun-halo {
  transform-origin: 880px 150px;
  animation: halo 6s ease-in-out infinite;
}

@keyframes halo {
  0%, 100% { transform: scale(1); opacity: 0.35; }
  50% { transform: scale(1.12); opacity: 0.15; }
}

.hero-text {
  position: relative;
  z-index: 2;
  max-width: 680px;
  margin: 0 auto;
  padding: clamp(1.2rem, 5vh, 3.2rem) 1.5rem 0;
  text-align: center;
}

.tagline {
  margin: 0 0 0.6rem;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: #8a5a2b;
}

.title {
  margin: 0;
  font-size: clamp(1.7rem, 4.5vw, 2.6rem);
  font-weight: 400;
  letter-spacing: 0.5px;
}

.title em {
  color: #b0692e;
}

/* --- Contenu --- */

.content {
  max-width: 680px;
  margin: 0 auto;
  padding: 2.2rem 1.5rem 3rem;
  line-height: 1.75;
}

.content h2 {
  margin: 2.4rem 0 0.7rem;
  font-size: 1.35rem;
  color: #8a5a2b;
}

.content h3 {
  margin: 1.6rem 0 0.4rem;
  font-size: 1.05rem;
}

.content p {
  margin: 0 0 1rem;
  color: rgba(44, 38, 32, 0.85);
}

.content a {
  color: #b0692e;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: 2.2rem;
}

.content a.btn-hero {
  padding: 0.75rem 1.7rem;
  border-radius: 999px;
  background: #b0692e;
  color: #faf6f0;
  font-size: 1rem;
  font-weight: 700;
  text-decoration: none;
  box-shadow: 0 6px 20px rgba(176, 105, 46, 0.3);
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
}

.btn-hero:hover {
  background: #9a5a26;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(176, 105, 46, 0.35);
}

.content a.btn-ghost {
  padding: 0.75rem 1.7rem;
  border: 1px solid rgba(138, 90, 43, 0.45);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.4);
  color: #6b6156;
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
  transition: border-color 0.15s, color 0.15s;
}

.btn-ghost:hover {
  border-color: #b0692e;
  color: #b0692e;
}

@media (prefers-reduced-motion: reduce) {
  .sun-halo {
    animation: none;
  }
}
</style>
