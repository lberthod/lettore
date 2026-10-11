// Rappel de série quotidienne (SEC-7). Bornée : requête filtrée sur la date
// de dernière activité (pas de lecture complète de `users`), pagination par
// identifiant, envois par lots de STREAK_CONCURRENCY.
//
// Fuseau : `lastActiveDate` est une date calendaire écrite par le client ;
// on compare à la date « hier » dans STREAK_TIME_ZONE (Europe/Zurich, le
// fuseau de la planification), pas en UTC — sinon, entre minuit local et
// 01h/02h UTC, la tâche prendrait la mauvaise journée. Une série n'est « à
// risque » que si la dernière activité date d'HIER : plus ancienne, elle est
// déjà perdue (inutile de relancer) ; aujourd'hui, elle est sauve.

export const STREAK_TIME_ZONE = 'Europe/Zurich'
export const STREAK_PAGE_SIZE = 200
export const STREAK_CONCURRENCY = 25

// 'YYYY-MM-DD' de la date locale dans le fuseau donné, décalée de `offsetDays`.
export function localDateKey(now = new Date(), offsetDays = 0, timeZone = STREAK_TIME_ZONE) {
  const d = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function reminderMessage(current) {
  return {
    title: 'Ta série t’attend',
    body: `${current} jour${current > 1 ? 's' : ''} de suite — lis un texte aujourd'hui pour ne pas la perdre.`,
    data: { type: 'streak_reminder' },
  }
}

export async function sendStreakReminders({
  db,
  sendPush,
  now = new Date(),
  pageSize = STREAK_PAGE_SIZE,
  concurrency = STREAK_CONCURRENCY,
  log = console,
}) {
  const yesterday = localDateKey(now, -1)
  let last
  let sent = 0
  let failed = 0
  let scanned = 0

  for (;;) {
    let q = db
      .collection('users')
      .where('progress.streak.lastActiveDate', '==', yesterday)
      .orderBy('__name__')
      .limit(pageSize)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break
    last = snap.docs[snap.docs.length - 1]
    scanned += snap.docs.length

    const targets = []
    for (const doc of snap.docs) {
      const data = doc.data()
      const current = data.progress?.streak?.current
      if (!current || !data.fcmTokens?.length) continue
      targets.push({ uid: doc.id, current })
    }

    for (let i = 0; i < targets.length; i += concurrency) {
      await Promise.all(
        targets.slice(i, i + concurrency).map(async ({ uid, current }) => {
          try {
            await sendPush(uid, reminderMessage(current))
            sent += 1
          } catch (err) {
            failed += 1
            log.error(`Rappel de série impossible pour ${uid} :`, err)
          }
        })
      )
    }
    if (snap.docs.length < pageSize) break
  }

  return { scanned, sent, failed }
}
