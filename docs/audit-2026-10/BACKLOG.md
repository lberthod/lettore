# Backlog Leggendo - audit 2026-10

Règle absolue : aucun commit, aucun déploiement, aucun appel en écriture vers Firebase/production (Firestore, Auth, Functions, VPS, Play Store, Stripe). Tests uniquement en local/émulateur. Chaque agent ne touche QUE les fichiers de son stream.

Ordre recommandé : A (P0) en premier et en continu ; B, C, D, E en parallèle (disjoints). Dépendances inter-streams indiquées par "DEP".

## Répartition des fichiers (disjoints)
- A : functions/index.js, functions/push.mjs, functions/roles.mjs, functions/roles.test.mjs, functions/package*.json, leggendo-server/* (dont test/), firestore.rules, test/firestore-rules.test.mjs, package.json, package-lock.json, src/lib/iap.js (si besoin côté appelant).
- B : src/lib/push.js, src/App.vue, src/views/PrivacyView.vue, TermsView.vue, LegalView.vue.
- C : src/views/{HomeView,LoginView,ReaderView,BooksView,LibraryView,AboutView,DictionaryView}.vue, src/components/{ContentPaywall,SiteHeader,SceneLayout}.vue, src/style.css, src/router.js, src/views/PricingView.vue.
- D : scripts/prerender.mjs, scripts/generate-sitemap.mjs, src/seo/*, vite.config.js, public/* (manifest, audio-test.html, sitemap), Caddyfile (nouveau, racine).
- E : src/texts/*.json (A1/A2 ciblés), scripts/check-levels.mjs (nouveau), scripts/generate-text.mjs.

---
## STREAM A - Sécurité serveur (14 tickets)

### SEC-1 [P0] Essai Premium IA seulement après email vérifié
- **STATUT : FAIT (code + tests ; déploiement HUM-1).** Preuve : `cd leggendo-server && npm test` (135 pass) et `cd functions && npm test` (49 pass) ; onUserCreated ne pose plus de claims (`grep -n premium_plus functions/index.js` : aucune attribution). Callable `startTrial` (functions/trial.mjs) : e-mail vérifié, 1 fois par uid (`trialGrants`) et par e-mail normalisé (`trialEmails`), réponse `{ok, trialEnd}`. Crédits d'essai plafonnés à 3 (quota.mjs), essai non vérifié = 0 crédit, `isTrialLikeAccount` pour la limite IP, essai échu = rôle gratuit. **DEP B/C : appeler `startTrial` après vérification e-mail puis `getIdToken(true)`.** Les comptes existants avec claims d'essai restent valides jusqu'à trialEnd.
- Fichiers : functions/index.js (onUserCreated ~l.134-139, nouveau callable startTrial), leggendo-server/server.mjs (l.391 isTrial), leggendo-server/quota.mjs, functions/roles.mjs
- Travail : à la création, rôle `gratuit` sans claims d'essai ; callable `startTrial` qui exige `token.email_verified === true`, active l'essai une seule fois (flag serveur par uid ET par e-mail normalisé), plafonne les crédits d'essai à ~3. `isTrial` doit être vrai pour tout compte en essai (trialEnd futur) en plus de `role==='gratuit'`, afin que la limite 5 comptes d'essai/IP s'applique.
- Critères : `grep -n "premium_plus" functions/index.js` ne montre aucune attribution dans onUserCreated ; tests unitaires (functions/roles.test.mjs, leggendo-server/test/quota.test.mjs, ratelimit.test.mjs) : compte non vérifié => 0 crédit IA ; essai vérifié => <=3 crédits ; 6e compte d'essai même IP refusé ; `cd leggendo-server && npm test` et `cd functions && node --test` verts.
- Risque : élevé (parcours d'inscription, essai de 10 jours annoncé). DEP : le client (B/C) doit appeler startTrial après vérification e-mail ; documenter le contrat dans le ticket de handoff (nom `startTrial`, réponse `{ok, trialEnd}`).

### SEC-2 [P0] Anti-rejeu des achats Play / Apple
- **STATUT : FAIT (code + tests ; non déployé).** Preuve : functions/purchases.test.mjs (même jeton 2 uid refusé, mauvais bundle refusé, timeout => deadline-exceeded, res.ok non ok => unavailable). Contrôles dans functions/purchases.mjs (le critère `grep res.ok` vise désormais ce module). Collection `purchaseTokens` interdite au client (firestore.rules). DEP : le client Play n'envoie pas encore `obfuscatedAccountId` (src/lib/billing.js hors stream) ; le contrôle est actif dès qu'il est posé (uid en clair ou SHA-256), sinon liaison jeton/uid seule.
- Fichiers : functions/index.js (verifyPlayPurchase ~l.350-412, verifyAppleReceipt ~l.531, validateAppleReceipt ~l.550-585)
- Travail : collection serveur `purchaseTokens/{hash(token|original_transaction_id)} -> uid` ; refuser si lié à un autre uid ; Play : obfuscatedExternalAccountId + packageName ; Apple : contrôle `bundle_id` et `original_transaction_id` ; timeout (AbortController) et contrôle `res.ok` dans verifyAppleReceipt.
- Critères : tests avec fetch/Firestore mockés : même token, 2 uid => 2e refusé ; mauvais bundle => refusé ; timeout => erreur propre. `grep -n "res.ok" functions/index.js` couvre verifyAppleReceipt. Règles Firestore : collection non lisible/écrivable client (cf. SEC-8).
- Risque : élevé (restauration d'achat légitime sur même uid doit rester OK).

### SEC-3 [P0] Mises à jour de dépendances (npm audit)
- **STATUT : FAIT (humain : valider android/ios générés).** Preuve : `npm audit --omit=dev` racine = 0 vulnérabilité ; functions/ = 0 high/critical (9 moderate `uuid` via firebase-admin/googleapis, exigent un major) ; leggendo-server/ = 1 moderate (même cause). Capacitor core/cli/android/ios ^8.5.1 (installés 8.5.3), `overrides` `@grpc/grpc-js ^1.14.6`, script `check:levels` ajouté. `npx vite build` OK (prebuild/postbuild des streams C/D non exécutés), `npm test` 270 pass. `npx cap sync` non lancé.
- Fichiers : package.json, package-lock.json, functions/package*.json, leggendo-server/package*.json (SEUL stream autorisé)
- Travail : @capacitor/android, @capacitor/ios, core, cli vers 8.5.1 (cohérents) ; mise à jour firebase/@firebase/firestore/vue ; dans functions/ : proxy-addr, @grpc/grpc-js, @fastify/busboy (npm audit fix sans --force d'abord).
- Critères : `npm audit --omit=dev` sans critique/élevée (racine et functions/) ; `npm run build` OK ; `npm test` OK ; pas de changement de major non justifié. Ne pas lancer `npx cap sync` en écriture hors du dépôt.
- Risque : moyen (régressions build/natif). DEP : changements android/ios générés (capacitor.build.gradle) à valider par l'humain.

### SEC-4 [P1] Statut d'abonnement Stripe
- **STATUT : FAIT.** Preuve : functions/subscription.test.mjs + stripe-events.test.mjs (un test par statut ; past_due = grâce de 3 jours depuis current_period_start). Logique dans functions/subscription.mjs / stripe-events.mjs (le `grep sub.status` vise ces modules).
- Fichiers : functions/index.js (customer.subscription.updated ~l.312-335)
- Travail : seuls `active`/`trialing` gardent premium ; `past_due` (délai de grâce court explicite), `unpaid`, `incomplete`, `incomplete_expired`, `canceled` => rétrograder.
- Critères : test unitaire par statut ; `grep -n "sub.status" functions/index.js` présent.
- Risque : moyen.

### SEC-5 [P1] Push cron : lots de 500 et compteur après envoi
- **STATUT : FAIT.** Preuve : leggendo-server/test/push-cron.test.mjs (700 jetons => 2 appels <= 500 ; compteur non incrémenté si 0 envoi réussi ; intervalle 4 h/plafond 6/j). Logique extraite dans leggendo-server/news-push.mjs, lots de 500 dans push.mjs.
- Fichiers : leggendo-server/news-cron.mjs (l.121-142)
- Critères : > 500 jetons => plusieurs appels sendEachForMulticast de <=500 ; `pushCountToday` incrémenté seulement si au moins un envoi réussi ; test avec faux messaging dans leggendo-server/test/push-cron.test.mjs.
- Risque : faible.

### SEC-6 [P1] Pruning des jetons FCM précis + dé-duplication de push.mjs
- **STATUT : FAIT.** Preuve : leggendo-server/test/push.test.mjs (seuls `registration-token-not-registered` et `invalid-registration-token` élagués ; test d'identité des deux copies ; `diff functions/push.mjs leggendo-server/push.mjs` vide). API unifiée `sendPushToUsers(db, uids, notif, {messaging})`.
- Fichiers : functions/push.mjs (l.12), leggendo-server/push.mjs (l.11), leggendo-server/test/push.test.mjs (nouveau)
- Travail : ne retirer que `messaging/registration-token-not-registered` et `messaging/invalid-registration-token` (pas invalid-argument). Garder deux copies identiques (déploiements distincts) avec un test qui vérifie qu'elles sont identiques (`diff functions/push.mjs leggendo-server/push.mjs`).
- Critères : tests unitaires de la fonction de tri des erreurs ; diff vide entre copies.
- Risque : faible.

### SEC-7 [P1] sendStreakReminders borné
- **STATUT : FAIT.** Preuve : functions/streaks.test.mjs (1200 comptes ciblés sur 1700 : pages de 200, concurrence <= 25, comptes hors filtre jamais lus). Requête `progress.streak.lastActiveDate == hier` (fuseau Europe/Zurich ; seules les séries à risque sont relancées). Aucun `Promise.all` non borné restant dans index.js.
- Fichiers : functions/index.js (~l.205-224)
- Travail : requête filtrée/paginée (pas de lecture complète de users), concurrence limitée (lots de 20-50), calcul de la date selon le fuseau stocké (ou documenter UTC) cohérent avec lastActiveDate.
- Critères : test avec Firestore fake : >1000 users ne charge pas tout en mémoire ; pas de `Promise.all` non borné (`grep -n "Promise.all" functions/index.js` revu).
- Risque : moyen.

### SEC-8 [P2] Règles Firestore : fcmTokens et collections serveur
- **STATUT : FAIT (règles écrites, test NON exécuté).** Règles : fcmTokens <= 10 chaînes (contrôlé seulement si le champ change), purchaseTokens/trialGrants/trialEmails fermés. Tests ajoutés dans test/firestore-rules.test.mjs mais `npm run test:rules` échoue ici : Java absent (émulateur Firestore indisponible). À lancer sur une machine avec Java.
- Fichiers : firestore.rules (l.75-78), test/firestore-rules.test.mjs
- Critères : `fcmTokens.size() <= 10` et éléments string ; collection purchaseTokens (SEC-2) interdite au client ; test des règles : 11 jetons refusés. Commande : `npm run test:rules` si existante, sinon `firebase emulators:exec` en local uniquement.
- Risque : faible.

### SEC-9 [P2] Admin par e-mail exige email_verified
- **STATUT : FAIT (HUM-5 : vérifier que le compte admin a un e-mail vérifié).** Preuve : functions/roles.test.mjs (e-mail admin non vérifié refusé) ; firestore.rules contentStats exige `email_verified == true` (test de règles ajouté, non exécuté faute de Java).
- Fichiers : functions/roles.mjs (l.18-26), firestore.rules (l.58), functions/roles.test.mjs
- Critères : un token `email_verified:false` avec e-mail admin n'obtient pas le rôle admin (règles + roles.mjs) ; tests verts.
- Risque : moyen (ne pas verrouiller l'admin ; vérifier que son compte est vérifié, action humaine).

### QUA-1 [P2] Tests manquants
- **STATUT : FAIT.** Tests ajoutés : fcmTokens (règles, non exécutés), push.mjs, push cron, sendStreakReminders, statuts Stripe, achats Play/Apple, startTrial, quota d'essai. Aucun appel réseau réel.
- Fichiers : functions/*.test.mjs, leggendo-server/test/*, test/*
- Critères : tests existent pour fcmTokens (règles), push.mjs, sendStreakReminders, flux Stripe webhook (statuts), achats Play/Apple (mocks). Aucun appel réseau réel.
- Risque : nul.

### QUA-2 [P2] Découpage des fichiers > 1000 lignes côté serveur
- **STATUT : PARTIEL.** functions/index.js allégé par extraction (trial, purchases, stripe-events, subscription, streaks) ; server.mjs (~980 l., < 1000) non découpé : risque/bénéfice jugé défavorable, à traiter séparément.
- Fichiers : leggendo-server/server.mjs (974 l.), functions/index.js
- Critère : extraction de modules (payments, streaks) sans changement de comportement ; tests verts. À faire APRÈS SEC-1 à SEC-7 pour éviter les conflits. Les vues Vue >1000 lignes sont hors périmètre ici (cf. C).
- Risque : moyen.

(Les tickets A sont donc : SEC-1..SEC-9, QUA-1, QUA-2.)

---
## STREAM B - Push client + légal (7 tickets)

### PUSH-1 [P1] Jeton retiré à la déconnexion, listeners propres
- Fichiers : src/lib/push.js (l.33-37, listeners), src/App.vue (hook push)
- Travail : à la déconnexion `arrayRemove(token)` sur users/{uid}.fcmTokens (avant signOut) ; `PushNotifications.removeAllListeners()` avant tout ré-enregistrement ; un seul jeu de listeners quel que soit le nombre de changements d'uid.
- Critères : test vitest avec mocks Capacitor/Firestore (src/lib/push.test.js nouveau) : 3 changements d'uid => 1 jeu de listeners ; logout => arrayRemove appelé. `npm test` vert.
- Risque : moyen. DEP : respecte la limite 10 jetons (SEC-8).

### PUSH-2 [P1] Permission demandée après un premier texte terminé
- Fichiers : src/lib/push.js, src/App.vue
- Travail : ne plus demander à la connexion ; écran explicatif (modale légère dans App.vue) proposé après le premier texte terminé (événement existant de fin de lecture ; si absent, écouter un événement `leggendo:text-completed` que C (ReaderView) peut émettre - DEP C, noter l'événement, à défaut lecture d'un compteur déjà stocké sans toucher ReaderView).
- Critères : `grep -n "requestPermissions" src/` n'apparaît que derrière la fonction appelée par l'écran explicatif ; refus mémorisé, pas de relance avant 30 jours.
- Risque : moyen.

### LEG-1 [P0] Politique de confidentialité exacte
- Fichiers : src/views/PrivacyView.vue
- Travail : remplacer « aucun suivi » par la réalité (GA4 actif, base légale/consentement) ; ajouter FCM (notifications), paiements Apple/Google/Stripe, fournisseurs IA (GLM, DeepSeek, Kimi) avec transferts hors UE/CH et garanties ; durée de conservation, droits LPD/RGPD, suppression de compte.
- Critères : `grep -in "aucun suivi" src/views/PrivacyView.vue` vide ; `grep -inE "Firebase Cloud Messaging|GLM|DeepSeek|Kimi|Google Analytics" ` tous présents. Relecture juridique humaine requise.
- Risque : faible techniquement, élevé juridiquement.

### LEG-2 [P1] CGU complètes
- Fichiers : src/views/TermsView.vue
- Travail : essai 10 jours (conditions, sans carte, fin automatique), rétractation UE 14 j (contenu numérique, renonciation), résiliation via les stores (Apple/Google) ou Stripe, tarification, limitation de responsabilité IA.
- Critères : grep des mots « essai », « rétractation », « résili » ; relecture humaine.
- Risque : faible.

### LEG-3 [P1] Domaines et mentions cohérents
- Fichiers : src/views/LegalView.vue (l.17 « elgendo.ch »)
- Travail : un seul nom de domaine (canonique : à confirmer par l'humain, leggendo.fr vs .app) dans Legal/Privacy/Terms ; corriger « elgendo.ch ».
- Critères : `grep -rn "elgendo" src/` vide ; `grep -rhoE "leggendo\.(fr|app|ch)" src/views/{Legal,Privacy,Terms}View.vue | sort -u` = un seul domaine.
- Risque : faible. DEP : humain décide du domaine ; D (sitemap/Caddyfile) utilise le même.

### PUSH-3 [P2] Écran explicatif : texte i18n et accessibilité
- Fichiers : src/App.vue
- Critères : rôle dialog, focus piégé, bouton « Plus tard ». Risque : faible.

(Tickets B : PUSH-1, PUSH-2, PUSH-3, LEG-1, LEG-2, LEG-3 = 6.)

---
## STREAM C - Croissance / UX / a11y (13 tickets)

### GRO-1 [P1] Annoncer l'essai de 10 jours
- Fichiers : src/views/HomeView.vue, src/components/ContentPaywall.vue (l.41), src/views/LoginView.vue
- Critères : bouton paywall « 10 jours de Premium IA offerts, sans carte » ; mention sur accueil et connexion ; `grep -rn "10 jours" src/views/HomeView.vue src/components/ContentPaywall.vue src/views/LoginView.vue` ≥ 3. DEP : texte aligné sur SEC-1 (essai après e-mail vérifié : le mentionner à l'inscription).
- Risque : faible.

### GRO-2 [P1] CTA « Commencer à lire »
- Fichiers : src/views/HomeView.vue (l.459)
- Travail : ouvre un texte A1 gratuit (slug fixe existant) ou le test de niveau, pas la bibliothèque. Critère : lien vers `/testo/<slug A1 gratuit>` ou `/test-de-niveau` ; le slug existe dans src/texts.
- Risque : faible.

### GRO-3 [P2] Page tarifs
- Fichiers : src/views/PricingView.vue
- Critères : « 2 mois offerts » sur l'annuel (valeur calculée depuis les prix), tableau de comparaison gratuit/Premium/Premium IA. Risque : faible.

### GRO-4 [P2] Relance fin d'essai (UI)
- Fichiers : src/views/ProfileView.vue ? NON (hors stream). Limiter à un bandeau dans HomeView.vue : « Il vous reste N jours d'essai » lisant trialEnd des claims. La relance e-mail/push J-3/J-1 est côté serveur : voir HUM-3.
- Critères : bandeau affiché si trialEnd dans <=3 jours. Risque : faible.

### UX-1 [P0] lang="it"
- Fichiers : src/views/ReaderView.vue (article ~l.724, libellés jeux), src/components/SceneLayout.vue (l.82), BooksView.vue, LibraryView.vue (titres italiens)
- Critères : `grep -n 'lang="it"' src/views/ReaderView.vue src/components/SceneLayout.vue` ≥ 2 ; le shell reste lang="fr". Risque : faible.

### UX-2 [P0] Accueil mobile 375x667
- Fichiers : src/views/HomeView.vue (l.1096-1183), src/style.css
- Travail : étendre `@media (max-height:640px)` à 700px ; plus de chevauchement de .home-screen fixed ; features-band lisible sur colline crème ; animation features 2,2 s -> 0,6 s ; « survol » (l.454) remplacé par « touchez » en tactile ; .float-wrap vs header à 1024px.
- Critères : captures 375x667, 390x844, 1024x768 sans chevauchement (vérif manuelle via Browser pane, redimensionnement puis reset desktop).
- Risque : moyen.

### UX-3 [P1] Contraste accent
- Fichiers : src/style.css (variable accent), HomeView.vue (l.397/459 .btn-hero), ReaderView.vue (l.1202 .punct), SiteHeader.vue (lien actif)
- Critères : texte #faf6f0 sur nouvel accent ≈ #8f5220 : ratio ≥ 4,5:1 (calcul avec un script ad hoc local) ; plus aucune paire < 4,5:1 sur ces éléments.
- Risque : faible (changement visuel de marque, validation humaine).

### UX-4 [P1] Mots du lecteur accessibles
- Fichiers : src/views/ReaderView.vue (l.749)
- Critères : nom accessible = le mot ; consigne via aria-describedby unique ; lien d'évitement « Aller au quiz » ; roving tabindex. Test : navigation clavier Tab/flèches et lecture du tree (read_page).
- Risque : moyen.

### UX-5 [P1] Ponctuation orpheline en mobile
- Fichiers : src/views/ReaderView.vue (l.1199-1200 .punct)
- Critères : la ponctuation ne démarre jamais une ligne à 360 px (white-space/word-joiner ou inline au lieu d'inline-block). Risque : moyen (mise en page du lecteur).

### UX-6 [P1] Nav bilingue
- Fichiers : src/components/SiteHeader.vue (l.84-118)
- Critères : chaque libellé italien a une glose française (title/sous-libellé) ; page Méthode n'omet plus la nav (vérifier le layout de MethodView : si le fix est dans MethodView.vue, hors stream -> DEP signalée, ne pas modifier ; à reporter dans SiteHeader seulement).
- Risque : faible.

### UX-7 [P2] Typos et 404 routeur
- Fichiers : src/components/SceneLayout.vue (cause de « Classicidel » : titre + accent concaténés sans espace ; BooksView.vue:20 appelle title="Classici" accent="del dominio pubblico"), src/router.js (l.47-52)
- Critères : espace rendu entre title et accent ; texte inexistant => NotFoundView (pas /connexion) ; grep « Classicidel » dans le DOM rendu absent.
- Risque : faible.

### UX-8 [P2] Focus visible
- Fichiers : LibraryView.vue (l.666, 695), AboutView.vue (l.549), DictionaryView.vue (l.639)
- Critères : `grep -n "outline: *none"` sur ces fichiers n'apparaît plus sans :focus-visible de remplacement. Risque : faible.

### UX-9 [P2] Contrôles de vitesse du lecteur
- Fichiers : ReaderView.vue (l.663) - critère : non coupés à 320 px. Libellés de jeux bilingues : composants games/* hors stream, limiter aux libellés dans ReaderView ; le reste = backlog futur. Risque : faible.

### UX-10 [P2] Refactor des vues > 1000 lignes
- Hors priorité ; à ne faire qu'après les autres tickets C (mêmes fichiers). Extraire sous-composants sans changement visuel.

(Tickets C : GRO-1..4, UX-1..10 = 14.)

### Statut STREAM C (2026-10-11, aucun commit)
- GRO-1 FAIT : « 10 jours de Premium IA offerts, sans carte » sur HomeView, ContentPaywall (bouton « Commencer mes 10 jours offerts ») et LoginView (inscription : après vérification e-mail). Essai sans carte confirmé par README_TARIFICATION.md l.25-33. Preuve : texte vu dans le navigateur (/, /testo/a_scuola, /connexion mode inscription).
- GRO-2 FAIT : CTA -> /testo/marco (1er A1 de EXAMPLE_TEXTS = aperçu gratuit visiteur, calculé dynamiquement ; repli /test-de-niveau). Vérifié href="/testo/marco".
- GRO-3 FAIT : badge « 2 mois offerts » (calculé depuis les prix) + tableau comparatif Gratuit/Premium/Premium IA. Vérifié sur /abonnement (annuel : 3 badges).
- GRO-4 FAIT (code, non testé avec un vrai compte en essai) : bandeau si getTrialInfo().daysRemaining <= 3.
- UX-1 FAIT : lang="it" sur h1 SceneLayout, article et bouton quiz de ReaderView. DEP : vues avec titre français (VocabularyView, DeleteAccountView, LevelTestView) héritent aussi lang="it" sur le h1.
- UX-2 FAIT : media max-height 700px, features-band fond brun sur mobile, animation 0,6 s, « toucher ». Captures 375x667, 375x812, 1024x768 : pas de chevauchement.
- UX-3 FAIT : #b0692e -> #8f5220 (5,74:1 sur #faf6f0 ; 5,95:1 sur #fffaf3), hover #74411a (7,76:1) dans les fichiers du stream. DEP : QuizSection, CorrectionRetry, IndovinaLivelloGame utilisent encore #b0692e (hors stream).
- UX-4 FAIT : mots aria-label = le mot, aria-describedby unique, lien « Aller au quiz », roving tabindex + flèches/Home/End (1 seul tabindex=0 vérifié).
- UX-5 FAIT : .punct en display:inline (plus de ponctuation en début de ligne, vérifié à 375 px).
- UX-6 PARTIEL : title (glose FR) + lang="it" sur les libellés italiens ; pas de glose visible en tactile ; MethodView hors stream.
- UX-7 FAIT : « Classici del dominio pubblico » (espace) ; /testo/<inconnu> non connecté -> not-found (risque : lien direct vers un texte privé non connecté donne 404 au lieu de /connexion).
- UX-8 FAIT : outline:none remplacé par un anneau visible (Library, About, Dictionary).
- UX-9 PARTIEL : barre de vitesse déjà en flex-wrap, non coupée à 375 px ; 320 px non testé.
- UX-10 NON FAIT (risque, volontairement différé).
- CustomEvent 'leggendo:text-completed' {detail:{id}} émis dans ReaderView#onQuizCompleted (quand le score >= total-1, au marquage « lu »).
- CON-6 : ReaderView supporte le champ optionnel `ttsParagraphs` (tableau de strings, même découpage en phrases que `paragraphs`) pour l'audio ; rétrocompatible, karaoke désactivé pour les phrases dont le texte parlé diffère.
- Tests : `npx vitest run` -> 17 fichiers, 270 tests verts.

---
## STREAM D - SEO / performance (10 tickets)

### SEO-1 [P1] Caddyfile versionné, soft 404, cache
- Fichiers : Caddyfile (nouveau, racine ; ne pas déployer), scripts/prerender.mjs (l.633 commentaire .htaccess ; génération spa.html), vite.config.js si besoin
- Travail : prerender génère `dist/spa.html` (shell vide) ; Caddy : try_files {path} {path}/index.html /spa.html pour les routes app ; `handle /testo/* /dizionario/* /coniugazione/* /classici/*` => file_server puis `respond 404` + 404.html avec statut 404 quand le fichier prérendu n'existe pas ; Cache-Control : `/assets/*` immutable 1 an, `sw.js` et `index.html` no-cache, sitemap/robots/llms court. Reproduire la config existante du VPS d'après VPS.md (lire VPS.md ; marquer ce qui est supposé en commentaire `# A VERIFIER`).
- Critères : `caddy validate --config Caddyfile` (si caddy local) ou revue ; `ls dist/spa.html` après build ; commentaire corrigé (`grep -n htaccess scripts/prerender.mjs` vide).
- Risque : élevé en prod, nul tant que non déployé. Déploiement = humain (HUM-1).
- **STATUT : FAIT (non déployé, non validé par `caddy validate` : Caddy absent en local)** — `Caddyfile` créé (repli /spa.html, 404 réelle via handle_errors, cache immutable/no-cache, noindex sur routes dynamiques ; lignes supposées marquées `# A VERIFIER`). `dist/spa.html` généré (build dev OK) ; `grep htaccess scripts/prerender.mjs` vide. Écart volontaire : /testo/*, /dizionario/*, /coniugazione/* servent spa.html + `X-Robots-Tag: noindex` (et non 404) quand la page prérendue n'existe pas, car ces routes portent aussi des textes personnels et ~11 000 fiches non prérendues ; 404 réelle pour tout le reste (dont /classici/* inconnu).

### SEO-2 [P1] Pages vides dans le HTML prérendu
- Fichiers : scripts/prerender.mjs (l.333-446), src/seo/staticPages.js
- Travail : contenu textuel statique (h1, intro, sections) pour methodologie, test-de-niveau, giochi, contact, conditions, confidentialite, mentions-legales, deleteAccount. DEP : conditions/confidentialite reflètent B (ne pas dupliquer de texte juridique : résumé + lien).
- Critères : après `npm run build`, pour chaque page `dist/<page>/index.html` contient ≥ 150 mots visibles (script : strip tags | wc -w).
- Risque : faible.
- **STATUT : FAIT** — contenu dans `src/seo/staticContent.js`. Mots visibles (hors nav/pied) avant -> après : methodologie 0->398, test-de-niveau 0->239, giochi 0->236, contact 0->180, conditions 0->205, confidentialite 0->210, mentions-legales 0->182, deleteAccount 0->156 (tous >= 150). Pages légales = résumé + liens, sans clause recopiée. Pages enregistrées en `dist/<page>.html` (convention existante), pas `<page>/index.html`.

### SEO-3 [P1] /dizionario dans staticPages et sitemap
- Fichiers : src/seo/staticPages.js, scripts/generate-sitemap.mjs
- Critères : `grep -c "/dizionario</loc>" dist/sitemap.xml` = 1 ; dist/dizionario/index.html existe. Risque : faible.

### SEO-4 [P1] Liens du prérendu corrigés
- Fichiers : scripts/prerender.mjs (l.581 « ← Dizionario » -> /dizionario ; l.559 inDefinedTermSet -> /dizionario)
- Critères : `grep -n "/verbi" scripts/prerender.mjs` ne reste que là où légitime. Risque : faible.

### SEO-5 [P2] Contenu des pages texte/chapitres minces
- Fichiers : scripts/prerender.mjs, scripts/generate-sitemap.mjs
- Travail : ajouter résumé, vocabulaire clé, premières phrases au prérendu des 460 textes ; chapitres payants (79, ≈54 mots) : même enrichissement ou retrait du sitemap (choisir : noindex+retrait si pas de contenu).
- Critères : médiane de mots par page texte ≥ 150 (script) ou absence du sitemap. Risque : moyen (volume de build).

### SEO-6 [P2] Maillage interne
- Fichiers : scripts/prerender.mjs (withBody())
- Critères : chaque page prérendue contient un header nav + footer statiques (≥ 8 liens internes) ; accueil > 2 liens. Risque : faible.

### PERF-1 [P2] Précache PWA allégé
- Fichiers : vite.config.js (l.172), public/audio-test.html
- Critères : précache < 1 Mo (hors audio) ; DialogoParloView (443 Ko) en runtime caching ; audio-test.html supprimé de public ; build + `npx workbox` entries en baisse (lire dist/sw.js). Risque : moyen (offline).

### PWA-1 [P2] Manifest et icônes
- Fichiers : vite.config.js (l.156), public/manifest.webmanifest (supprimer), public/ (icônes 192/512/maskable : générer depuis icons/ ou assets/ si source disponible, sinon HUM)
- Critères : manifest généré contient icônes PNG 192, 512, maskable ; `ls public/manifest.webmanifest` absent. Risque : faible.

### SEO-7 [P2] lastmod et og:type
- Fichiers : scripts/generate-sitemap.mjs, scripts/prerender.mjs
- Critères : `<lastmod>` présent dans toutes les URL ; og:type `article` sur textes/chapitres. Risque : faible.

### SEO-8 [P2] Test de non-régression SEO
- Fichiers : scripts/check-build-leaks.mjs (existant, étendre) - critères : vérifie pages vides, canonical, spa.html. Risque : nul.

(Tickets D : SEO-1..8, PERF-1, PWA-1 = 10.)

---
## STREAM E - Contenu pédagogique (8 tickets)

### CON-1 [P0] Script de contrôle de niveau
- Fichiers : scripts/check-levels.mjs (nouveau)
- Travail : lit src/texts/*.json ; A1 <=150 mots ; A2 <=260 ; détecte temps interdits par niveau (A1 : imparfait, passé composé/passato prossimo, subjonctif ; A2 : subjonctif imparfait) par heuristiques (terminaisons, auxiliaires) ; sortie liste + code retour 1 en mode `--strict`, 0 par défaut (baseline connue).
- Critères : `node scripts/check-levels.mjs` liste festa_in_piazza, artista_di_strada, diario_del_gladiatore, primo_lavoro_estivo ; `node scripts/check-levels.mjs --json` valide. DEP : script npm "check:levels" à ajouter par A dans package.json (HUM/A, ne pas toucher soi-même).
- Risque : nul.
- **STATUT : FAIT** — `scripts/check-build-leaks.mjs` étendu : spa.html, pages statiques non vides (erreur < 50 mots, avertissement < 150), canonical de chaque page (877), sitemap (lastmod, /dizionario, page prérendue par URL). Avertissements restants : `/` (82 mots) et `/verbi` (147).
- **Statut (stream E, 2026-10-11) : TERMINÉ.** scripts/check-levels.mjs créé (rapport par défaut, code 0 ; `--strict` => 1 ; `--json` valide ; `--level`). Preuve : `node scripts/check-levels.mjs` liste festa_in_piazza, artista_di_strada, primo_lavoro_estivo (puis, après CON-3, plus ce dernier) et diario_del_gladiatore (longueur) ; état actuel : A1 27/91 hors norme (17 trop longs, 17 avec temps interdits), A2 0/85, B1-C2 0. `--strict` => code 1 tant que la baseline A1 n'est pas traitée. DEP A : script npm `check:levels` à ajouter dans package.json (non touché).**

### CON-2 [P1] Découper les A1 longs (~20 textes de 450-620 mots) en épisodes
- Fichiers : src/texts/<A1 concernés>.json (liste produite par CON-1), nouveaux fichiers d'épisodes ; l'index/registre éventuel de textes est généré (vérifier scripts/sync-content.mjs avant : s'il faut modifier un fichier hors E, le noter en DEP, ne pas le modifier).
- Critères : A1 ≤150 mots par texte, audio/quiz alignés ; `node scripts/check-levels.mjs` sans dépassement de mots A1 sur les fichiers traités. Risque : moyen (slugs/SEO/progression utilisateurs : conserver le slug du 1er épisode ; redirections = DEP D/C).
- **Statut (stream E, 2026-10-11) : NON TERMINÉ (volontairement).** Liste des A1 à découper/re-niveauter produite dans docs/audit-2026-10/A1-A-REVOIR.md (17 trop longs + 10 courts avec temps du passé) avec recommandation par texte ; aucune coupe automatique (slugs/SEO/audio : décision humaine). Aucun fichier hors E nécessaire pour l'instant**

### CON-3 [P1] Simplifier la grammaire A1/A2
- Fichiers : festa_in_piazza.json (l.13, 43), artista_di_strada.json, diario_del_gladiatore.json (présent narratif), primo_lavoro_estivo.json (l.12 subjonctif imparfait -> indicatif)
- Critères : check-levels sans temps interdit sur ces fichiers ; JSON valide (`node -e "JSON.parse(require('fs').readFileSync(f))"`). Traductions/quiz mis à jour. Risque : moyen (audio pré-généré à régénérer : HUM).
- **Statut (stream E, 2026-10-11) : PARTIEL.** primo_lavoro_estivo (subjonctif imparfait => « più del previsto ») et festa_in_piazza (imparfait et passé composé => présent) corrigés ; diario_corso_disegno (A2, subjonctif imparfait) corrigé en plus. Preuve : check-levels ne signale plus de temps interdit sur ces fichiers ; vérif structurelle OK. NON fait : artista_di_strada (imparfait narratif, 590 mots) et diario_del_gladiatore (594 mots, longueur) : trop longs pour être réécrits localement, voir A1-A-REVOIR.md (CON-2). Audio pré-généré à régénérer : HUM-1**

### CON-4 [P1] Cohérence narrative
- Fichiers : festa_in_piazza.json (l.41-42 NONNA deux fois, « Non preoccuparti » après incident clos), vacanza_al_mare.json (eau « fredda » puis « fresca »)
- Critères : relecture, un locuteur par réplique ; adjectif unique. Risque : faible.
- **Statut (stream E, 2026-10-11) : TERMINÉ.** festa_in_piazza : NONNA deux fois de suite supprimé (réplique de MARCO) et « Non preoccuparti » retiré ; vacanza_al_mare : « fredda » dans les deux répliques. Relecture native : HUM-4**

### CON-5 [P1] Calques / italien naturel
- Fichiers : festa_in_piazza.json (l.45, traduction :416 -> « andiamo a sentire la musica »), vacanza_al_mare.json (l.19 -> « Ci stavamo dimenticando la crema solare! », quiz l.74 cohérent), leonardo_vinci_bio.json (l.11 -> « in anticipo sui tempi » ; l.10 « gli apostoli »)
- Critères : grep des anciennes formules vide ; quiz/traduction cohérents. Relecture native requise (HUM-4). Risque : faible.
- **Statut (stream E, 2026-10-11) : TERMINÉ avec écart.** festa_in_piazza « andiamo a sentire la musica » (traduction mise à jour) ; leonardo_vinci_bio « in anticipo sui tempi » et « gli apostoli » ; vacanza_al_mare : la suggestion « Ci stavamo dimenticando la crema solare » (stavamo + gérondif = imparfait progressif) viole la règle A1 ; remplacée par « Non dimentichiamo la crema solare » et quiz adapté (voir A1-A-REVOIR.md). Relecture native : HUM-4**

### CON-6 [P2] Nombres : chiffres affichés, lettres à l'audio
- Fichiers : src/texts/dante.json (l.8) ; si le champ TTS séparé n'existe pas, utiliser un champ `tts`/`speak` seulement si déjà supporté par le lecteur (sinon DEP C/A : ne pas modifier ReaderView).
- Critères : texte affiché en chiffres, audio inchangé. Risque : moyen.
- **Statut (stream E, 2026-10-11) : NON APPLIQUÉ (DEP C).** Constat : les textes écrivent les nombres en toutes lettres par convention (pour le TTS) et ReaderView n'a aucun champ `audio`/`tts`/`speak`. Changer dante.json en chiffres modifierait la TTS : non fait. Proposition rétrocompatible : champ optionnel `audio` (tableau de même longueur que `paragraphs`, ou objet {indexParagraphe: texte}) contenant la version lue ; si absent, le lecteur lit `paragraphs[i]`. Dès que ReaderView (stream C) lit `audio`, dante.json pourra afficher « 1265 » / « 700 » et garder les lettres dans `audio`**

### CON-7 [P2] Niveaux C1/C2 et générateur
- Fichiers : scripts/generate-text.mjs (l.40 DEFAULT_WORDS), poesia_approdo.json, poesia_dolomiti.json
- Critères : DEFAULT_WORDS inclut C2 et courbe progressive (A1 90, A2 ~150, B1 ~250…, pas de saut brutal) ; `grep -n "C2" scripts/generate-text.mjs` ; prompt du générateur contient la liste des temps autorisés par niveau ; textes poésie étoffés. Aucun appel d'API en test (mode `--dry-run` si dispo).
- Risque : faible.
- **Statut (stream E, 2026-10-11) : PARTIEL.** scripts/generate-text.mjs : DEFAULT_WORDS progressif (A1 90, A2 140, B1 200, B2 260, C1 320, C2 380), niveau C2 pris en charge (enum du schéma étendu localement, schema.mjs étant hors périmètre), consigne de temps par niveau + « A1 = présent uniquement », option `--dry-run`. Preuve : `node scripts/generate-text.mjs --id x --level C2 --topic t --dry-run`. NON fait : étoffer poesia_approdo.json / poesia_dolomiti.json (poésie : à confirmer avec un éditeur humain)**

### CON-8 [P2] Suivi pédagogique (spécification seulement)
- Fichiers : aucun fichier de code ; produire une note dans ce backlog sous forme de tickets futurs : révision espacée au-delà des favoris, suivi des mots cliqués, métrique pour la promesse « 95 % », jeu CheGenereGame. Hors exécution parallèle (touche des fichiers C/A).
- **Statut (stream E, 2026-10-11) : NON TRAITÉ (spécification seulement, hors exécution).** **

(Tickets E : CON-1..CON-8 = 8.)

---
## Tickets humains (hors périmètre agents)
- HUM-1 Déploiement : build, Firebase Functions, VPS leggendo-server, Caddyfile sur le VPS, régénération audio après CON-3.
- HUM-2 Republication Play Store / App Store (Capacitor 8.5.1), relecture native des écrans push (PUSH-2) et de l'accueil mobile.
- HUM-3 Fournisseur d'e-mails pour relances fin d'essai J-3/J-1 et revertExpiredTrials non silencieux (choix du fournisseur, domaine d'envoi, SPF/DKIM) ; côté code serveur, ticket futur.
- HUM-4 Relecture par un natif italien des textes modifiés (CON-3 à CON-5).
- HUM-5 Relecture juridique (LEG-1, LEG-2), choix du domaine canonique (LEG-3), vérification que le compte admin a un e-mail vérifié (SEC-9).
- HUM-6 Rotation éventuelle de clés si le dépôt ou les logs en contenaient.

## Règle impérative
Aucun commit, aucun déploiement, aucun appel en écriture vers Firebase/production. Émulateurs et mocks uniquement. Un agent ne modifie jamais un fichier hors de son stream : en cas de besoin, il le note comme DEP dans son compte rendu.

## Conflits résiduels
- package.json : seul A ; E (script check:levels) et tout autre stream demandent à A.
- ReaderView.vue (C) : événement de fin de texte pour PUSH-2 (B) et champ TTS pour CON-6 (E) = DEP à C.
- Domaine canonique : B décide, D réutilise.
- Slugs des A1 découpés (CON-2) : redirections/sitemap à répercuter par D (prerender/sitemap généré automatiquement depuis src/texts, donc normalement sans conflit).
- MethodView.vue, ProfileView.vue, src/components/games/* ne sont dans aucun stream (hors périmètre).

---
## Statut STREAM B (push client + légal) - 2026-10-11
- LEG-1 : FAIT (à relire par juriste). PrivacyView réécrite : GA4/Firebase Analytics, FCM, Stripe/Google Play/Apple, DeepSeek (défaut) + GLM/Kimi, transferts hors CH/UE, conservation, droits. `grep -in "aucun suivi"` vide ; grep des 4 termes : 4 lignes. Base légale GA4 (pas de bandeau de consentement dans le code) signalée en commentaire HTML.
- LEG-2 : FAIT (à relire par juriste). TermsView : essai 10 j sans carte, tarifs, résiliation par canal (Play/Apple/Stripe), rétractation UE 14 j, limitation IA. NB : aucune résiliation Stripe en libre-service n'a été trouvée dans ProfileView, donc le texte renvoie à l'e-mail.
- LEG-3 : FAIT. « elgendo.ch » -> leggendo.fr ; un seul domaine (leggendo.fr) dans Legal/Privacy/Terms. `leggendo.app` n'existe pas ; `com.leggendo.app.*` (iap.js) = identifiants produits Apple, laissés. appId réel : ch.loicberthod.leggendo. L'hébergeur Infomaniak de leggendo.fr n'est pas vérifiable (commentaire dans LegalView).
- PUSH-1 : FAIT côté push.js (removeAllListeners avant register, un seul jeu de listeners, fcmTokens borné à 10 via nextTokens, `removeCurrentDeviceToken()` = arrayRemove). Tests : src/lib/push.test.js (14 tests verts). DEP (hors stream) : `logout()` de src/lib/auth.js doit faire `await removeCurrentDeviceToken()` (import dynamique de ./push.js) AVANT signOut ; sans cela le jeton n'est pas retiré.
- PUSH-2 : FAIT côté push.js/App.vue. Demande système uniquement dans acceptPrompt(), après écran explicatif ; refus mémorisé 30 j (localStorage). DEP stream C : ReaderView.vue doit émettre `window.dispatchEvent(new CustomEvent('leggendo:text-completed'))` à la fin d'un texte.
- PUSH-3 : FAIT. Dialog role="dialog" aria-modal, titre/description liés, focus piégé, Échap, bouton « Plus tard ». Texte en français en dur (pas de système i18n dans l'app).
- Tests : `npx vitest run` -> 17 fichiers, 270 tests verts. Vérification visuelle native (HUM-2) non faite.

---
## Intégration (2026-10-11, aucun commit)
- ESSAI : FAIT. src/lib/trial.js (+ trial.test.js) ; auth.js appelle le callable `startTrial` à chaque changement d'état d'auth et après `refreshEmailVerified()` si e-mail vérifié, sans essai/formule dans les claims, puis `getIdToken(true)`. Refus définitifs (already-exists / failed-precondition) mémorisés par uid en localStorage ; erreurs réseau = simple warn, retentées au chargement suivant. Après inscription, redirection vers le profil dont l'encart de vérification d'e-mail explique que l'essai démarre à la confirmation. Textes Login/Accueil/Paywall : mention « après vérification de l'e-mail ».
- PUSH-1 : FAIT. logout() fait `await removeCurrentDeviceToken()` (try/catch) avant signOut.
- Achats Play : PARTIEL. billing.js pose `store.applicationUsername = () => uid` (cordova-plugin-purchase 13.18 : obfusqué puis envoyé comme obfuscatedAccountId Play ; ignoré si non supporté). Le payload du callable N'ENVOIE PAS `obfuscatedExternalAccountId` : le hash du plugin ne correspond pas à ce que checkPlayAccount accepte (uid clair ou SHA-256) => risque de permission-denied. À faire (stream A) : lire l'obfuscatedAccountId renvoyé par l'API Play (purchases.subscriptionsv2 externalAccountIdentifiers) et le comparer, au lieu de se fier au client. À valider sur un build Android.
- lang : FAIT. Prop `titleLang` (défaut 'it') ; 'fr' sur VocabularyView, DeleteAccountView, LevelTestView.
- Événement `leggendo:text-completed` : OK, nom identique (ReaderView émet, push.js écoute via TEXT_COMPLETED_EVENT ; App.vue affiche pushPromptVisible).
- Couleur : #b0692e -> #8f5220 dans les composants/jeux (hors dégradé de colline du décor SceneLayout et commentaire NativeTabBar).

---
## Correctifs post-vérification (SEO/contenu) - 2026-10-11
- Caddyfile : HSTS retiré ; CSP en `Content-Security-Policy-Report-Only` (durcissement documenté en tête) ; `Content-Type application/manifest+json` pour /manifest.webmanifest ; bloc www.leggendo.fr supprimé (redirection déjà en prod, sinon « ambiguous site definition ») ; `not file {path}.html` (forme courte du matcher file) remplace `not file { try_files ... }` ; instructions de déploiement en tête (insérer seulement le bloc leggendo.fr, `caddy validate` puis `systemctl reload caddy`, jamais restart, lignes `# A VERIFIER`). Syntaxe relue à la main : `caddy` n'est pas installé, non exécutée.
- staticPages.js : descriptions propres (152-160 caractères) pour /contact, /conditions, /confidentialite, /mentions-legales ; prerender.mjs les utilise via `route.description`.
- Service worker : navigateFallback laissé sur /index.html. spa.html est écrit par prerender.mjs APRÈS `vite build` (qui génère le precache) : il ne serait pas dans le precache, donc le repli hors ligne échouerait. Pour le faire : `additionalManifestEntries` + revision, à tester sur un vrai SW.
- Accueil et /verbi : contenu statique ajouté dans prerender.mjs (accueil ~270 mots, /verbi ~290 mots mesurés dans la copie de build) ; check-build-leaks OK.
- check-levels.mjs : imparfait dès 1 caractère, passé simple en -ò (voir A1-A-REVOIR.md) ; chiffres A1 mis à jour.
- scripts/lib/schema.mjs : C2 ajouté à LEVELS ; contournement local de generate-text.mjs supprimé.
- festa_in_piazza.json : « Guarda, ho un premio! » (traduction, glose « vinco » supprimée). Audio de cette phrase à régénérer (HUM-1).
- À faire à la main : `git rm public/audio-test.html public/manifest.webmanifest` (non exécuté par les agents) ; déploiement Caddy ; régénération audio.

---
## Correctifs post-vérification (serveur) (2026-10-11, aucun commit)
- Achats Play (bloquant) : le plugin obfusque applicationUsername en md5(uid) hex (obfuscator 'legacy', store.js ~2166). `checkPlayAccount` accepte désormais uid, sha256(uid) et md5(uid) ; test avec la valeur réellement produite par `Utils.md5('u1')` du plugin. Achat sans identifiant de compte (ancien client) : accepté, protégé par la liaison jeton<->uid (`claimPurchase`). Commentaire de billing.js corrigé. À valider sur un build Android réel.
- Essai : `startTrial` refuse si `'trialEnd' in claims` (anciens essais sans trialGrants/trialEmails, y compris trialEnd null). Test ajouté.
- deleteAccount : supprime les `purchaseTokens` de l'uid (`deletePurchaseTokensFor`), conserve trialGrants/trialEmails. Test ajouté (fake-db : batch/delete).
- Push : le titre du texte n'est plus dans la notification (leggendo-server/notif.mjs : « Votre texte est prêt. »), le tap ouvre /mes-textes par type, sans lien nominatif. Test ajouté.
- Purge de rattrapage du jeton push (item 5) : NON FAIT, limite documentée. Les règles interdisent au client d'écrire dans users/{autre uid}, donc à la connexion d'un compte B on ne peut pas retirer le jeton du doc de A. Si le retrait au logout échoue hors ligne, le jeton reste dans users/A.fcmTokens et l'appareil peut recevoir les notifications de A ; seul le contenu générique (point précédent) limite la fuite. Piste : callable serveur retirant un jeton donné de tout doc l'ayant (à faire si besoin).
- Règles Firestore : cas ajoutés (écriture client de role/premium/trialEnd refusée, écriture sur le doc d'un autre uid refusée). `npm run test:rules` NON exécutable ici : Java absent (« Unable to locate a Java Runtime »), l'émulateur Firestore en dépend. Tests de règles non exécutés.
- Tests réels : functions 52/52, leggendo-server 136/136, vitest racine 278/278.

---
## Correctifs post-vérification (front) - 2026-10-11
- ESSAI : harmonisé = 10 jours après vérification de l'e-mail, 3 générations (TRIAL_PREMIUM_CREDITS = 3, leggendo-server/quota.mjs). Modifiés : PricingView (tableau « 3 crédits d'essai », bandeau, ligne du plan Gratuit reformulée à l'affichage via displayFeature), HomeView, LoginView, ContentPaywall, ProfileView, TermsView (vérification d'e-mail + 3 crédits, commentaire A VERIFIER retiré), README_TARIFICATION.md. RESTE : la source de la ligne « Une génération IA d'essai après inscription » est src/lib/stripe.js:126 (hors périmètre) ; à reformuler là puis supprimer displayFeature.
- CONTRASTE (avant -> après) : liens footer 3,85 -> 4,96 (#f3ebdf sur #8a5a2b) ; copyright 2,59 -> 4,76 ; pastilles A2 4,41 -> 5,78, B1 4,40 -> 6,06, B2 3,76 -> 5,47 ; « Gratuit » /classici -> ~5,9 (#2f5f40) ; kicker /methode 3,32 -> 4,61 (pire cas du dégradé) ; bandeau d'accueil : fond brun propre (bureau + mobile), texte >= 7:1, icônes #8f5220 sur #faf6f0 = 5,74.
- STRUCTURE : <main id="main"> dans App.vue + lien « Aller au contenu » (fixed, visible au focus). Vérifié : accueil, lecteur, méthode, connexion, abonnement sans débordement horizontal.
- LANG/ARIA : h1 Abbonamenti lang="it" ; popup de mot role="dialog" + aria-label, .original lang="it" (bouton audio lang="fr").
- MINEURS : cibles >= 24 px (footer, « Passez à Premium », e-mails .page, retours), lien Classici stylé, .compare sans débordement à 375 px (table-layout fixed).
- NON TRAITÉ (volontaire) : la 404 qui met location à « / » dépend du router et du Caddy (fallback SPA), pas du front Vue ; commentaires « A RELIRE PAR UN JURISTE » conservés.
- Non vérifié : focus visuel du lien d'évitement (le document de l'aperçu n'a pas le focus, :focus ne s'y applique pas).
