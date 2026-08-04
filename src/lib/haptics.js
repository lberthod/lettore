import { isNativeApp } from './platform.js'

// Retour haptique léger (changement d'onglet, réponse de quiz…). No-op sur
// web — @capacitor/haptics n'est chargé qu'en contexte natif, jamais dans le
// bundle web (voir « Optimisation Mobile.md » Phase 3 Sprint 3.2).
export async function tapFeedback() {
  if (!isNativeApp) return
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    // Device sans support haptique : silencieux, ce n'est qu'un agrément.
  }
}

// Retour plus marqué : bonne/mauvaise réponse de quiz.
export async function resultFeedback(success) {
  if (!isNativeApp) return
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics')
    await Haptics.notification({
      type: success ? NotificationType.Success : NotificationType.Error,
    })
  } catch {
    // Silencieux — voir tapFeedback ci-dessus.
  }
}
