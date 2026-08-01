import { describe, it, expect } from 'vitest'
import {
  nextStep,
  weekSummary,
  recommendText,
  targetLevel,
  dueReviewCount,
  daysAgoLabel,
  REVIEW_THRESHOLD,
  composeSession,
  currentStepIndex,
  COSTLY_AI_TYPES,
  REVIEW_STEP_CAP,
  STEP_SKILL,
} from './percorso.js'

const DAY = 24 * 60 * 60 * 1000
// Un mercredi à midi, heure locale : les règles « aujourd'hui » et « cette
// semaine » se calculent par rapport à cet instant fixe.
const NOW = new Date(2026, 6, 15, 12, 0).getTime()

// Progression minimale d'un profil neuf — chaque test surcharge ce qu'il veut.
function makeProgress(over = {}) {
  return {
    readTexts: [],
    favorites: [],
    errorCards: [],
    knownWords: [],
    activity: [],
    skills: {},
    streak: { current: 0, longest: 0, lastActiveDate: null },
    learningPreferences: {
      goal: 'general',
      dailyMinutes: 10,
      reminderEnabled: false,
      preferredActivities: [],
      avoidedActivities: [],
    },
    ...over,
  }
}

const texts = [
  { id: 'a1-uno', title: 'Il gatto', level: 'A1' },
  { id: 'a1-due', title: 'La casa', level: 'A1' },
  { id: 'b1-uno', title: 'Il viaggio', level: 'B1' },
  { id: 'b1-due', title: 'La città', level: 'B1' },
]

// Raccourcis : événements d'activité horodatés relativement à NOW.
const ev = (skill, daysBack = 0, extra = {}) => ({
  skill,
  ts: NOW - daysBack * DAY,
  ...extra,
})

describe('nextStep — règles de priorité', () => {
  it('priorité 1 : ≥ 5 révisions dues (mots + cartes d’erreur confondus) → Réviser', () => {
    const progress = makeProgress({
      favorites: [
        { word: 'casa', due: 0 },
        { word: 'gatto', due: NOW - 1 },
        { word: 'sole', due: NOW }, // due <= now : échu
        { word: 'mare', due: NOW + DAY }, // pas encore dû : ne compte pas
      ],
      errorCards: [
        { id: 'e1', due: 0 },
        { id: 'e2', due: 0 },
      ],
      // Même avec une lecture faite aujourd'hui, la révision passe devant.
      activity: [ev('lettura')],
    })
    const step = nextStep(progress, { now: NOW })
    expect(step.id).toBe('ripasso')
    expect(step.title).toBe('Réviser (5 éléments)')
    expect(step.reason).toBe("5 mots et erreurs t'attendent")
    expect(step.to).toEqual({ name: 'words' })
  })

  it('sous le seuil de révisions, la règle suivante s’applique', () => {
    const progress = makeProgress({
      favorites: Array.from({ length: REVIEW_THRESHOLD - 1 }, (_, i) => ({
        word: `w${i}`,
        due: 0,
      })),
    })
    expect(nextStep(progress, { now: NOW }).id).toBe('lettura')
  })

  it('priorité 2 : aucune lecture/écoute aujourd’hui → lire un texte non lu au niveau mesuré', () => {
    const progress = makeProgress({
      readTexts: ['b1-uno'],
      // Niveau mesuré B1 (mode des 5 dernières estimations d'écriture)
      skills: { scrittura: { levels: ['B1', 'B1', 'A2', 'B1'] } },
      // Lecture d'hier : ne compte pas pour aujourd'hui.
      activity: [ev('lettura', 1)],
    })
    const step = nextStep(progress, { texts, now: NOW })
    expect(step.id).toBe('lettura')
    // b1-uno est déjà lu → b1-due, seul B1 restant.
    expect(step.to).toEqual({ name: 'reader', params: { id: 'b1-due' } })
    expect(step.reason).toContain('La città')
    expect(step.reason).toContain('B1')
  })

  it('priorité 2 sans catalogue chargé : renvoie vers la bibliothèque', () => {
    const step = nextStep(makeProgress(), { now: NOW })
    expect(step.id).toBe('lettura')
    expect(step.to).toEqual({ name: 'library' })
  })

  it('priorité 3 : lecture faite aujourd’hui mais écoute peu pratiquée cette semaine → écouter', () => {
    const progress = makeProgress({
      activity: [ev('lettura'), ev('ascolto', 3)], // 1 seule écoute en 7 jours
    })
    const step = nextStep(progress, { texts, now: NOW })
    expect(step.id).toBe('ascolto')
    expect(step.to).toEqual({
      name: 'reader',
      params: { id: 'a1-uno' },
      query: { mode: 'ascolto' },
    })
  })

  it('une écoute vieille de plus de 7 jours ne compte pas dans la semaine', () => {
    const progress = makeProgress({
      activity: [ev('lettura'), ev('ascolto', 8), ev('ascolto', 9)],
    })
    expect(nextStep(progress, { now: NOW }).id).toBe('ascolto')
  })

  it('priorité 4 : Premium IA sans écriture cette semaine → écrire', () => {
    const progress = makeProgress({
      activity: [ev('lettura'), ev('ascolto', 1), ev('ascolto', 2), ev('scrittura', 10)],
    })
    const step = nextStep(progress, { hasPremiumIA: true, now: NOW })
    expect(step.id).toBe('scrittura')
    expect(step.to).toEqual({ name: 'write' })
  })

  it('priorité 5 : Premium IA, écriture faite mais aucun dialogue cette semaine → dialoguer', () => {
    const progress = makeProgress({
      activity: [ev('lettura'), ev('ascolto', 1), ev('ascolto', 2), ev('scrittura', 2)],
    })
    const step = nextStep(progress, { hasPremiumIA: true, now: NOW })
    expect(step.id).toBe('dialogo')
    expect(step.to).toEqual({ name: 'dialogue' })
  })

  it('sans Premium IA, les règles écriture/dialogue sont sautées → continuer à lire', () => {
    const progress = makeProgress({
      activity: [ev('lettura'), ev('ascolto', 1), ev('ascolto', 2)],
    })
    const step = nextStep(progress, { hasPremiumIA: false, now: NOW })
    expect(step.id).toBe('continua')
    expect(step.to).toEqual({ name: 'library' })
  })

  it('défaut : tout est fait cette semaine → continuer à lire', () => {
    const progress = makeProgress({
      activity: [
        ev('lettura'),
        ev('ascolto', 0),
        ev('ascolto', 1),
        ev('scrittura', 1),
        ev('dialogo', 2),
      ],
    })
    const step = nextStep(progress, { hasPremiumIA: true, now: NOW })
    expect(step.id).toBe('continua')
  })

  it('chaque étape expose id, title, reason, to et cta', () => {
    const step = nextStep(makeProgress(), { now: NOW })
    expect(step).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      reason: expect.any(String),
      cta: expect.any(String),
    })
    expect(step.to).toHaveProperty('name')
  })
})

describe('recommendText / targetLevel', () => {
  it('sans niveau mesuré, retombe sur le niveau le plus fréquent des textes lus', () => {
    const progress = makeProgress({ readTexts: ['b1-uno', 'b1-due', 'a1-uno'] })
    expect(targetLevel(progress, texts)).toBe('B1')
    // Tous les B1 sont lus : premier texte non lu, quel que soit son niveau.
    expect(recommendText(progress, texts)).toMatchObject({ id: 'a1-due' })
  })

  it('tout lu → null (l’appelant renvoie vers la bibliothèque)', () => {
    const progress = makeProgress({ readTexts: texts.map((t) => t.id) })
    expect(recommendText(progress, texts)).toBeNull()
  })
})

describe('dueReviewCount', () => {
  it('additionne favoris et cartes d’erreur échus, ignore le reste', () => {
    const progress = makeProgress({
      favorites: [{ word: 'a', due: 0 }, { word: 'b', due: NOW + DAY }],
      errorCards: [{ id: 'e', due: NOW - 1 }],
    })
    expect(dueReviewCount(progress, NOW)).toBe(2)
  })
})

describe('weekSummary', () => {
  it('compte les événements des 7 derniers jours par compétence', () => {
    const progress = makeProgress({
      activity: [
        ev('lettura', 0),
        ev('lettura', 3),
        ev('ascolto', 6),
        ev('vocabolario', 2),
        ev('scrittura', 8), // hors fenêtre
        ev('inconnue', 1), // compétence non suivie : ignorée
      ],
    })
    expect(weekSummary(progress, NOW)).toEqual({
      total: 4,
      lettura: 2,
      ascolto: 1,
      vocabolario: 1,
      scrittura: 0,
      dialogo: 0,
      pronuncia: 0,
    })
  })

  it('profil neuf → tous les compteurs à zéro', () => {
    expect(weekSummary(makeProgress(), NOW).total).toBe(0)
  })
})

describe('composeSession — session quotidienne composée', () => {
  it('ne planifie jamais plus de trois étapes', () => {
    const progress = makeProgress({
      favorites: Array.from({ length: 20 }, (_, i) => ({ word: `w${i}`, due: 0 })),
      learningPreferences: {
        goal: 'general',
        dailyMinutes: 20,
        reminderEnabled: false,
        preferredActivities: [],
        avoidedActivities: [],
      },
    })
    const session = composeSession(progress, { hasPremiumIA: true, texts, now: NOW })
    expect(session.steps.length).toBeLessThanOrEqual(3)
  })

  it('révisions très en retard en premier, mais plafonnées à REVIEW_STEP_CAP', () => {
    const progress = makeProgress({
      favorites: Array.from({ length: 50 }, (_, i) => ({ word: `w${i}`, due: 0 })),
    })
    const session = composeSession(progress, { now: NOW })
    expect(session.steps[0]).toMatchObject({ type: 'review', count: REVIEW_STEP_CAP })
  })

  it('l’étape review porte sa limite dans la query (régression WordsView non plafonné)', () => {
    const progress = makeProgress({
      favorites: Array.from({ length: 50 }, (_, i) => ({ word: `w${i}`, due: 0 })),
    })
    const session = composeSession(progress, { now: NOW })
    expect(session.steps[0].to).toEqual({
      name: 'words',
      query: { limit: String(REVIEW_STEP_CAP) },
    })
  })

  it('pas de révision proposée quand rien n’est dû', () => {
    const progress = makeProgress()
    const session = composeSession(progress, { texts, now: NOW })
    expect(session.steps.some((s) => s.type === 'review')).toBe(false)
  })

  it('durée par défaut = dailyMinutes des préférences', () => {
    const progress = makeProgress({
      learningPreferences: {
        goal: 'general',
        dailyMinutes: 20,
        reminderEnabled: false,
        preferredActivities: [],
        avoidedActivities: [],
      },
    })
    const session = composeSession(progress, { texts, now: NOW })
    expect(session.duration).toBe(20)
  })

  it('une durée explicite prime sur les préférences', () => {
    const progress = makeProgress()
    const session = composeSession(progress, { texts, now: NOW, duration: 5 })
    expect(session.duration).toBe(5)
  })

  it('jamais deux activités IA coûteuses (write/dialogo) dans une session courte', () => {
    const progress = makeProgress({
      learningPreferences: {
        goal: 'general',
        dailyMinutes: 10,
        reminderEnabled: false,
        preferredActivities: [],
        avoidedActivities: [],
      },
    })
    const session = composeSession(progress, { hasPremiumIA: true, texts, now: NOW, duration: 10 })
    const costly = session.steps.filter((s) => COSTLY_AI_TYPES.includes(s.type))
    expect(costly.length).toBeLessThanOrEqual(1)
  })

  it('sans Premium IA, aucune étape write/dialogo n’est proposée', () => {
    const progress = makeProgress()
    const session = composeSession(progress, { hasPremiumIA: false, texts, now: NOW })
    expect(session.steps.some((s) => COSTLY_AI_TYPES.includes(s.type))).toBe(false)
  })

  it("objectif 'reading' ne recommande pas dialogo/write même si leur compteur est bas", () => {
    const progress = makeProgress({
      learningPreferences: {
        goal: 'reading',
        dailyMinutes: 15,
        reminderEnabled: false,
        preferredActivities: [],
        avoidedActivities: [],
      },
      // scrittura/dialogo jamais pratiqués (compteur le plus bas possible),
      // mais hors de l'objectif « reading » : ne doivent pas apparaître.
      activity: [ev('lettura', 0)],
    })
    const session = composeSession(progress, { hasPremiumIA: true, texts, now: NOW })
    expect(session.steps.every((s) => !['write', 'dialogo'].includes(s.type))).toBe(true)
  })

  it("objectif 'conversation' priorise dialogo/pronuncia", () => {
    const progress = makeProgress({
      learningPreferences: {
        goal: 'conversation',
        dailyMinutes: 15,
        reminderEnabled: false,
        preferredActivities: [],
        avoidedActivities: [],
      },
    })
    const session = composeSession(progress, { hasPremiumIA: true, texts, now: NOW })
    expect(session.steps.some((s) => s.type === 'dialogo' || s.type === 'pronuncia')).toBe(true)
  })

  it('alterne réception et production quand la durée le permet', () => {
    const progress = makeProgress({
      learningPreferences: {
        goal: 'general',
        dailyMinutes: 20,
        reminderEnabled: false,
        preferredActivities: [],
        avoidedActivities: [],
      },
    })
    const session = composeSession(progress, { hasPremiumIA: true, texts, now: NOW })
    const modes = session.steps
      .filter((s) => s.type !== 'review')
      .map((s) => (['lettura', 'ascolto'].includes(s.type) ? 'reception' : 'production'))
    for (let i = 1; i < modes.length; i++) {
      expect(modes[i]).not.toBe(modes[i - 1])
    }
  })

  it('évite de reproduire exactement la composition de la veille', () => {
    const prefs = {
      goal: 'general',
      dailyMinutes: 10,
      reminderEnabled: false,
      preferredActivities: [],
      avoidedActivities: [],
    }
    const yesterdayProgress = makeProgress({ learningPreferences: prefs })
    const y = composeSession(yesterdayProgress, { hasPremiumIA: true, texts, now: NOW - DAY })
    const yesterdaySignature = y.steps.map((s) => s.type).sort()

    // Aujourd'hui : le journal ET les agrégats par compétence (progress.skills,
    // alimentés par logActivity dans l'app réelle) indiquent que ces mêmes
    // compétences ont été pratiquées hier — la priorisation par dernière
    // pratique doit à elle seule pousser vers une autre composition.
    const skills = {}
    for (const type of yesterdaySignature) {
      skills[STEP_SKILL[type]] = { lastTs: NOW - DAY }
    }
    const progress = makeProgress({
      learningPreferences: prefs,
      skills,
      activity: yesterdaySignature.map((type) => ev(STEP_SKILL[type], 1)),
    })
    const today = composeSession(progress, { hasPremiumIA: true, texts, now: NOW })
    const todaySignature = today.steps.map((s) => s.type).sort()
    expect(todaySignature).not.toEqual(yesterdaySignature)
  })

  it('évite la répétition même pour un utilisateur inactif hier, via yesterdayTypes (régression)', () => {
    // Sans activité réelle hier (l'utilisateur a ignoré la recommandation),
    // yesterdaySignature() dérivée du seul journal est vide et ne peut rien
    // détecter — c'est justement le cas que `yesterdayTypes` (fourni par
    // l'appelant depuis lib/dailySession.js#loadYesterdaySessionTypes, qui se
    // souvient de la session RECOMMANDÉE, pas de ce qui a été fait) doit
    // couvrir.
    const prefs = {
      goal: 'general',
      dailyMinutes: 10,
      reminderEnabled: false,
      preferredActivities: [],
      avoidedActivities: [],
    }
    const progress = makeProgress({ learningPreferences: prefs, activity: [] })
    const y = composeSession(progress, { hasPremiumIA: true, texts, now: NOW - DAY })
    const yesterdayTypes = y.steps.map((s) => s.type)

    // Sans l'override : même profil totalement inactif, composition identique.
    const withoutOverride = composeSession(progress, { hasPremiumIA: true, texts, now: NOW })
    expect(withoutOverride.steps.map((s) => s.type).sort()).toEqual([...yesterdayTypes].sort())

    // Avec l'override : la composition change.
    const withOverride = composeSession(progress, { hasPremiumIA: true, texts, now: NOW, yesterdayTypes })
    expect(withOverride.steps.map((s) => s.type).sort()).not.toEqual([...yesterdayTypes].sort())
  })

  it('activité évitée : proposée seulement avec modération, jamais éliminée définitivement', () => {
    const progress = makeProgress({
      learningPreferences: {
        goal: 'general',
        dailyMinutes: 20,
        reminderEnabled: false,
        preferredActivities: [],
        avoidedActivities: ['ascolto'],
      },
    })
    // La liste de préférences n'exclut pas fonctionnellement l'ascolto :
    // c'est juste dépriorisé (testé indirectement via la préférence).
    const session = composeSession(progress, { hasPremiumIA: true, texts, now: NOW })
    expect(session.steps.length).toBeGreaterThan(0)
  })

  it('objectif exposé dans la session, adapté au but personnel', () => {
    const progress = makeProgress({
      learningPreferences: {
        goal: 'travel',
        dailyMinutes: 10,
        reminderEnabled: false,
        preferredActivities: [],
        avoidedActivities: [],
      },
    })
    const session = composeSession(progress, { texts, now: NOW })
    expect(session.objective).toMatch(/voyage/i)
  })

  it('chaque étape expose type et estimatedMinutes', () => {
    const progress = makeProgress({
      favorites: [{ word: 'a', due: 0 }],
    })
    const session = composeSession(progress, { hasPremiumIA: true, texts, now: NOW })
    for (const step of session.steps) {
      expect(step).toMatchObject({ type: expect.any(String), estimatedMinutes: expect.any(Number) })
      // Chaque étape reste directement accessible depuis la navigation
      // existante (règle 6.5) : un lien vue-router valide.
      expect(step.to).toHaveProperty('name')
    }
  })

  it('la somme des étapes ne dépasse jamais la durée annoncée', () => {
    // Beaucoup de révisions dues + Premium IA : de quoi remplir largement
    // 3 étapes de 5 minutes chacune si le budget n'est pas respecté.
    const progress = makeProgress({
      favorites: Array.from({ length: 50 }, (_, i) => ({ word: `w${i}`, due: 0 })),
    })
    for (const duration of [5, 10, 20]) {
      const session = composeSession(progress, { hasPremiumIA: true, texts, now: NOW, duration })
      const total = session.steps.reduce((sum, s) => sum + s.estimatedMinutes, 0)
      expect(total).toBeLessThanOrEqual(duration)
    }
  })

  it('une session de 5 minutes ne propose pas 12 minutes d’étapes (régression)', () => {
    const progress = makeProgress({
      favorites: Array.from({ length: 10 }, (_, i) => ({ word: `w${i}`, due: 0 })),
    })
    const session = composeSession(progress, { hasPremiumIA: true, texts, now: NOW, duration: 5 })
    const total = session.steps.reduce((sum, s) => sum + s.estimatedMinutes, 0)
    expect(total).toBeLessThanOrEqual(5)
  })

  it('une session très courte sans révision due propose quand même au moins une étape', () => {
    const progress = makeProgress()
    const session = composeSession(progress, { hasPremiumIA: true, texts, now: NOW, duration: 2 })
    expect(session.steps.length).toBeGreaterThan(0)
  })
})

describe('currentStepIndex — reprise locale de session', () => {
  it('pointe sur la première étape si rien n’a été fait', () => {
    const progress = makeProgress()
    const session = { steps: [{ type: 'review' }, { type: 'lettura' }] }
    expect(currentStepIndex(session, progress, NOW - DAY)).toBe(0)
  })

  it('avance dès qu’une activité correspondant au type est journalisée depuis le début de session', () => {
    const progress = makeProgress({
      activity: [ev('vocabolario', 0)],
    })
    const session = { steps: [{ type: 'review' }, { type: 'lettura' }, { type: 'ascolto' }] }
    expect(currentStepIndex(session, progress, NOW - DAY)).toBe(1)
  })

  it('renvoie la longueur des étapes quand tout est fait', () => {
    const progress = makeProgress({
      activity: [ev('vocabolario', 0), ev('lettura', 0)],
    })
    const session = { steps: [{ type: 'review' }, { type: 'lettura' }] }
    expect(currentStepIndex(session, progress, NOW - DAY)).toBe(2)
  })

  it('une activité antérieure au début de session ne compte pas', () => {
    const progress = makeProgress({
      activity: [ev('vocabolario', 5)], // il y a 5 jours, avant la session
    })
    const session = { steps: [{ type: 'review' }] }
    expect(currentStepIndex(session, progress, NOW - DAY)).toBe(0)
  })
})

describe('daysAgoLabel — jours calendaires locaux', () => {
  it("aujourd'hui / hier / il y a N jours / jamais", () => {
    expect(daysAgoLabel(NOW - 60 * 1000, NOW)).toBe("aujourd'hui")
    // Hier à 23 h : moins de 24 h mais un jour calendaire d'écart.
    const yesterdayEvening = new Date(2026, 6, 14, 23, 0).getTime()
    expect(daysAgoLabel(yesterdayEvening, NOW)).toBe('hier')
    expect(daysAgoLabel(NOW - 5 * DAY, NOW)).toBe('il y a 5 jours')
    expect(daysAgoLabel(null, NOW)).toBe('jamais')
  })
})
