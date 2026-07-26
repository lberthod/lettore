// Limite complémentaire par IP sur la génération (pure, sans dépendance
// Firestore ni HTTP — testable seule, voir test/ratelimit.test.mjs).
//
// Pourquoi en plus des crédits : le quota est *par compte*, et un compte
// gratuit se crée en quelques secondes. Un script qui enchaîne
// inscription → essai → inscription… reste dans les clous compte par compte
// tout en consommant le fournisseur LLM sans limite. On plafonne donc aussi
// ce qu'une même origine réseau peut déclencher, en particulier le nombre de
// *comptes distincts* qui consomment leur essai gratuit depuis cette IP.
//
// Volontairement en mémoire : c'est un garde-fou complémentaire, pas la
// source de vérité des quotas (celle-ci est dans Firestore et survit à un
// redémarrage). Un redémarrage remet ces compteurs à zéro — acceptable pour
// freiner une rafale automatisée, et sans coût d'écriture par requête.

export const IP_WINDOW_MS = 24 * 60 * 60 * 1000
// Une IP partagée légitime (NAT familial, réseau d'école, université) doit
// pouvoir faire découvrir l'essai à quelques personnes ; au-delà, c'est le
// profil d'une ferme à comptes.
export const MAX_TRIAL_ACCOUNTS_PER_IP = 5
// Plafond global (tous rôles confondus) : protège aussi contre un compte
// payant compromis qui serait pillé depuis une seule machine.
export const MAX_GENERATIONS_PER_IP = 40
// Borne mémoire : au-delà, on oublie les IP les plus anciennes. Une attaque
// distribuée sur des milliers d'IP n'est de toute façon pas arrêtée par ce
// mécanisme (c'est le rôle d'App Check et de la vérification d'e-mail).
export const MAX_TRACKED_IPS = 10000

export const IP_TRIAL_LIMIT_MESSAGE =
  'Trop de comptes ont déjà utilisé leur génération d’essai depuis cette connexion. Réessayez plus tard ou passez à Premium IA.'
export const IP_RATE_LIMIT_MESSAGE =
  'Trop de générations lancées depuis cette connexion aujourd’hui. Réessayez plus tard.'

// Adresse réelle de l'appelant. Le serveur n'écoute que sur 127.0.0.1 : le
// seul client direct est Caddy, qui **ajoute** l'IP qu'il a vue en fin de
// `X-Forwarded-For`. La dernière valeur est donc la seule non falsifiable —
// un client qui envoie son propre en-tête `X-Forwarded-For` ne fait
// qu'ajouter du bruit devant. `trustProxy: false` (pas de reverse proxy
// devant) ignore complètement l'en-tête.
export function clientIp(req, { trustProxy = true } = {}) {
  if (trustProxy) {
    const header = req.headers?.['x-forwarded-for']
    const parts = String(header || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length) return parts[parts.length - 1]
  }
  return req.socket?.remoteAddress || 'inconnue'
}

export function createIpLimiter(options = {}) {
  const windowMs = options.windowMs ?? IP_WINDOW_MS
  const maxTrialAccounts = options.maxTrialAccounts ?? MAX_TRIAL_ACCOUNTS_PER_IP
  const maxGenerations = options.maxGenerations ?? MAX_GENERATIONS_PER_IP
  const maxTrackedIps = options.maxTrackedIps ?? MAX_TRACKED_IPS
  const now = options.now ?? (() => Date.now())

  // ip → [{ at, uid, trial }] ; l'ordre d'insertion de la Map sert aussi
  // d'ordre d'éviction (la plus anciennement touchée sort la première).
  const byIp = new Map()

  function events(ip) {
    const kept = (byIp.get(ip) || []).filter((e) => e.at > now() - windowMs)
    if (kept.length) byIp.set(ip, kept)
    else byIp.delete(ip)
    return kept
  }

  // Renvoie un message si la génération doit être refusée, sinon null.
  function check(ip, { uid, trial = false } = {}) {
    const seen = events(ip)
    if (seen.length >= maxGenerations) return IP_RATE_LIMIT_MESSAGE
    if (trial) {
      const uids = new Set(seen.filter((e) => e.trial).map((e) => e.uid))
      // Un compte déjà connu de cette IP ne consomme pas de nouveau « siège » :
      // seul le nombre de comptes *distincts* est plafonné.
      if (!uids.has(uid) && uids.size >= maxTrialAccounts) return IP_TRIAL_LIMIT_MESSAGE
    }
    return null
  }

  // À appeler seulement quand la génération est réellement réservée : une
  // requête refusée (quota, validation) n'a rien coûté en IA, elle ne doit
  // pas grignoter le budget d'une IP partagée.
  function record(ip, { uid, trial = false } = {}) {
    const seen = events(ip)
    seen.push({ at: now(), uid, trial })
    // Réinsertion pour remettre l'IP en fin de Map (récemment vue).
    byIp.delete(ip)
    byIp.set(ip, seen)
    while (byIp.size > maxTrackedIps) {
      byIp.delete(byIp.keys().next().value)
    }
  }

  // Purge périodique des IP dont toutes les entrées ont expiré (sinon elles
  // ne disparaissent qu'à leur prochaine consultation).
  function sweep() {
    for (const ip of [...byIp.keys()]) events(ip)
    return byIp.size
  }

  return { check, record, sweep, size: () => byIp.size }
}

// Compteur glissant tous comptes confondus, pour l'alerte « activité
// anormale » : ce n'est pas une limite (il ne refuse rien), juste un signal
// à surveiller dans les logs du service.
export function createRateWindow({ windowMs = 60 * 60 * 1000, now = () => Date.now() } = {}) {
  let stamps = []
  return {
    hit() {
      const cutoff = now() - windowMs
      stamps = stamps.filter((t) => t > cutoff)
      stamps.push(now())
      return stamps.length
    },
  }
}
