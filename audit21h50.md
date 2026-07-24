# Audit — Leggendo (24/07/2026, 21h50)

Périmètre : état du dépôt à l'instant T (working tree, y compris fichiers non commités), architecture, sécurité, cohérence des données.

## 1. Résumé

Le projet est propre et bien documenté ([ARCHITECTURE.md](ARCHITECTURE.md) est à jour et honnête sur ses propres limites). Le principal risque n'est pas un bug de code mais un **écart entre ce que `PricingView`/`stripe.js` promettent (Premium+) et ce qui existe réellement côté back (rôles, quotas, règles Firestore)**, plus **6 nouveaux textes orphelins** qui ne sont accessibles par aucun chemin de navigation normal.

## 2. Constats — changements non commités

### 2.1 Textes ajoutés mais absents de l'index — bug bloquant
Les 6 fichiers `src/texts/{colosseo_storia,garibaldi_unita,impero_romano_vita,leonardo_vinci_bio,marco_polo_viaggio,nascita_repubblica}.json` existent (structure correcte : `words`/`sentences`/`questions` conformes au schéma des textes existants), mais **aucun n'est référencé dans [src/texts/index.json](src/texts/index.json)**.

Conséquences concrètes :
- Ils n'apparaissent ni sur l'accueil, ni dans `LibraryView`, ni dans ses filtres.
- Le garde de route `/testo/:id` ([router.js:41-46](src/router.js)) calcule `inCatalog` à partir de `textsIndex` : pour ces ids, `inCatalog` est `false`. Si Firebase est configuré (prod), un visiteur non connecté qui devine l'URL est renvoyé vers `/connexion` ; un visiteur connecté passe le garde, mais `ReaderView` tentera ensuite `loadUserText()` (chemin Firestore `userTexts/{id}`) puisqu'il n'est pas dans le catalogue — ces documents n'existent pas dans Firestore, donc **404 / retour bibliothèque** même pour un compte connecté.
- Résultat : ces 6 textes sont actuellement **injoignables en pratique**, malgré le travail de génération.

Correction : ajouter les 6 entrées à `index.json` (titre, niveau, extrait, genre, category, nombre de mots) comme pour les 462 autres textes.

### 2.2 Palier « Premium+ » — scaffold non branché
[src/lib/stripe.js](src/lib/stripe.js) ajoute `premiumPlusPlan` (`id: 'premium_plus'`) et l'insère dans `plans`. `PricingView.vue` n'a que des ajustements CSS (grille à 4 colonnes plus étroite) pour absorber la nouvelle carte — rien de fonctionnel.

Ce nouvel id **n'existe nulle part côté back** :
- [functions/index.js:49](functions/index.js) : `ROLES = ['gratuit', 'premium', 'enseignant']` — `adminSetUserRole` refusera `premium_plus` (`invalid-argument`).
- [leggendo-server/server.mjs:66,146](leggendo-server/server.mjs) : le rôle payant est binaire (`premium`/`enseignant` vs `gratuit`) ; aucun tier "3 textes/jour" distinct du quota Premium normal (10/jour) n'existe pour Premium+.
- [firestore.rules](firestore.rules) : ne connaît que `role == 'enseignant'` comme claim spécial.
- Les fonctionnalités vendues (notifications, génération à la demande, bibliothèque d'ebooks classiques) n'ont aucune implémentation associée.

C'est cohérent avec le message de commit (« scaffold ») — à ne pas activer/vendre avant que le rôle soit propagé dans `functions/index.js`, `leggendo-server/server.mjs` et les règles Firestore, sinon un client payant Premium+ recevra en pratique les droits `gratuit` (le webhook ne pose que `premium: true/false`, jamais de rôle `premium_plus`).

### 2.3 `PricingView.vue` — changement CSS uniquement
Diff limité à des ajustements de densité (colonnes plus étroites, `max-width` du hero augmenté, polices réduites) pour faire tenir 4 cartes au lieu de 3. Pas de risque fonctionnel identifié, mais dépend du point 2.2 pour avoir un sens produit.

## 3. Nouveaux fichiers non liés au diff stripe

### 3.1 `scripts/fetch-book.mjs`
Script d'import Wikisource (domaine public IT/FR) vers `sources/raw/<book-id>/`. Lecture : correct, pas d'exécution de code distant, User-Agent identifié, retry avec backoff sur 429. Un seul répertoire `sources/raw/pinocchio/` existe pour l'instant (8 chapitres bruts) — cohérent avec le projet « bibliothèque d'ebooks classiques » du plan Premium+ (§2.2), donc probablement le tout début de ce chantier. `sources/` n'est pas dans `.gitignore` : si le contenu brut ne doit pas être versioné (fichiers volumineux, sources multiples), il vaut la peine de trancher maintenant plutôt qu'après plusieurs imports.

### 3.2 `public/.htaccess`
Config Apache pour un hébergement Infomaniak en parallèle de Firebase Hosting. Cohérente avec `firebase.json` (même logique de rewrite SPA, mêmes règles de cache pour les assets hashés). Rien à signaler.

### 3.3 `LETTORE_EBOOK.md`
Note de travail (166 lignes) sur le projet ebooks — non lue en détail ici mais son existence + `PREMIUM_PLUS_ANALYSIS.md` (177 lignes) confirment que Premium+ et la bibliothèque d'ebooks sont bien un chantier en cours, pas terminé : cohérent avec §2.2.

## 4. Sécurité — points vérifiés (pas de régression trouvée)

- **Webhook Stripe** ([functions/index.js:67-125](functions/index.js)) : signature vérifiée sur `req.rawBody` avant tout traitement, erreurs renvoyées en 400 sans détail sensible. Le renvoi de l'uid sur l'abonnement (pour gérer `customer.subscription.deleted`) est une bonne pratique, correctement commentée.
- **Fonctions admin** (`adminListUsers`, `adminSetUserRole`) : contrôle d'accès basé sur l'e-mail du token vérifié serveur (`request.auth.token.email`), pas sur une donnée cliente falsifiable. Correct.
- **Firestore rules** : modèle par défaut `deny all` (`match /{document=**}`), lecture publique restreinte aux documents `status == 'published'`, premium gated par `custom claim`. `userTexts` : create/update/delete correctement scopés au propriétaire, seul le champ `public` est modifiable et seulement vers `true` par un `enseignant`. Rien à redire.
- **Clé Firebase `apiKey` en clair** dans [src/lib/firebase.js:4](src/lib/firebase.js) : normal et attendu pour une config client Firebase (ce n'est pas un secret, la sécurité repose sur les Firestore rules / App Check, pas sur le secret de cette clé) — pas un problème.
- **Contrôle d'accès premium côté client** : déjà documenté comme limitation assumée dans ARCHITECTURE.md §« Accès et monétisation » — tout le catalogue (texte + traductions) est embarqué dans le bundle par chunk, donc un utilisateur qui connaît/devine l'id d'un texte payant peut charger le chunk JS directement sans passer par le garde de route. C'est une limitation connue et documentée, pas une régression de cette session — mais à garder en tête si le modèle freemium est mis en avant commercialement avant qu'un vrai gating serveur (Firestore, cf. §"Production du catalogue" de l'architecture) soit branché.

## 5. Recommandations, par priorité

1. **Bloquant produit** : ajouter les 6 textes manquants à `src/texts/index.json` avant tout déploiement, sinon le travail de génération est invisible.
2. **Avant d'activer Premium+ commercialement** : propager le rôle `premium_plus` dans `functions/index.js` (`ROLES`, claims), `leggendo-server/server.mjs` (quota dédié 3/jour), et décider si `firestore.rules`/`access.js` ont besoin d'un traitement spécifique (ebooks classiques ≠ catalogue standard).
3. **Décision à prendre** : `sources/raw/` doit-il être versionné ? Si les textes bruts sont volumineux ou multiples, ajouter au `.gitignore` maintenant.
4. Rien à corriger côté sécurité (webhook, rules, admin) sur les changements de cette session.
