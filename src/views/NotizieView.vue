<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { currentUser } from '../lib/auth.js'
import { isLoggedIn, isPremiumPlus } from '../lib/access.js'
import { listNewsTexts } from '../lib/newsTexts.js'
import { networkErrorMessage } from '../lib/network.js'

const loading = ref(true)
const premiumPlus = ref(false)
const texts = ref([])
const loadError = ref('')

const formatDate = (ts) =>
  ts
    ? new Date(ts).toLocaleDateString('fr-CH', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

onMounted(async () => {
  premiumPlus.value = await isPremiumPlus()
  if (premiumPlus.value) {
    try {
      texts.value = await listNewsTexts()
    } catch (err) {
      loadError.value = networkErrorMessage(err) || ''
    }
  }
  loading.value = false
})
</script>

<template>
  <SceneLayout title="No" accent="tizie" tagline="Actualité italienne, générée pour vous" narrow>
    <p>
      Jusqu'à 3 nouveaux textes par jour, générés à partir de l'actualité
      italienne (ANSA) et adaptés à votre niveau — réservé à la formule
      <RouterLink :to="{ name: 'pricing' }">Premium IA</RouterLink>.
    </p>

    <div v-if="loading" class="hint">Chargement…</div>

    <div v-else-if="!isLoggedIn() || !currentUser" class="upsell">
      <p>Connectez-vous pour accéder aux Notizie.</p>
      <RouterLink class="btn-hero" :to="{ name: 'login', query: { redirect: '/notizie' } }">
        Se connecter
      </RouterLink>
    </div>

    <div v-else-if="!premiumPlus" class="upsell">
      <p>Les Notizie font partie de la formule Premium IA (14,90 €/mois) : 30 crédits de génération par mois, jusqu'à 3 textes d'actualité par jour, et une bibliothèque de classiques adaptés et gradués.</p>
      <RouterLink class="btn-hero" :to="{ name: 'pricing' }">Découvrir Premium IA</RouterLink>
    </div>

    <template v-else>
      <p v-if="loadError" class="job error">
        ⚠ {{ loadError }}
        <button type="button" class="link-btn" @click="loading = true; listNewsTexts().then(t => { texts = t; loading = false }).catch(() => { loading = false })">
          réessayer
        </button>
      </p>

      <ul v-if="texts.length" class="texts">
        <li v-for="t in texts" :key="t.id">
          <RouterLink class="text-title" :to="{ name: 'reader', params: { id: t.id } }">
            🗞 {{ t.title }}
          </RouterLink>
          <span class="text-meta">
            {{ t.level }} · {{ t.wordCount }} mots
            <template v-if="t.sourceTitle"> · d'après « {{ t.sourceTitle }} »</template>
            <template v-if="t.createdAt"> · {{ formatDate(t.createdAt) }}</template>
          </span>
        </li>
      </ul>
      <p v-else class="hint">
        Aucun texte d'actualité pour le moment — revenez un peu plus tard, le
        prochain arrive avec la prochaine génération automatique.
      </p>
    </template>
  </SceneLayout>
</template>

<style scoped>
.hint {
  margin-top: 1.2rem;
  color: #6b6156;
}

.upsell {
  margin-top: 1.4rem;
  padding: 1.1rem 1.3rem;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.6);
}

.upsell p {
  margin: 0 0 0.9rem;
}

.btn-hero {
  display: inline-block;
  padding: 0.6rem 1.3rem;
  border-radius: 999px;
  background: #b0692e;
  color: #faf6f0;
  font-weight: 700;
  text-decoration: none;
}

.job.error {
  padding: 0.9rem 1.1rem;
  border-radius: 12px;
  margin: 1.2rem 0;
  background: rgba(163, 58, 42, 0.08);
  border: 1px solid rgba(163, 58, 42, 0.3);
  color: #a33a2a;
  font-size: 0.95rem;
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

.texts {
  list-style: none;
  padding: 0;
  margin: 1.4rem 0 0;
}

.texts li {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.3rem 0.7rem;
  padding: 0.55rem 0;
  border-bottom: 1px dashed rgba(107, 97, 86, 0.25);
}

.text-title {
  color: #2c2620;
  font-weight: 700;
  text-decoration: none;
}

.text-title:hover {
  color: #b0692e;
}

.text-meta {
  color: #6b6156;
  font-size: 0.85rem;
  margin-left: auto;
}
</style>
