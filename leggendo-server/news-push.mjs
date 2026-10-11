// Notification « nouveau texte Notizie » — extraite de news-cron.mjs pour
// être testable avec un faux Firestore / faux messaging (aucun réseau).
//
// Garde-fous : au plus une fois toutes les 4 h et 6 fois par jour. Le
// compteur (`lastPushAt`, `pushCountToday`) n'est écrit QU'APRÈS l'envoi et
// seulement si au moins une notification a été acceptée par FCM : une panne
// FCM ne doit pas consommer le budget quotidien. Les jetons sont envoyés par
// lots de 500 maximum (limite de sendEachForMulticast, voir push.mjs). Le
// verrou fichier de news-cron.mjs interdit deux exécutions simultanées.

import { sendPushToUsers } from './push.mjs'

export const PUSH_INTERVAL_MS = 4 * 60 * 60 * 1000
export const MAX_PUSH_PER_DAY = 6

export async function notifyNewContentIfDue({ db, listUids, now = Date.now(), messaging }) {
  const today = new Date(now).toISOString().slice(0, 10)
  const stateRef = db.collection('newsState').doc('counter')

  const snap = await stateRef.get()
  const data = snap.exists ? snap.data() : {}
  if (data.lastPushAt && now - data.lastPushAt < PUSH_INTERVAL_MS) return { sent: 0, skipped: 'interval' }
  const countToday = data.pushDate === today ? data.pushCountToday || 0 : 0
  if (countToday >= MAX_PUSH_PER_DAY) return { sent: 0, skipped: 'daily-cap' }

  const uids = await listUids()
  if (!uids.length) return { sent: 0, skipped: 'no-recipient' }

  const { sent, failed } = await sendPushToUsers(
    db,
    uids,
    {
      title: 'Nouvelle actualité en italien',
      body: 'Un nouveau texte Notizie vient d’être publié — à lire dès maintenant.',
      data: { type: 'new_content' },
    },
    { messaging }
  )

  if (sent > 0) {
    await stateRef.set(
      { lastPushAt: now, pushDate: today, pushCountToday: countToday + 1 },
      { merge: true }
    )
  }
  return { sent, failed }
}
