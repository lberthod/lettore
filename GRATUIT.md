# Leggendo en mode gratuit

Décision du 22 octobre 2026 : **Leggendo n'a plus de formule payante.** La
priorité est d'avoir des lecteurs et leurs retours ; la monétisation sera
étudiée plus tard, à partir de l'usage réel. Ce document remplace
[README_TARIFICATION.md](README_TARIFICATION.md) comme source de vérité sur
les droits d'accès.

## Ce que ça change pour l'utilisateur

| | Sans compte | Avec un compte (gratuit) |
|---|---|---|
| Textes du catalogue | 6 textes de découverte (`EXAMPLE_COUNT`) | tous |
| Classici | 1er chapitre de chaque livre + 3 livres entiers | tous les chapitres |
| Notizie | — | oui |
| Dizionario, Verbi, Grammatica, Giochi, test de niveau | oui | oui |
| Progression synchronisée, favoris, parcours | — | oui |
| Outils IA (Créer son texte, Scrivi, Dialogo) | — | `FREE_MONTHLY_CREDITS` crédits par mois civil, adresse e-mail vérifiée |

Les crédits IA restent plafonnés parce que chaque usage coûte un appel LLM.
Le plafond est une constante unique côté serveur (`FREE_MONTHLY_CREDITS`
dans `leggendo-server/quota.mjs`, copie d'affichage dans
`src/seo/freePage.js`). Barème inchangé : court 1, moyen 2, long 3, très
long 4, correction 1, dialogue 2 (par session).

## Où c'est appliqué

- **Firestore** (`firestore.rules`) : `catalogTexts`, `bookChapters` et
  `newsTexts` sont lisibles par tout compte connecté (`request.auth != null`).
  C'est la seule vraie barrière : le contenu hors aperçu n'est pas dans le
  build. Le partage public d'un texte créé (`userTexts.public`) reste réservé
  au rôle `enseignant` : fonctionnalité non livrée, pas un paywall.
- **Serveur IA** (`leggendo-server/quota.mjs`) : tout rôle a un plafond
  mensuel ; `gratuit`/`premium`/inconnu = `FREE_MONTHLY_CREDITS`,
  `premium_plus` = 30, `enseignant` = 100 (rôles posés à la main par
  `adminSetUserRole`, utiles pour les tests). Adresse e-mail vérifiée exigée
  pour tout le monde. La limite par IP (`ratelimit.mjs`) s'applique à tous les
  comptes ordinaires.
- **Client** (`src/lib/access.js`) : `hasCatalogAccess`, `hasClassiciAccess`,
  `hasAiAccess` (alias `isPremiumPlus`) répondent « connecté ou non ». Le
  bloc `ContentPaywall.vue` n'apparaît qu'aux visiteurs sans compte et invite
  à créer un compte.
- **Page `/abonnement`** : conservée (liens indexés, apps installées) mais
  devenue la page « Gratuit » (`PricingView.vue`, contenu dans
  `src/seo/freePage.js`, prérendu dans `scripts/prerender.mjs`).
- **Essai Premium IA** : plus démarré côté client (`src/lib/trial.js`
  supprimé). Les Cloud Functions `startTrial`/`revertExpiredTrials`/
  `onUserCreated` existent encore dans `functions/` mais ne sont pas
  déployées (facturation Firebase) ; un ancien claim `trialEnd` échu est
  traité comme `gratuit` par `resolveRole`, donc sans effet.

## Ce qui a été retiré du build

`src/lib/stripe.js`, `src/lib/billing.js` (Play Billing), `src/lib/iap.js`
(StoreKit), `src/lib/trial.js`. Ils restent dans l'historique git, et
l'intégration Paddle est conservée sur la branche `feat/paddle-mor`
([PADDLE.md](PADDLE.md)). La dépendance `cordova-plugin-purchase` est encore
dans `package.json` (inutilisée) : à retirer lors du prochain `npm install`
natif.

## À faire pour déployer

1. `firebase deploy --only firestore:rules` (ne dépend pas de la facturation).
2. Déployer `leggendo-server` sur le VPS (`pm2 restart leggendo`) — voir
   `~/Desktop/SKILLS/vps-deploy.md`.
3. Build + prérendu du front, puis swap du dossier `dist` servi par Caddy.
4. Fiches Play Store / App Store : retirer les abonnements in-app et mettre à
   jour la description (« gratuit »). Les CGU et la politique de
   confidentialité du site sont déjà alignées.

## Quand on voudra monétiser

Tout le circuit rôle → droits est toujours là (claims Firebase, `resolveRole`,
`MONTHLY_CREDITS` par rôle) : rebrancher un paiement consiste à poser un rôle
depuis un webhook (Stripe : `functions/stripe-events.mjs`, Paddle : branche
`feat/paddle-mor`) et à rendre les règles Firestore / `access.js` à nouveau
sensibles au rôle. Ne pas promettre plus que ce que dit la FAQ de la page
Gratuit : « si des options payantes apparaissent, elles s'ajoutent sans
retirer ce qui existe ».
