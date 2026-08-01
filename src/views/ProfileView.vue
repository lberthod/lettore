<script setup>
import { ref, computed } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import {
  currentUser,
  logout,
  errorMessage,
  sendVerificationEmail,
  refreshEmailVerified,
} from '../lib/auth.js'
import {
  authProvider,
  reauthenticateWithPassword,
  reauthenticateWithGoogle,
  reauthenticateWithApple,
  deleteAccount,
} from '../lib/account.js'
import { progress, dueFavorites, dueErrorCards, measuredLevel } from '../progress.js'
import { weekSummary, daysAgoLabel } from '../lib/percorso.js'
import { confidenceLevel, skillTrend } from '../lib/metrics.js'

const router = useRouter()
const error = ref('')

// --- Dashboard de progression ---
// dueFavorites/dueErrorCards dépendent de Date.now() : recalculés via progress
// pour rester réactifs aux révisions faites pendant la session.
const dueCount = computed(() => dueFavorites().length + dueErrorCards().length)

// Compteurs des 7 derniers jours (journal d'activité, src/lib/percorso.js).
const week = computed(() => weekSummary(progress))

// Une carte par compétence : compteur d'activités, dernière pratique et la
// statistique propre à la compétence. Tout vient des agrégats progress.skills
// — un profil neuf affiche simplement « Pas encore pratiqué ».
const pct = (v) => `${Math.round(v * 100)} %`

// Prochaine action utile par compétence (§10.3) : une suggestion simple et
// toujours disponible, indépendante de la mesure elle-même.
const NEXT_ACTION = {
  lettura: { label: 'Lire un texte', to: { name: 'library' } },
  ascolto: { label: 'Écouter un texte', to: { name: 'library' } },
  vocabolario: { label: 'Réviser', to: { name: 'words' } },
  scrittura: { label: 'Écrire quelques phrases', to: { name: 'write' } },
  dialogo: { label: 'Faire un dialogue', to: { name: 'dialogue' } },
  pronuncia: { label: "S'entraîner à l'oral", to: { name: 'library' } },
}

const TREND_LABEL = { up: 'en hausse', down: 'en baisse', stable: 'stable', null: null }
const CONFIDENCE_LABEL = { faible: 'confiance faible', moyen: 'confiance moyenne', suffisant: 'confiance suffisante' }

const skillRows = computed(() => {
  const s = progress.skills
  const lvl = measuredLevel()
  // Nombre de productions réellement derrière l'estimation de niveau (fenêtre
  // des 5 dernières) : annoncé honnêtement, pas de fausse précision.
  const levelSample = Math.min((s.scrittura?.levels || []).length, 5)
  const rows = [
    {
      id: 'lettura',
      label: 'Lecture',
      icon: '📖',
      stat: s.lettura?.avgScore != null ? `Score moyen aux quiz : ${pct(s.lettura.avgScore)}` : null,
    },
    {
      id: 'ascolto',
      label: 'Écoute',
      icon: '👂',
      stat: s.ascolto?.count ? `${s.ascolto.count} écoute${s.ascolto.count > 1 ? 's' : ''} en mode ascolto` : null,
    },
    {
      id: 'vocabolario',
      label: 'Vocabulaire',
      icon: '🗂️',
      stat: `${progress.knownWords.length} mot${progress.knownWords.length > 1 ? 's' : ''} connus · ${dueCount.value} à réviser`,
    },
    {
      id: 'scrittura',
      label: 'Écriture',
      icon: '✍️',
      stat: lvl.scrittura
        ? `Niveau ${lvl.scrittura} — estimation sur tes ${levelSample} dernières productions`
        : null,
    },
    {
      id: 'dialogo',
      label: 'Dialogue',
      icon: '💬',
      stat: s.dialogo?.sessions
        ? `${s.dialogo.sessions} session${s.dialogo.sessions > 1 ? 's' : ''} de dialogue`
        : null,
    },
    {
      id: 'pronuncia',
      label: 'Prononciation',
      icon: '🗣️',
      stat: s.pronuncia?.avgScore != null ? `Score moyen : ${pct(s.pronuncia.avgScore)}` : null,
    },
  ]
  return rows.map((r) => {
    const count = s[r.id]?.count || 0
    const trend = skillTrend(progress, r.id)
    return {
      ...r,
      count,
      last: s[r.id]?.lastTs ? daysAgoLabel(s[r.id].lastTs) : null,
      week: week.value[r.id] || 0,
      // §10.3 : indicateur de confiance fondé sur la taille d'échantillon —
      // jamais une affirmation de niveau à partir de quelques productions.
      confidence: confidenceLevel(count),
      trendDirection: trend.direction,
      nextAction: NEXT_ACTION[r.id],
    }
  })
})

async function doLogout() {
  error.value = ''
  try {
    await logout()
    router.push({ name: 'home' })
  } catch (e) {
    error.value = errorMessage(e)
  }
}

// --- Vérification de l'adresse e-mail ---
// Le compte est utilisable dès l'inscription pour la lecture ; seule la
// génération d'essai IA attend une adresse confirmée (voir
// leggendo-server/quota.mjs). Comptes Google : déjà vérifiés par Google.
const verifyBusy = ref(false)
const verifyInfo = ref('')
const verifyError = ref('')

async function resendVerification() {
  verifyBusy.value = true
  verifyInfo.value = verifyError.value = ''
  try {
    await sendVerificationEmail()
    verifyInfo.value = 'Lien renvoyé — vérifiez votre boîte de réception (et les indésirables).'
  } catch (e) {
    verifyError.value = errorMessage(e)
  } finally {
    verifyBusy.value = false
  }
}

async function checkVerification() {
  verifyBusy.value = true
  verifyInfo.value = verifyError.value = ''
  try {
    if (await refreshEmailVerified()) {
      verifyInfo.value = 'Adresse confirmée, merci !'
    } else {
      verifyError.value = 'Adresse pas encore confirmée : ouvrez le lien reçu par e-mail, puis réessayez.'
    }
  } catch (e) {
    verifyError.value = errorMessage(e)
  } finally {
    verifyBusy.value = false
  }
}

// --- Suppression de compte ---
const provider = computed(() => authProvider(currentUser.value))
const confirmingDelete = ref(false)
const deletePassword = ref('')
const deleteError = ref('')
const deleting = ref(false)

function startDelete() {
  confirmingDelete.value = true
  deleteError.value = ''
  deletePassword.value = ''
}

function cancelDelete() {
  confirmingDelete.value = false
  deleteError.value = ''
}

async function confirmDelete() {
  deleteError.value = ''
  const needsPassword = provider.value !== 'google.com' && provider.value !== 'apple.com'
  if (needsPassword && !deletePassword.value) {
    deleteError.value = 'Mot de passe requis.'
    return
  }
  deleting.value = true
  try {
    if (provider.value === 'google.com') {
      await reauthenticateWithGoogle()
    } else if (provider.value === 'apple.com') {
      await reauthenticateWithApple()
    } else {
      await reauthenticateWithPassword(deletePassword.value)
    }
    await deleteAccount()
    await logout()
    router.push({ name: 'home' })
  } catch (e) {
    deleteError.value = errorMessage(e)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <SceneLayout title="Il mio prof" accent="ilo" tagline="Mon profil" narrow>
    <template v-if="currentUser">
      <p>
        <strong>{{ currentUser.displayName || 'Sans nom' }}</strong><br />
        {{ currentUser.email }}
      </p>
      <p class="hint">
        Membre depuis le
        {{ new Date(currentUser.metadata.creationTime).toLocaleDateString('fr-CH') }}
      </p>

      <div v-if="!currentUser.emailVerified" class="verify-box">
        <p>
          <strong>Adresse e-mail non confirmée.</strong> Ouvrez le lien envoyé à
          l'inscription pour débloquer votre génération d'essai
          (<RouterLink :to="{ name: 'create-text' }">Créer son texte</RouterLink>).
        </p>
        <p class="verify-actions">
          <button type="button" class="link-btn" :disabled="verifyBusy" @click="resendVerification">
            Renvoyer le lien
          </button>
          <button type="button" class="link-btn" :disabled="verifyBusy" @click="checkVerification">
            J'ai confirmé mon adresse
          </button>
        </p>
        <p v-if="verifyInfo" class="verify-info">{{ verifyInfo }}</p>
        <p v-if="verifyError" class="error">{{ verifyError }}</p>
      </div>

      <h2>Ma progression</h2>
      <div class="dashboard">
        <div class="stat stat-streak">
          <span class="stat-value">🔥 {{ progress.streak.current }}</span>
          <span class="stat-label">
            {{ progress.streak.current > 1 ? "jours d'affilée" : "jour d'affilée" }}
          </span>
          <span class="stat-sub">Record : {{ progress.streak.longest }}</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ progress.readTexts.length }}</span>
          <span class="stat-label">
            {{ progress.readTexts.length > 1 ? 'textes lus' : 'texte lu' }}
          </span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ progress.knownWords.length }}</span>
          <span class="stat-label">
            {{ progress.knownWords.length > 1 ? 'mots connus' : 'mot connu' }}
          </span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ dueCount }}</span>
          <span class="stat-label">
            {{ dueCount > 1 ? 'éléments à réviser' : 'élément à réviser' }}
          </span>
          <RouterLink v-if="dueCount" class="stat-link" :to="{ name: 'words' }">
            Réviser →
          </RouterLink>
        </div>
      </div>

      <h3 class="skills-title">Par compétence</h3>
      <p class="skills-hint">
        {{ week.total > 0
          ? `${week.total} activité${week.total > 1 ? 's' : ''} ces 7 derniers jours.`
          : 'Aucune activité ces 7 derniers jours — chaque exercice compté apparaîtra ici.' }}
      </p>
      <div class="skills">
        <div v-for="row in skillRows" :key="row.id" class="skill" :class="{ empty: !row.count }">
          <div class="skill-head">
            <span class="skill-icon" aria-hidden="true">{{ row.icon }}</span>
            <span class="skill-name">{{ row.label }}</span>
            <span v-if="row.week" class="skill-week">{{ row.week }}× cette semaine</span>
          </div>
          <template v-if="row.count">
            <p class="skill-meta">
              {{ row.count }} activité{{ row.count > 1 ? 's' : '' }} · dernière : {{ row.last }}
            </p>
            <p v-if="row.stat" class="skill-stat">{{ row.stat }}</p>
            <p class="skill-confidence">
              {{ CONFIDENCE_LABEL[row.confidence] }}
              <span v-if="TREND_LABEL[row.trendDirection]" class="skill-trend">
                · tendance sur 4 semaines : {{ TREND_LABEL[row.trendDirection] }}
              </span>
            </p>
          </template>
          <p v-else class="skill-meta">Pas encore pratiqué</p>
          <RouterLink v-if="row.nextAction" class="skill-next" :to="row.nextAction.to">
            {{ row.nextAction.label }} →
          </RouterLink>
        </div>
      </div>

      <h2>Abonnement</h2>
      <p>
        Formule actuelle : <strong>Gratuit</strong><br />
        <RouterLink :to="{ name: 'pricing' }">Passer à Premium →</RouterLink>
      </p>

      <p v-if="error" class="error">{{ error }}</p>
      <button class="btn-secondary" @click="doLogout">Se déconnecter</button>

      <div class="danger-zone">
        <h2>Zone dangereuse</h2>
        <button v-if="!confirmingDelete" class="btn-danger" @click="startDelete">
          Supprimer mon compte
        </button>
        <template v-else>
          <p class="warning">
            Action définitive : vos textes créés, votre progression et votre
            compte seront supprimés. Si vous avez un abonnement actif,
            résiliez-le d'abord auprès de nous — la suppression du compte ne
            résilie pas automatiquement un paiement en cours.
          </p>
          <form class="form" @submit.prevent="confirmDelete">
            <label v-if="provider !== 'google.com'">
              Confirmez votre mot de passe
              <input
                v-model="deletePassword"
                type="password"
                autocomplete="current-password"
              />
            </label>
            <p v-if="deleteError" class="error">{{ deleteError }}</p>
            <div class="delete-actions">
              <button class="btn-danger" type="submit" :disabled="deleting">
                {{ deleting ? 'Suppression…' : 'Supprimer définitivement' }}
              </button>
              <button
                class="btn-secondary"
                type="button"
                :disabled="deleting"
                @click="cancelDelete"
              >
                Annuler
              </button>
            </div>
          </form>
        </template>
      </div>
    </template>

    <p v-else class="not-logged">
      Vous n'êtes pas connecté.
      <RouterLink :to="{ name: 'login' }">Se connecter</RouterLink>
    </p>
  </SceneLayout>
</template>

<style scoped>
.not-logged {
  margin: 0;
}

.verify-box {
  margin: 1.2rem 0;
  padding: 0.7rem 0.9rem;
  border: 1px solid rgba(176, 105, 46, 0.35);
  border-radius: 10px;
  background: rgba(176, 105, 46, 0.08);
  font-size: 0.9rem;
}

.verify-box p {
  margin: 0;
}

.verify-box .verify-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 0.5rem;
}

.verify-box .verify-info {
  margin-top: 0.5rem;
  color: #3d7a3d;
}

.verify-box .error {
  margin-top: 0.5rem;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: #b0692e;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
}

.link-btn[disabled] {
  opacity: 0.5;
  cursor: default;
}

/* --- Dashboard de progression --- */
.dashboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 0.7rem;
  margin: 0.9rem 0 1.6rem;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.8rem 0.9rem;
  border: 1px solid #e4d9c6;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.75);
}

.stat-value {
  font-size: 1.45rem;
  font-weight: 700;
  color: #6f4722;
}

.stat-streak .stat-value {
  color: #b0692e;
}

.stat-label {
  font-size: 0.82rem;
  color: #6b6156;
}

.stat-sub {
  font-size: 0.75rem;
  color: #8a5a2b;
  opacity: 0.85;
}

.stat-link {
  font-size: 0.8rem;
  color: #b0692e;
}

/* --- Dashboard par compétence --- */
.skills-title {
  margin: 0 0 0.15rem;
  font-size: 0.98rem;
  color: #6f4722;
}

.skills-hint {
  margin: 0 0 0.7rem;
  font-size: 0.82rem;
  color: #6b6156;
}

.skills {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.7rem;
  margin: 0 0 1.6rem;
}

.skill {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid #e4d9c6;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.75);
}

.skill.empty {
  opacity: 0.65;
}

.skill-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.skill-icon {
  font-size: 1rem;
}

.skill-name {
  font-weight: 700;
  color: #6f4722;
  font-size: 0.92rem;
}

.skill-week {
  margin-left: auto;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: rgba(176, 105, 46, 0.12);
  color: #8a5a2b;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

.skill-meta {
  margin: 0;
  font-size: 0.8rem;
  color: #6b6156;
}

.skill-stat {
  margin: 0;
  font-size: 0.82rem;
  color: #b0692e;
  font-weight: 600;
}

.skill-confidence {
  margin: 0;
  font-size: 0.72rem;
  color: rgba(44, 38, 32, 0.55);
}

.skill-trend {
  color: rgba(44, 38, 32, 0.55);
}

.skill-next {
  margin-top: 0.2rem;
  font-size: 0.78rem;
  color: #b0692e;
  align-self: flex-start;
}

.danger-zone {
  margin-top: 2.2rem;
  padding-top: 1.2rem;
  border-top: 1px solid #e3d9ca;
}

.danger-zone h2 {
  margin: 0 0 0.7rem;
}

.warning {
  margin: 0 0 0.9rem;
  font-size: 0.9rem;
  color: #6b6156;
}

.btn-danger {
  display: inline-block;
  padding: 0.6rem 1.2rem;
  border: 1px solid #a34430;
  border-radius: 8px;
  background: #fff;
  color: #a34430;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.btn-danger:hover:not(:disabled) {
  background: #a34430;
  color: #fff;
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.delete-actions {
  display: flex;
  gap: 0.6rem;
}
</style>
