<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { allVerbs, dictionaryEntryCount } from '../lib/dictionary.js'

const query = ref('')

// Chargés à la demande (voir lib/dictionary.js) : vides le temps du premier
// import(), remplis dès qu'il résout.
const verbs = ref([])
allVerbs().then((v) => (verbs.value = v))

const entryCount = ref(0)
dictionaryEntryCount().then((n) => (entryCount.value = n))

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return verbs.value
  return verbs.value.filter((v) => v.lemma.includes(q) || v.fr.toLowerCase().includes(q))
})

// Les exceptions à connaître par cœur : accès direct à leur conjugaison,
// avec les deux formes qui trahissent l'irrégularité (présent 1re pers. et
// participe passé). Tous ces lemmes existent dans le dictionnaire.
const irregularGroups = [
  {
    label: 'Les auxiliaires',
    verbs: [
      { lemma: 'essere', fr: 'être', forms: 'sono · stato' },
      { lemma: 'avere', fr: 'avoir', forms: 'ho · avuto' },
    ],
  },
  {
    label: 'Les modaux (servili)',
    verbs: [
      { lemma: 'potere', fr: 'pouvoir', forms: 'posso · potuto' },
      { lemma: 'dovere', fr: 'devoir', forms: 'devo · dovuto' },
      { lemma: 'volere', fr: 'vouloir', forms: 'voglio · voluto' },
      { lemma: 'sapere', fr: 'savoir', forms: 'so · saputo' },
    ],
  },
  {
    label: 'Mouvement et état',
    verbs: [
      { lemma: 'andare', fr: 'aller', forms: 'vado · andato' },
      { lemma: 'venire', fr: 'venir', forms: 'vengo · venuto' },
      { lemma: 'stare', fr: 'rester, être', forms: 'sto · stato' },
      { lemma: 'uscire', fr: 'sortir', forms: 'esco · uscito' },
      { lemma: 'salire', fr: 'monter', forms: 'salgo · salito' },
      { lemma: 'rimanere', fr: 'rester', forms: 'rimango · rimasto' },
    ],
  },
  {
    label: 'Autres incontournables',
    verbs: [
      { lemma: 'fare', fr: 'faire', forms: 'faccio · fatto' },
      { lemma: 'dire', fr: 'dire', forms: 'dico · detto' },
      { lemma: 'dare', fr: 'donner', forms: 'do · dato' },
      { lemma: 'bere', fr: 'boire', forms: 'bevo · bevuto' },
      { lemma: 'tenere', fr: 'tenir', forms: 'tengo · tenuto' },
      { lemma: 'scegliere', fr: 'choisir', forms: 'scelgo · scelto' },
      { lemma: 'mettere', fr: 'mettre', forms: 'metto · messo' },
      { lemma: 'prendere', fr: 'prendre', forms: 'prendo · preso' },
      { lemma: 'vedere', fr: 'voir', forms: 'vedo · visto' },
      { lemma: 'conoscere', fr: 'connaître', forms: 'conosco · conosciuto' },
      { lemma: 'vivere', fr: 'vivre', forms: 'vivo · vissuto' },
      { lemma: 'morire', fr: 'mourir', forms: 'muoio · morto' },
    ],
  },
]
</script>

<template>
  <SceneLayout title="Verbi " accent="italiani" tagline="Tous les verbes du dictionnaire" wide>
    <!-- Rappel pédagogique : comment fonctionnent les verbes italiens -->
    <section class="primer">
      <h2>Comprendre les verbes italiens</h2>
      <p>
        Tout verbe italien appartient à l'un des <strong>trois groupes</strong>, reconnaissables à
        la terminaison de l'infinitif :
      </p>
      <div class="groups">
        <div class="group">
          <h3>1<sup>er</sup> groupe : <em>-are</em></h3>
          <p>
            Le plus vaste et le plus régulier : <strong>parlare</strong> (parler),
            <strong>amare</strong> (aimer), <strong>mangiare</strong> (manger).
            Présent : <em>parlo, parli, parla, parliamo, parlate, parlano</em>.
          </p>
        </div>
        <div class="group">
          <h3>2<sup>e</sup> groupe : <em>-ere</em></h3>
          <p>
            Souvent irrégulier au passé simple et au participe :
            <strong>credere</strong> (croire), <strong>leggere</strong> (lire → <em>letto</em>),
            <strong>prendere</strong> (prendre → <em>preso</em>).
            Présent : <em>credo, credi, crede, crediamo, credete, credono</em>.
          </p>
        </div>
        <div class="group">
          <h3>3<sup>e</sup> groupe : <em>-ire</em></h3>
          <p>
            Deux modèles : <strong>dormire</strong> (<em>dormo, dormi…</em>) et les verbes en
            <em>-isc-</em> comme <strong>finire</strong>
            (<em>finisco, finisci, finisce, finiamo, finite, finiscono</em>).
          </p>
        </div>
      </div>
      <p>
        Les <strong>temps composés</strong> (passato prossimo…) se forment avec un auxiliaire :
        <strong>avere</strong> pour la plupart des verbes (<em>ho mangiato</em>),
        <strong>essere</strong> pour les verbes de mouvement, d'état et les réfléchis
        (<em>sono andato / andata</em> — le participe s'accorde alors avec le sujet).
      </p>
      <p>
        Attention enfin aux <strong>irréguliers très fréquents</strong> : ils ne suivent aucun des
        trois modèles et se retrouvent partout — les exceptions ci-dessous sont à connaître par
        cœur. Chaque carte ouvre la table de conjugaison complète du verbe.
      </p>
    </section>

    <!-- Accès direct aux exceptions : les irréguliers incontournables -->
    <section class="irregulars">
      <h2>Les exceptions : verbes irréguliers essentiels</h2>
      <div v-for="group in irregularGroups" :key="group.label" class="irr-group">
        <h3>{{ group.label }}</h3>
        <div class="irr-cards">
          <RouterLink
            v-for="v in group.verbs"
            :key="v.lemma"
            :to="{ name: 'conjugation', params: { verbo: v.lemma } }"
            class="irr-card"
            :title="`Conjugaison de ${v.lemma}`"
          >
            <span class="irr-lemma">{{ v.lemma }}</span>
            <span class="irr-fr">{{ v.fr }}</span>
            <span class="irr-forms">{{ v.forms }}</span>
          </RouterLink>
        </div>
      </div>
      <p class="more">
        Pour les articles, les pluriels, les prépositions et l'orthographe :
        <RouterLink :to="{ name: 'grammar' }">voir la page Grammatica</RouterLink>.
      </p>
    </section>

    <p class="hint">
      {{ verbs.length }} verbes définis pour l'instant (sur
      {{ entryCount }} mots au total), chacun avec sa table de conjugaison complète.
    </p>

    <div class="search">
      <input v-model="query" type="text" placeholder="Filtrer les verbes…" autocomplete="off" />
    </div>

    <p v-if="!filtered.length" class="hint">Aucun verbe ne correspond à « {{ query }} ».</p>

    <ul v-else class="verbs">
      <li v-for="v in filtered" :key="v.lemma" class="verb">
        <RouterLink :to="{ name: 'dictionary', params: { word: v.lemma } }" class="lemma">
          {{ v.lemma }}
        </RouterLink>
        <span class="fr">{{ v.fr }}</span>
        <RouterLink
          :to="{ name: 'conjugation', params: { verbo: v.lemma } }"
          class="btn-conj"
          title="Conjugaison"
        >
          →
        </RouterLink>
      </li>
    </ul>
  </SceneLayout>
</template>

<style scoped>
.primer {
  text-align: left;
  margin-bottom: 1.4rem;
  padding-bottom: 1.2rem;
  border-bottom: 1px solid #eee1ce;
}

.primer h2 {
  margin: 0 0 0.6rem;
  font-size: 1.25rem;
  color: #2c2620;
}

.primer p {
  margin: 0.5rem 0;
  font-size: 0.95rem;
  line-height: 1.65;
  color: #4a4238;
}

.primer em {
  color: #b0692e;
  font-style: italic;
}

.groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.8rem;
  margin: 0.8rem 0;
}

.group {
  padding: 0.7rem 0.9rem;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.55);
}

.group h3 {
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
  color: #2c2620;
}

.group p {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.55;
}

.more a {
  color: #b0692e;
  font-weight: 600;
}

/* --- Exceptions : cartes des irréguliers essentiels --- */

.irregulars {
  text-align: left;
  margin-bottom: 1.4rem;
  padding-bottom: 1.2rem;
  border-bottom: 1px solid #eee1ce;
}

.irregulars h2 {
  margin: 0 0 0.6rem;
  font-size: 1.25rem;
  color: #2c2620;
}

.irregulars .more {
  margin: 0.8rem 0 0;
  font-size: 0.95rem;
  line-height: 1.65;
  color: #4a4238;
}

.irr-group h3 {
  margin: 0.9rem 0 0.4rem;
  font-size: 0.85rem;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #6b6156;
}

.irr-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.5rem;
}

.irr-card {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.5rem 0.7rem;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.55);
  text-decoration: none;
  transition: border-color 0.12s, background 0.12s;
}

.irr-card:hover {
  border-color: #b0692e;
  background: rgba(255, 255, 255, 0.85);
}

.irr-lemma {
  font-weight: 700;
  font-size: 0.98rem;
  color: #b0692e;
}

.irr-fr {
  font-size: 0.82rem;
  color: #4a4238;
}

.irr-forms {
  font-size: 0.78rem;
  font-style: italic;
  color: #8a8072;
}

.hint {
  font-size: 0.9rem;
  line-height: 1.6;
  color: #6b6156;
  margin-top: 0.6rem;
}

.search {
  margin: 1.2rem 0;
}

.search input {
  width: 100%;
  padding: 0.7rem 1rem;
  border: 1px solid #d8cfc2;
  border-radius: 8px;
  font-size: 1rem;
  font-family: inherit;
  background: rgba(255, 255, 255, 0.85);
}

.search input:focus {
  outline: none;
  border-color: #b0692e;
}

.verbs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.verb {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid #eee1ce;
}

.lemma {
  font-weight: 600;
  font-size: 0.95rem;
  color: #2c2620;
  text-decoration: none;
  white-space: nowrap;
}

.lemma:hover {
  color: #b0692e;
}

.fr {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #8a8072;
  font-size: 0.85rem;
}

.btn-conj {
  color: #b0692e;
  text-decoration: none;
  font-weight: 700;
  opacity: 0.6;
}

.btn-conj:hover {
  opacity: 1;
}
</style>
