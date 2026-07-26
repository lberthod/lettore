<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { listUsers, setUserRole } from '../lib/admin.js'

const users = ref([])
const loading = ref(true)
const error = ref('')
const updating = ref({}) // uid -> true pendant le changement de rôle

const ROLE_LABELS = {
  gratuit: 'Invité / gratuit',
  premium: 'Payant (Premium)',
  premium_plus: 'Premium IA',
  enseignant: 'Enseignant',
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    users.value = await listUsers()
  } catch (err) {
    console.error('adminListUsers a échoué :', err)
    error.value =
      err?.code === 'functions/permission-denied'
        ? "Accès réservé à l'administrateur."
        : `Impossible de charger la liste des comptes${err?.code ? ` (${err.code})` : ''}.`
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

async function changeRole(user, role) {
  if (role === user.role) return
  const previous = user.role
  updating.value = { ...updating.value, [user.uid]: true }
  user.role = role // optimiste
  try {
    await setUserRole(user.uid, role)
  } catch {
    user.role = previous
    error.value = `Le rôle de ${user.email} n'a pas pu être changé.`
  } finally {
    updating.value = { ...updating.value, [user.uid]: false }
  }
}

const stats = computed(() => {
  const byRole = { gratuit: 0, premium: 0, premium_plus: 0, enseignant: 0 }
  let textsTotal = 0
  for (const u of users.value) {
    byRole[u.role] = (byRole[u.role] || 0) + 1
    textsTotal += u.textsCreated || 0
  }
  return { total: users.value.length, byRole, textsTotal }
})

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-CH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—'
</script>

<template>
  <SceneLayout title="Admin" accent="istration" tagline="Tableau de bord" wide>
    <nav class="tabs">
      <RouterLink :to="{ name: 'admin' }" class="tab active">Comptes</RouterLink>
      <RouterLink :to="{ name: 'admin-words' }" class="tab" exact-active-class="active">Mots</RouterLink>
      <RouterLink :to="{ name: 'admin-texts' }" class="tab" exact-active-class="active">Textes</RouterLink>
      <RouterLink :to="{ name: 'admin-dictionary' }" class="tab" exact-active-class="active">Dizionario</RouterLink>
    </nav>

    <p v-if="error" class="notice error">⚠ {{ error }}</p>

    <template v-if="!loading && !error">
      <div class="stats">
        <div class="stat">
          <span class="stat-value">{{ stats.total }}</span>
          <span class="stat-label">Comptes</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ stats.byRole.gratuit }}</span>
          <span class="stat-label">Invité / gratuit</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ stats.byRole.premium }}</span>
          <span class="stat-label">Payant</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ stats.byRole.premium_plus }}</span>
          <span class="stat-label">Premium IA</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ stats.byRole.enseignant }}</span>
          <span class="stat-label">Enseignant</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ stats.textsTotal }}</span>
          <span class="stat-label">Textes créés</span>
        </div>
      </div>

      <table class="users">
        <thead>
          <tr>
            <th>Compte</th>
            <th>Inscrit le</th>
            <th>Dernière connexion</th>
            <th>Textes créés</th>
            <th>Rôle</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.uid">
            <td>
              <strong>{{ u.displayName || '—' }}</strong>
              <span class="email">{{ u.email }}</span>
            </td>
            <td>{{ formatDate(u.createdAt) }}</td>
            <td>{{ formatDate(u.lastSignInAt) }}</td>
            <td>{{ u.textsCreated }}</td>
            <td>
              <select
                :value="u.role"
                :disabled="updating[u.uid]"
                @change="changeRole(u, $event.target.value)"
              >
                <option v-for="(label, role) in ROLE_LABELS" :key="role" :value="role">
                  {{ label }}
                </option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <p v-else-if="loading" class="hint">Chargement des comptes…</p>
  </SceneLayout>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 0.6rem;
  margin: 0 0 1.4rem;
}

.tab {
  padding: 0.4rem 0.9rem;
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #6b6156;
  text-decoration: none;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}

.tab:hover {
  border-color: #b0692e;
}

.tab.active {
  background: #b0692e;
  border-color: #b0692e;
  color: #faf6f0;
}

.notice {
  margin: 0 0 1.2rem;
  padding: 0.7rem 1rem;
  border-radius: 10px;
  font-size: 0.9rem;
}

.notice.error {
  border: 1px solid rgba(163, 58, 42, 0.3);
  background: rgba(163, 58, 42, 0.08);
  color: #a33a2a;
}

.hint {
  color: #6b6156;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.8rem;
  margin: 0 0 1.6rem;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.9rem 0.6rem;
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.6);
}

.stat-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: #b0692e;
}

.stat-label {
  margin-top: 0.2rem;
  font-size: 0.78rem;
  color: #6b6156;
  text-align: center;
}

.users {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.users th {
  text-align: left;
  padding: 0.5rem 0.7rem;
  border-bottom: 2px solid rgba(176, 105, 46, 0.3);
  color: #6b6156;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.users td {
  padding: 0.6rem 0.7rem;
  border-bottom: 1px dashed rgba(107, 97, 86, 0.2);
  vertical-align: middle;
}

.users td strong {
  display: block;
}

.email {
  display: block;
  font-size: 0.8rem;
  color: #6b6156;
}

.users select {
  padding: 0.35rem 0.5rem;
  border: 1px solid rgba(138, 90, 43, 0.35);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.8);
  font-family: inherit;
  font-size: 0.85rem;
  color: #2c2620;
}
</style>
