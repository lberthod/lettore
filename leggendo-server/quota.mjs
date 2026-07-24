// Logique des quotas de génération (pure, sans dépendance Firestore — voir
// TODO_SECURITE.md, point 4). Isolée de server.mjs pour être testable seule.
//
// Gratuit  : 3 générations « de bienvenue » (cumulées, tous les jours confondus),
//            puis 1 génération par jour une fois ce capital épuisé.
// Payant / enseignant : 10 générations par jour, 100 par mois.

export const FREE_STARTER_CREDITS = 3
export const FREE_DAILY_LIMIT = 1
export const PAID_DAILY_LIMIT = 10
export const PAID_MONTHLY_LIMIT = 100

export function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10) // YYYY-MM-DD
}

export function monthKey(now = new Date()) {
  return now.toISOString().slice(0, 7) // YYYY-MM
}

export function freshQuota(now = new Date()) {
  return { totalCount: 0, dailyCount: 0, dailyDate: todayKey(now), monthlyCount: 0, monthlyMonth: monthKey(now) }
}

// Remet à zéro les compteurs jour/mois si on a changé de période.
export function resetIfStale(q, now = new Date()) {
  if (q.dailyDate !== todayKey(now)) {
    q.dailyDate = todayKey(now)
    q.dailyCount = 0
  }
  if (q.monthlyMonth !== monthKey(now)) {
    q.monthlyMonth = monthKey(now)
    q.monthlyCount = 0
  }
  return q
}

export function isPaidUser(user) {
  return (
    user.role === 'premium' ||
    user.role === 'premium_plus' ||
    user.role === 'enseignant' ||
    user.premium
  )
}

// Renvoie un message d'erreur si le quota est épuisé, sinon null.
export function quotaError(user, q) {
  if (isPaidUser(user)) {
    if (q.monthlyCount >= PAID_MONTHLY_LIMIT) {
      return `Quota mensuel atteint (${PAID_MONTHLY_LIMIT} générations/mois).`
    }
    if (q.dailyCount >= PAID_DAILY_LIMIT) {
      return `Quota journalier atteint (${PAID_DAILY_LIMIT} générations/jour).`
    }
    return null
  }

  if (q.totalCount < FREE_STARTER_CREDITS) return null
  if (q.dailyCount < FREE_DAILY_LIMIT) return null
  return 'Quota gratuit atteint pour aujourd’hui (1 génération/jour), revenez demain ou passez en compte payant.'
}

export class QuotaExceededError extends Error {}
