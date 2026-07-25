# Plan de correction après audit — Leggendo

Date de l'audit : 25 juillet 2026  
Statut : plan de travail proposé, aucune correction de code incluse dans ce document  
Périmètre : frontend Vue/PWA, Firebase Auth et Firestore, Cloud Functions Stripe/admin, API de génération sur VPS, qualité, sécurité et déploiement.

---

## 1. Objectif

Ce document transforme les constats de l'audit en feuille de route exécutable.

L'objectif final est de rendre Leggendo :

- conforme à la tarification définie dans `README_TARIFICATION.md` ;
- sûr du point de vue des droits d'accès et des données ;
- fiable face aux requêtes concurrentes et aux pannes ;
- testable automatiquement ;
- observable en production ;
- prêt à ouvrir les paiements sans vendre des fonctions inaccessibles ou laisser gratuitement accessibles des fonctions payantes.

Le lancement commercial ne doit avoir lieu qu'après validation de la **Definition of Done de lancement** décrite à la fin du document.

---

## 2. État constaté

### 2.1 Contrôles réussis

- Le build de production réussit.
- Le pré-rendu génère 470 pages.
- Les 27 tests de l'API VPS réussissent.
- L'audit des dépendances de production du frontend ne trouve aucune vulnérabilité connue.
- Les règles Firestore utilisent un refus global par défaut.
- Les tokens Firebase de l'API sont vérifiés avec `verifyIdToken`.
- La signature du webhook Stripe est vérifiée sur le corps brut.
- Les quotas et les jobs sont persistés dans Firestore.
- Le résultat d'un job n'est remis qu'à son propriétaire.

### 2.2 Bloqueurs identifiés

| ID | Gravité | Constat | Risque |
|---|---|---|---|
| AUD-01 | Critique | Tout compte connecté débloque le catalogue | Contournement complet du Premium |
| AUD-02 | Critique | Les classiques Premium IA sont servis publiquement | Fonction payante accessible gratuitement |
| AUD-03 | Critique | Stripe ne pose pas le rôle correspondant au produit acheté | Clients payants privés de leurs droits |
| AUD-04 | Critique | La vérification « un job actif » n'est pas atomique | Plusieurs générations simultanées et surcoût IA |
| AUD-05 | Haute | Un job bloqué est marqué en erreur sans remboursement | Perte injustifiée de crédits |
| AUD-06 | Haute | Tous les Payment Links sont vides | Paiement impossible |
| AUD-07 | Haute | `premium_plus` manque dans l'interface admin | Administration incorrecte des rôles |
| AUD-08 | Haute | La progression locale n'est pas isolée par UID | Mélange de données entre comptes |
| AUD-09 | Haute | Création de `userTexts` trop permissive | Données arbitraires écrites directement par le client |
| AUD-10 | Moyenne | Écriture libre de `users/{uid}` | Schéma de profil non protégé |
| AUD-11 | Moyenne | Pas de tests frontend, Functions ou règles Firestore | Régressions difficiles à détecter |
| AUD-12 | Moyenne | Vulnérabilités transitives dans l'API et les Functions | Dette de sécurité dépendances |
| AUD-13 | Moyenne | En-têtes HTTP de sécurité incomplets | Durcissement navigateur insuffisant |
| AUD-14 | Moyenne | Bundle Firebase volumineux et précache PWA de 9,1 Mio | Premier chargement et mise à jour coûteux |
| AUD-15 | Haute | Pas de suppression autonome du compte | Conformité et exploitation incomplètes |
| AUD-16 | Critique produit | Fonctions Enseignant promises mais non implémentées | Offre commercialement trompeuse si activée |

---

## 3. Principes de correction

1. Les droits payants doivent être déterminés côté serveur.
2. Le client peut masquer une fonction pour l'ergonomie, mais ne doit jamais être la seule barrière.
3. Stripe est la source de vérité de l'abonnement.
4. Firebase custom claims sert à appliquer rapidement les droits, mais l'état d'abonnement détaillé doit aussi être persisté.
5. Toute consommation de crédit doit être atomique avec la création du job.
6. Toute correction d'un parcours critique doit inclure ses tests.
7. Les paiements restent désactivés tant que les quatre offres affichées ne sont pas réellement livrables.
8. Les migrations doivent être réversibles ou accompagnées d'une procédure de retour arrière.

---

# Sprint 0 — Cadrage, matrice des droits et garde-fous

**But :** supprimer les ambiguïtés avant de modifier plusieurs couches du système.  
**Priorité :** bloquante.  
**Dépendances :** aucune.

## Sous-sprint 0.1 — Définir la matrice d'autorisation

Créer une source de vérité explicite pour :

| Fonction | gratuit | premium | premium_plus | enseignant |
|---|:---:|:---:|:---:|:---:|
| Textes découverte | Oui | Oui | Oui | Oui |
| Catalogue complet | Non | Oui | Oui | Oui |
| Progression synchronisée | Non | Oui | Oui | Oui |
| Génération d'essai | 1 | Non | Non applicable | Non applicable |
| Crédits mensuels | 0 | 0 | 30 | 100 |
| Classiques adaptés | Non | Non | Oui | Oui |
| Notizie | Non | Non | Oui | Oui |
| Partage public | Non | Non | Non | Oui |
| Classes/dossiers | Non | Non | Non | Oui |
| Export PDF | Non | Non | Non | Oui |
| Statistiques de classe | Non | Non | Non | Oui |

### Tâches

- [ ] Créer un module partagé de hiérarchie des rôles.
- [ ] Éviter les comparaisons dispersées de chaînes de caractères.
- [ ] Définir des fonctions comme `hasCatalogAccess`, `hasAiAccess`, `canSharePublicly`.
- [ ] Documenter la différence entre contenu public, découverte, Premium et Premium IA.
- [ ] Décider si le catalogue reste embarqué dans la PWA ou est distribué depuis Firestore/API.

### Critères d'acceptation

- Une matrice unique permet de répondre à tous les cas d'accès.
- Chaque route et chaque opération serveur peut être reliée à une permission précise.
- Aucun rôle supérieur ne perd les droits du rôle inférieur.

## Sous-sprint 0.2 — Décider le niveau réel de protection du catalogue

Le catalogue est actuellement compilé en chunks JavaScript. Un garde de route améliore l'expérience, mais ne constitue pas une protection commerciale forte : les assets peuvent être récupérés directement.

### Option recommandée

- Garder uniquement les textes découverte dans le bundle public.
- Stocker ou servir les textes Premium depuis Firestore, Cloud Storage ou une API authentifiée.
- Protéger la lecture avec les custom claims.
- Définir une stratégie hors ligne : téléchargement autorisé après contrôle d'accès, cache local révocable au mieux sans promettre une DRM parfaite.

### Critères d'acceptation

- Un visiteur ou compte gratuit ne peut pas télécharger un texte Premium depuis une URL d'asset publique.
- Un compte Premium peut lire et mettre en cache les textes autorisés.
- La documentation marketing décrit honnêtement le fonctionnement hors ligne.

## Sous-sprint 0.3 — Geler le lancement commercial

- [ ] Conserver les Payment Links vides pendant les corrections.
- [ ] Afficher clairement « bientôt disponible ».
- [ ] Ne pas annoncer comme disponibles les fonctions Enseignant encore absentes.
- [ ] Créer une checklist de validation avant activation.

---

# Sprint 1 — Corriger les droits d'accès frontend et backend

**But :** rendre effectifs les niveaux Gratuit, Premium, Premium IA et Enseignant.  
**Priorité :** critique.  
**Dépendances :** Sprint 0.

## Sous-sprint 1.1 — Catalogue Gratuit/Premium

Fichiers concernés :

- `src/lib/access.js`
- `src/router.js`
- `src/views/LibraryView.vue`
- `src/views/ReaderView.vue`
- stockage futur des contenus Premium

### Tâches

- [ ] Remplacer « connecté = débloqué » par une vérification du rôle.
- [ ] Autoriser les exemples gratuits sans connexion.
- [ ] Autoriser le catalogue complet à `premium`, `premium_plus` et `enseignant`.
- [ ] Afficher un écran d'abonnement aux comptes gratuits.
- [ ] Ne pas faire dépendre la sécurité uniquement du routeur Vue.
- [ ] Forcer le rafraîchissement du token après modification de rôle.

### Tests

- [ ] Visiteur : uniquement les exemples.
- [ ] Gratuit connecté : uniquement les exemples.
- [ ] Premium : catalogue complet.
- [ ] Premium IA : catalogue complet.
- [ ] Enseignant : catalogue complet.
- [ ] Token expiré ou claim absent : retour au niveau gratuit.

### Critères d'acceptation

- Créer un compte gratuit ne débloque plus le catalogue.
- Une requête directe vers un contenu Premium est refusée côté serveur.
- Le parcours d'upgrade conserve l'URL demandée.

## Sous-sprint 1.2 — Classiques Premium IA

Fichiers concernés :

- `src/router.js`
- `src/views/BooksView.vue`
- `src/views/BookReaderView.vue`
- `src/books/**`

### Tâches

- [ ] Restreindre `/classici` et `/classici/:bookId/:chapterId`.
- [ ] Vérifier le rôle `premium_plus` ou `enseignant`.
- [ ] Sortir les chapitres Premium du bundle public.
- [ ] Prévoir un aperçu public éventuel clairement identifié.
- [ ] Ajouter un écran d'upgrade pour Gratuit et Premium.

### Critères d'acceptation

- Les chunks complets des livres ne sont plus récupérables publiquement.
- Premium simple voit l'offre Premium IA sans pouvoir ouvrir les chapitres.
- Premium IA et Enseignant lisent les chapitres normalement.

## Sous-sprint 1.3 — Progression synchronisée

La tarification réserve la synchronisation au Premium et aux rôles supérieurs.

### Tâches

- [ ] Garder une progression locale pour Gratuit.
- [ ] N'activer la synchronisation Firestore que pour les rôles autorisés.
- [ ] Isoler le stockage local par UID.
- [ ] Au changement de compte, vider l'état réactif puis charger le bon espace local.
- [ ] Définir une migration pour l'ancien stockage global.
- [ ] Ne jamais fusionner automatiquement les données du compte A dans le compte B.

### Tests

- [ ] Connexion A, ajout de favoris, déconnexion, connexion B.
- [ ] Navigation hors ligne puis reconnexion.
- [ ] Upgrade Gratuit vers Premium.
- [ ] Downgrade Premium vers Gratuit sans perte de la copie locale.

---

# Sprint 2 — Stripe et cycle de vie des abonnements

**But :** associer chaque paiement au bon compte et au bon rôle pendant tout le cycle de vie.  
**Priorité :** critique.  
**Dépendances :** Sprints 0 et 1.

## Sous-sprint 2.1 — Modèle d'abonnement

Créer un document serveur, par exemple `subscriptions/{uid}`, contenant au minimum :

- `stripeCustomerId`
- `stripeSubscriptionId`
- `priceId`
- `role`
- `status`
- `currentPeriodStart`
- `currentPeriodEnd`
- `cancelAtPeriodEnd`
- `updatedAt`

### Tâches

- [ ] Définir la correspondance `priceId -> rôle`.
- [ ] Définir les prix mensuels et annuels de chaque formule.
- [ ] Conserver la devise réellement facturée.
- [ ] Ne jamais accepter le rôle envoyé par le client.
- [ ] Documenter les environnements Stripe test et production.

## Sous-sprint 2.2 — Création du Checkout

L'utilisation de Payment Links avec paramètres est simple, mais une Cloud Function de création de Checkout Session offre davantage de contrôle.

### Recommandation

Créer une Function callable ou HTTPS qui :

- vérifie l'utilisateur Firebase ;
- reçoit uniquement un identifiant de formule autorisé ;
- choisit elle-même le `priceId` ;
- crée ou retrouve le client Stripe ;
- renseigne `client_reference_id` et les métadonnées ;
- renvoie l'URL Stripe.

### Critères d'acceptation

- Le client ne peut pas injecter un autre prix ou rôle.
- Chaque session est rattachée à un UID Firebase.
- Les URLs de succès et d'annulation sont contrôlées.

## Sous-sprint 2.3 — Webhook idempotent

Événements à gérer au minimum :

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

### Tâches

- [ ] Déduire le rôle depuis le `priceId`.
- [ ] Poser `role` et `premium` ensemble.
- [ ] Stocker l'abonnement dans Firestore.
- [ ] Dédupliquer les événements avec leur `event.id`.
- [ ] Gérer les retries Stripe sans effets secondaires.
- [ ] Gérer upgrade, downgrade et changement mensuel/annuel.
- [ ] Définir la politique en cas d'impayé.
- [ ] Retirer les droits à la bonne date, pas nécessairement dès l'annulation.
- [ ] Journaliser les transitions sans données bancaires.

### Critères d'acceptation

- Un achat Premium IA produit `role=premium_plus`.
- Un achat Enseignant produit `role=enseignant`.
- Un événement rejoué ne modifie pas deux fois l'état.
- Une résiliation retire les droits à la fin de la période prévue.
- Un downgrade applique le bon rôle selon la politique définie.

## Sous-sprint 2.4 — Portail client Stripe

- [ ] Créer une session du Billing Portal côté serveur.
- [ ] Ajouter « Gérer mon abonnement » dans le profil.
- [ ] Afficher la formule, le statut et la prochaine échéance.
- [ ] Rafraîchir le token Firebase après une transition confirmée.

## Sous-sprint 2.5 — Tests Stripe

- [ ] Tests unitaires du mapping `priceId -> rôle`.
- [ ] Tests de signature invalide.
- [ ] Tests d'événements rejoués.
- [ ] Tests upgrade/downgrade.
- [ ] Tests annulation et impayé.
- [ ] Tests avec Stripe CLI en environnement de test.

---

# Sprint 3 — Fiabiliser les jobs et les crédits IA

**But :** éviter le double lancement, les crédits perdus et les dépenses incontrôlées.  
**Priorité :** critique.  
**Dépendances :** matrice des rôles.

## Sous-sprint 3.1 — Unicité atomique du job actif

Problème actuel : `activeJobFor()` est appelé avant `reserveJob()`. Deux requêtes simultanées peuvent passer le contrôle.

### Solution recommandée

Utiliser un document verrou déterministe, par exemple `activeGeneration/{uid}`, dans la même transaction que :

- la lecture et consommation du quota ;
- la création du job ;
- la création du verrou actif.

Le verrou contient `jobId`, `createdAt` et `status`. Il est supprimé ou remplacé atomiquement à la fin.

### Tests

- [ ] Deux réservations concurrentes du même UID : une seule réussit.
- [ ] Deux UID différents : les deux réussissent.
- [ ] Job terminé : une nouvelle réservation réussit.
- [ ] Verrou ancien : récupération contrôlée.

## Sous-sprint 3.2 — Remboursement fiable

- [ ] Centraliser la fin de job dans une fonction idempotente.
- [ ] Rembourser sur erreur technique.
- [ ] Rembourser lorsqu'un job dépasse `JOB_STUCK_MS`.
- [ ] Ne jamais rembourser deux fois.
- [ ] Distinguer erreur technique, annulation et erreur utilisateur.
- [ ] Stocker `creditCost`, `creditRefundedAt` et la raison.

### Critères d'acceptation

- Un job bloqué ne fait pas perdre de crédit.
- Un retry de nettoyage ne rembourse jamais deux fois.
- Les historiques permettent d'expliquer chaque mouvement.

## Sous-sprint 3.3 — Gestion robuste de la tâche de fond

- [ ] Inclure le passage `pending -> running` dans le bloc d'erreur.
- [ ] Éviter les promesses rejetées non gérées.
- [ ] Ajouter un arrêt gracieux du serveur.
- [ ] Définir un timeout global de génération.
- [ ] Récupérer les jobs `pending/running` au redémarrage ou les clôturer proprement.
- [ ] Ne pas stocker indéfiniment de gros résultats dans les documents de job.

## Sous-sprint 3.4 — Quotas alignés sur l'abonnement

La documentation indique un renouvellement à la date de renouvellement de l'abonnement, tandis que le code utilise actuellement le mois calendaire UTC (`YYYY-MM`).

### Tâches

- [ ] Choisir explicitement mois calendaire ou période Stripe.
- [ ] Recommandation : utiliser `currentPeriodStart/currentPeriodEnd` de Stripe.
- [ ] Migrer les quotas existants.
- [ ] Tester les changements de formule au milieu d'une période.
- [ ] Définir le comportement des crédits lors d'un upgrade/downgrade.

## Sous-sprint 3.5 — Limitation et protection des coûts

- [ ] Ajouter un rate limit par UID et par IP.
- [ ] Ajouter une limite de requêtes sur `/generate`.
- [ ] Ajouter App Check si compatible avec l'architecture.
- [ ] Alerter sur consommation rapide, taux d'échec et coût anormal.
- [ ] Ne plus journaliser l'adresse e-mail si l'UID suffit.

---

# Sprint 4 — Firestore, données utilisateur et confidentialité

**But :** réduire les écritures arbitraires et garantir l'intégrité des données.  
**Priorité :** haute.  
**Dépendances :** Sprint 1.

## Sous-sprint 4.1 — Écriture serveur des textes générés

### Recommandation

À la fin de la génération, l'API VPS écrit directement le texte final dans `userTexts/{id}` avec Admin SDK. Le client ne doit recevoir qu'un identifiant et lire le document autorisé.

### Avantages

- validation centralisée ;
- pas de falsification du contenu ou propriétaire ;
- pas de perte si le navigateur se ferme avant `saveUserText`;
- meilleure traçabilité.

### Critères d'acceptation

- Le client ne peut plus créer arbitrairement un texte complet.
- Le texte existe même si l'utilisateur ferme l'onglet pendant la génération.
- L'index personnel et le texte sont écrits atomiquement ou réconciliables.

## Sous-sprint 4.2 — Durcir `userTexts`

Si une écriture client reste nécessaire :

- [ ] Lister les champs autorisés.
- [ ] Valider les types.
- [ ] Borner les longueurs et nombres d'éléments.
- [ ] Imposer `public == false` à la création.
- [ ] Interdire tout changement de propriétaire.
- [ ] Interdire l'écrasement d'un document appartenant à autrui.
- [ ] Vérifier le rôle Enseignant pour activer le partage.

## Sous-sprint 4.3 — Durcir `users/{uid}`

Séparer si possible :

- `users/{uid}` pour les métadonnées contrôlées ;
- `users/{uid}/private/progress` ou document dédié pour la progression ;
- une collection/index dédiée pour les textes créés.

### Tâches

- [ ] Utiliser `diff().affectedKeys().hasOnly(...)`.
- [ ] Valider le schéma de progression.
- [ ] Borner les tableaux.
- [ ] Éviter un tableau `createdTexts` qui grandit sans limite.
- [ ] Utiliser une requête sur `userTexts where owner == uid` avec index approprié.

## Sous-sprint 4.4 — Suppression du compte

- [ ] Ajouter une action de suppression dans le profil.
- [ ] Demander une réauthentification récente.
- [ ] Supprimer ou anonymiser les données utilisateur.
- [ ] Supprimer les textes privés et liens publics.
- [ ] Annuler l'abonnement Stripe selon la politique affichée.
- [ ] Supprimer le compte Firebase Auth.
- [ ] Journaliser uniquement la réussite technique, sans conserver de données inutiles.
- [ ] Mettre à jour confidentialité et CGU.

## Sous-sprint 4.5 — Tests des règles

Créer des tests avec Firebase Emulator Suite pour :

- [ ] lecture gratuite ;
- [ ] lecture Premium ;
- [ ] lecture Notizie ;
- [ ] lecture d'un texte privé ;
- [ ] lecture d'un texte partagé ;
- [ ] création et modification de `userTexts` ;
- [ ] activation du partage par Enseignant uniquement ;
- [ ] écritures de profil autorisées et refusées.

---

# Sprint 5 — Fonctions Enseignant

**But :** rendre réelle l'offre à 24,90 €/mois avant de l'afficher comme disponible.  
**Priorité :** critique produit.  
**Dépendances :** Sprints 1 à 4.

## Sous-sprint 5.1 — MVP obligatoire

- [ ] Partage public activable/désactivable.
- [ ] Consultation sans compte.
- [ ] Identifiant de partage non devinable.
- [ ] Limitation aux comptes Enseignant.
- [ ] Compteur d'ouvertures non nominatif.

## Sous-sprint 5.2 — Classes et dossiers

- [ ] Créer, renommer et archiver un dossier ou une classe.
- [ ] Affecter un texte.
- [ ] Limiter à 10 classes actives.
- [ ] Définir la notion d'élève actif sans imposer de donnée nominative.
- [ ] Protéger les écritures avec règles ou Functions serveur.

## Sous-sprint 5.3 — Quiz et duplication

- [ ] Dupliquer un texte dans la bibliothèque personnelle.
- [ ] Modifier les questions sans modifier le texte source.
- [ ] Valider les tailles et formats.
- [ ] Conserver l'origine et la date de modification.

## Sous-sprint 5.4 — Export PDF

- [ ] Générer le PDF côté serveur ou via une méthode contrôlée.
- [ ] Inclure attribution, niveau, texte et quiz.
- [ ] Tester accents italiens/français et pagination.
- [ ] Éviter d'inclure des données privées dans une URL publique.

## Sous-sprint 5.5 — Statistiques minimales

- [ ] Ouverture.
- [ ] Lecture terminée.
- [ ] Quiz terminé.
- [ ] Score agrégé facultatif.
- [ ] Rétention limitée.
- [ ] Information claire dans la politique de confidentialité.

### Critère de décision

Si ces fonctions ne sont pas livrées, retirer temporairement la formule Enseignant de la page tarifaire au lieu de l'activer partiellement.

---

# Sprint 6 — Administration et exploitation

**But :** permettre une gestion correcte des quatre rôles et des incidents.  
**Priorité :** haute.

## Sous-sprint 6.1 — Tableau de bord des rôles

- [ ] Ajouter `premium_plus` aux libellés et statistiques.
- [ ] Afficher le rôle réel provenant des claims.
- [ ] Afficher le statut Stripe.
- [ ] Ajouter pagination au-delà de 1 000 comptes.
- [ ] Ne pas télécharger toute la collection `users` pour chaque page.

## Sous-sprint 6.2 — Changements manuels sûrs

- [ ] Demander confirmation avant un changement de rôle.
- [ ] Enregistrer qui a changé quoi et quand.
- [ ] Éviter qu'une modification manuelle soit immédiatement écrasée par Stripe sans explication.
- [ ] Prévoir un override temporaire explicite avec expiration.

## Sous-sprint 6.3 — Observabilité

- [ ] Logs structurés avec `jobId`, `uid`, statut et durée.
- [ ] Métriques de génération.
- [ ] Alertes sur taux d'échec.
- [ ] Alertes sur webhooks Stripe en échec.
- [ ] Alertes sur jobs bloqués.
- [ ] Tableau du coût estimé par formule et période.
- [ ] Politique de rétention des logs.

---

# Sprint 7 — Tests, CI et qualité

**But :** empêcher le retour des défauts critiques.  
**Priorité :** haute.  
**Dépendances :** à commencer tôt, compléter à chaque sprint.

## Sous-sprint 7.1 — Outillage

- [ ] Ajouter ESLint.
- [ ] Ajouter Prettier ou une convention équivalente.
- [ ] Ajouter un script `lint`.
- [ ] Ajouter un script de tests global.
- [ ] Ajouter un contrôle de versions Node.
- [ ] Envisager TypeScript progressivement pour les contrats critiques.

## Sous-sprint 7.2 — Tests frontend

Tester au minimum :

- [ ] matrice des rôles ;
- [ ] gardes de routes ;
- [ ] bibliothèque verrouillée/déverrouillée ;
- [ ] écran d'upgrade ;
- [ ] reprise de génération ;
- [ ] sauvegarde et synchronisation de progression ;
- [ ] changement de compte sur le même navigateur ;
- [ ] erreurs réseau.

## Sous-sprint 7.3 — Tests Cloud Functions

- [ ] autorisation admin ;
- [ ] mapping des rôles ;
- [ ] webhooks Stripe ;
- [ ] idempotence ;
- [ ] suppression de compte ;
- [ ] portail client.

## Sous-sprint 7.4 — Tests end-to-end

Scénarios critiques :

1. inscription gratuite ;
2. consultation d'un exemple ;
3. refus d'un texte Premium ;
4. achat Premium ;
5. accès catalogue ;
6. upgrade Premium IA ;
7. génération et débit de crédits ;
8. échec et remboursement ;
9. partage Enseignant ;
10. annulation puis retrait des droits.

## Sous-sprint 7.5 — CI

À chaque pull request :

- [ ] installation verrouillée avec `npm ci` ;
- [ ] lint ;
- [ ] tests frontend ;
- [ ] tests API ;
- [ ] tests Functions ;
- [ ] tests règles Firestore ;
- [ ] build ;
- [ ] audit de dépendances avec politique de sévérité ;
- [ ] vérification que le dépôt ne contient pas de secret.

---

# Sprint 8 — Dépendances et durcissement sécurité

**But :** réduire la surface d'attaque avant production.  
**Priorité :** moyenne à haute.

## Sous-sprint 8.1 — Vulnérabilités npm

État constaté :

- API VPS : 8 vulnérabilités modérées transitives liées à `uuid`.
- Cloud Functions : 9 vulnérabilités modérées transitives liées à `uuid`.

### Tâches

- [ ] Tester `firebase-admin` 14 dans une branche dédiée.
- [ ] Vérifier la compatibilité Node et Firestore.
- [ ] Mettre à jour les lockfiles.
- [ ] Relancer tous les tests.
- [ ] Ne pas utiliser aveuglément `npm audit fix --force`.
- [ ] Documenter les vulnérabilités acceptées temporairement.

## Sous-sprint 8.2 — En-têtes HTTP

Ajouter et tester :

- [ ] `Content-Security-Policy`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `Referrer-Policy`
- [ ] `Permissions-Policy`
- [ ] `Strict-Transport-Security` sur le domaine final HTTPS
- [ ] protection contre l'intégration en iframe via CSP `frame-ancestors`

La CSP doit autoriser explicitement Firebase, Stripe et l'API Leggendo nécessaires, sans utiliser des permissions trop larges.

## Sous-sprint 8.3 — API VPS

- [ ] Refuser les origines inconnues au lieu de répondre avec l'origine par défaut.
- [ ] Ajouter les en-têtes de sécurité pertinents.
- [ ] Ajouter limites de débit et délais.
- [ ] Limiter les informations du healthcheck public.
- [ ] Vérifier les permissions minimales du compte de service.
- [ ] Faire tourner le service avec un utilisateur système non privilégié.
- [ ] Ajouter une procédure de rotation des secrets.

## Sous-sprint 8.4 — Firebase

- [ ] Évaluer Firebase App Check.
- [ ] Vérifier les domaines Auth autorisés.
- [ ] Vérifier les quotas et alertes budgétaires.
- [ ] Tester les règles déployées contre les règles versionnées.
- [ ] Ne pas considérer l'API key Firebase cliente comme un secret ; protéger les ressources avec Auth, règles et App Check.

---

# Sprint 9 — Performance, PWA et expérience hors ligne

**But :** réduire le coût du chargement sans casser le fonctionnement hors ligne.  
**Priorité :** moyenne.

## Sous-sprint 9.1 — Mesure

- [ ] Mesurer Lighthouse mobile.
- [ ] Mesurer le bundle initial et les chunks Firebase.
- [ ] Mesurer la durée et le volume d'installation du service worker.
- [ ] Définir des budgets de performance.

État actuel observé :

- 641 entrées précachées ;
- environ 9,1 Mio de précache ;
- un chunk Firebase d'environ 675 Ko minifié ;
- avertissement Vite sur des imports statiques et dynamiques mélangés.

## Sous-sprint 9.2 — Découpage

- [ ] Corriger les imports qui empêchent le découpage réel de Firebase.
- [ ] Charger Analytics uniquement après consentement si nécessaire.
- [ ] Séparer Auth, Firestore et Functions par parcours.
- [ ] Éviter de précacher tout le catalogue Premium.

## Sous-sprint 9.3 — Stratégie hors ligne

- [ ] Précacher uniquement le shell et les exemples gratuits.
- [ ] Télécharger à la demande les contenus autorisés.
- [ ] Permettre à l'utilisateur de gérer les téléchargements.
- [ ] Afficher la taille et l'état hors ligne.
- [ ] Nettoyer les anciennes versions sans supprimer brutalement les données utilisateur.

---

# Sprint 10 — Conformité, contenu commercial et lancement

**But :** aligner l'application, la documentation et les promesses.  
**Priorité :** bloquante avant paiements.

## Sous-sprint 10.1 — Tarification

- [ ] Afficher la formule réelle du compte.
- [ ] Afficher la devise réellement facturée.
- [ ] Afficher les fonctionnalités uniquement lorsqu'elles sont livrées.
- [ ] Afficher les limites Enseignant.
- [ ] Clarifier le fonctionnement des crédits.
- [ ] Ajouter liens vers gestion et annulation.

## Sous-sprint 10.2 — Documents légaux

- [ ] Décrire Stripe et Firebase.
- [ ] Décrire les textes et quiz générés par IA.
- [ ] Décrire les statistiques Enseignant.
- [ ] Décrire la durée de conservation.
- [ ] Décrire la suppression du compte.
- [ ] Décrire les limites et erreurs possibles du contenu généré.
- [ ] Vérifier les obligations locales avec un professionnel compétent.

## Sous-sprint 10.3 — Recette de lancement

Effectuer une recette séparée pour :

- [ ] visiteur ;
- [ ] Gratuit ;
- [ ] Premium mensuel ;
- [ ] Premium annuel ;
- [ ] Premium IA mensuel ;
- [ ] Premium IA annuel ;
- [ ] Enseignant mensuel ;
- [ ] Enseignant annuel ;
- [ ] upgrade ;
- [ ] downgrade ;
- [ ] annulation ;
- [ ] paiement échoué ;
- [ ] suppression de compte.

---

## 4. Ordre d'exécution recommandé

```text
Sprint 0 — Matrice et architecture des droits
    ↓
Sprint 1 — Contrôles d'accès
    ↓
Sprint 2 — Stripe et abonnements
    ↓
Sprint 3 — Jobs et crédits
    ↓
Sprint 4 — Firestore et confidentialité
    ↓
Sprint 5 — Offre Enseignant
    ↓
Sprint 6 — Administration et observabilité
    ↓
Sprints 7–9 — Tests, sécurité et performance en continu
    ↓
Sprint 10 — Recette et lancement
```

Les tests du Sprint 7 ne doivent pas attendre la fin : chaque sprint fonctionnel doit ajouter les tests correspondant à ses critères d'acceptation.

---

## 5. Proposition de découpage temporel

La durée dépend de l'équipe et du niveau de finition attendu. Le découpage ci-dessous exprime surtout l'ordre et la taille relative.

| Itération | Contenu principal | Sortie attendue |
|---|---|---|
| Sprint A | Sprint 0 + accès catalogue | Gratuit/Premium correctement séparés |
| Sprint B | Classiques + progression par UID | Droits Premium IA cohérents côté client et serveur |
| Sprint C | Checkout + modèle abonnement | Paiements test rattachés aux comptes |
| Sprint D | Webhooks complets + portail | Cycle Stripe fiable |
| Sprint E | Verrou atomique + remboursements | Génération résistante à la concurrence |
| Sprint F | Règles Firestore + écriture serveur | Intégrité des données renforcée |
| Sprint G | MVP Enseignant | Offre Enseignant réellement livrable |
| Sprint H | CI, sécurité, dépendances | Base industrialisée |
| Sprint I | Performance, conformité, recette | Candidat au lancement |

---

## 6. Definition of Done par ticket

Un ticket n'est terminé que si :

- [ ] le comportement attendu est défini ;
- [ ] le code est implémenté ;
- [ ] les erreurs sont gérées ;
- [ ] les permissions serveur sont vérifiées ;
- [ ] les tests automatisés passent ;
- [ ] le build passe ;
- [ ] la documentation concernée est mise à jour ;
- [ ] les logs ne contiennent pas de secret ;
- [ ] la migration et le retour arrière sont documentés si nécessaires ;
- [ ] le comportement mobile et hors ligne est vérifié lorsqu'il est concerné.

---

## 7. Definition of Done du lancement commercial

Les paiements peuvent être activés uniquement si :

- [ ] Gratuit ne débloque pas le catalogue complet.
- [ ] Premium débloque le catalogue et la progression synchronisée.
- [ ] Premium IA reçoit réellement 30 crédits par période.
- [ ] Enseignant reçoit réellement 100 crédits et les fonctions annoncées.
- [ ] Les classiques ne sont pas publiquement récupérables.
- [ ] Stripe attribue le bon rôle selon le prix acheté.
- [ ] Upgrade, downgrade, annulation et impayé sont testés.
- [ ] Les webhooks sont idempotents.
- [ ] Deux requêtes concurrentes ne créent pas deux jobs actifs.
- [ ] Toute erreur technique remboursable rembourse exactement une fois.
- [ ] La progression de deux comptes ne se mélange pas.
- [ ] Les règles Firestore sont testées dans l'émulateur.
- [ ] La suppression du compte fonctionne.
- [ ] Les vulnérabilités connues ont été corrigées ou explicitement acceptées.
- [ ] Les en-têtes de sécurité sont déployés.
- [ ] La surveillance Stripe, génération et coûts est active.
- [ ] Les CGU, confidentialité et tarification correspondent au produit réel.
- [ ] Une recette complète des quatre rôles a été signée.

---

## 8. Vérifications techniques à exécuter à chaque jalon

```bash
# Frontend
npm ci
npm run lint
npm test
npm run build
npm audit --omit=dev

# API VPS
cd leggendo-server
npm ci
npm test
npm audit --omit=dev

# Cloud Functions
cd ../functions
npm ci
npm test
npm audit --omit=dev

# Firebase
firebase emulators:exec "<commande des tests de règles et d'intégration>"
```

Les scripts `lint` et certains scripts `test` mentionnés ici devront être ajoutés pendant le Sprint 7.

---

## 9. Risques de migration

### Claims Firebase

Les tokens existants peuvent conserver d'anciens claims jusqu'à leur rafraîchissement. Prévoir :

- rafraîchissement forcé après paiement ou changement de rôle ;
- reconnexion de secours ;
- compatibilité temporaire avec `premium: true`.

### Contenus embarqués

Sortir les textes Premium du bundle change le fonctionnement PWA. Procéder progressivement :

1. créer le service protégé ;
2. adapter le lecteur ;
3. tester cache et hors ligne ;
4. retirer les assets publics seulement après validation.

### Progression

La migration du stockage global vers un stockage par UID doit éviter :

- de perdre les données d'un utilisateur existant ;
- de copier automatiquement les données dans plusieurs comptes ;
- de fusionner sans consentement une progression ambiguë.

### Quotas

Passer du mois calendaire à la période Stripe nécessite de préserver :

- les crédits déjà consommés ;
- l'essai gratuit à vie ;
- l'historique des remboursements.

---

## 10. Conclusion

Leggendo dispose déjà d'une bonne base : build stable, API testée, architecture lisible et fonctionnalités de lecture substantielles. Le principal problème n'est pas la stabilité générale du lecteur, mais l'écart entre la tarification et les droits réellement appliqués.

La priorité absolue est donc :

1. établir une matrice de droits unique ;
2. protéger réellement le catalogue et les classiques ;
3. reconstruire l'intégration Stripe autour des rôles et du cycle de vie complet ;
4. rendre les jobs IA atomiques et remboursables ;
5. livrer ou retirer les fonctions Enseignant promises ;
6. sécuriser le tout avec tests, règles Firestore et observabilité.

Tant que ces points ne sont pas terminés, Leggendo peut rester une bêta gratuite, mais ne doit pas être considéré comme prêt pour l'ouverture des paiements.
