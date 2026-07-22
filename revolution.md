# Revolution — de petit projet à produit qui compte

*Audit stratégique et feuille de route pour Leggendo (lettore-italiano). Juillet 2026.*

---

## TL;DR

Le cœur du produit est **fini et démontrable** : un lecteur d'italien avec traduction au clic, audio, quiz et répétition espacée, alimenté par 44 textes A1–B2 dont chaque mot et chaque phrase est traduit. L'atout structurel est le **pipeline de génération de contenu par Claude** (`scripts/generate-text.mjs`) : le coût marginal d'un texte de qualité validée tend vers zéro.

Ce qui manque n'est pas du produit, c'est du **branchement** : l'auth Firebase, Stripe et le contrôle d'accès Premium sont câblés dans le code mais éteints. Trois chantiers débloquent tout :

1. **Activer les comptes + synchroniser la progression** (première vraie raison de créer un compte).
2. **Brancher le paiement et servir le contenu premium via Firestore** (aujourd'hui tous les textes sont embarqués dans le build — un modèle payant est impossible en l'état).
3. **Transformer le pipeline en fonctionnalité utilisateur** : génération de textes à la demande, personnalisés par niveau et centres d'intérêt. C'est ça, le révolutionnaire — aucun concurrent grand public ne le fait avec une couverture lexicale garantie.

---

## 1. Audit honnête

### Forces

- **Cœur produit complet et poli** : `ReaderView.vue` (découpage phrase/mot, traduction au clic via `TranslationOverlay.vue`, TTS phrase par phrase), quiz de compréhension (`QuizSection.vue`), favoris avec répétition espacée Leitner (`progress.js`, boîtes 1/3/7/14/30 jours, révision dans `WordsView.vue`).
- **Contenu à invariant fort** : 44 textes (A1 ×8, A2 ×11, B1 ×10, B2 ×15), chacun avec lexique fléchi it→fr exhaustif et traduction naturelle de chaque phrase. L'invariant est validé automatiquement par le pipeline (`scripts/lib/schema.mjs` + passes de réparation).
- **Pipeline éditorial IA mature** : `generate:text` appelle Claude avec structured outputs, valide la couverture lexicale totale, écrit en local ou en brouillon Firestore ; `publish:text` publie et reconstruit l'index. C'est un outil d'éditeur, prêt à scaler le catalogue.
- **Architecture saine** : SPA statique offline-first, PWA active (service worker, précache des textes), dégradation gracieuse partout (Firebase/Stripe optionnels), lazy-loading, SEO par route, design abouti et responsive.

### Faiblesses

| Faiblesse | Conséquence |
|---|---|
| Monétisation 100 % stub (Payment Links vides, auth non configurée) | Aucun revenu possible aujourd'hui |
| Tous les textes embarqués dans le build JS | Un texte « premium » serait téléchargeable par n'importe qui — le modèle payant est structurellement cassé tant que le contenu payant n'est pas servi par Firestore |
| Progression uniquement en `localStorage` | Perdue au changement d'appareil ; aucune raison de créer un compte |
| Zéro test, zéro lint, zéro CI | Chaque évolution du cœur (translate, progress, schéma) est un risque silencieux |
| Pages légales squelettiques | Bloquant pour un lancement payant en Suisse/UE |
| Doc en retard sur le code | README/ARCHITECTURE disent la PWA « pas encore activée » alors que `vite.config.js` l'active déjà |

### État des briques

| Brique | État |
|---|---|
| Lecteur, traduction, TTS, quiz, Leitner | ✅ Fini |
| Catalogue 44 textes + pipeline de génération | ✅ Fini |
| PWA / offline | ✅ Fini (doc à mettre à jour) |
| Auth Firebase (`src/lib/firebase.js`, `src/lib/auth.js`, `LoginView`) | 🔌 Câblé mais éteint (placeholders `REMPLACER_*`) |
| Stripe (`src/lib/stripe.js`, `PricingView`) | 🔌 Câblé mais éteint (Payment Links vides) |
| Règles Firestore (gratuit public / premium sur claim) | 🔌 Écrites (`firestore.rules`) mais l'app ne lit jamais Firestore |
| Contrôle d'accès Premium (webhook Stripe → claim → contenu servi) | ❌ À construire |
| Sync de la progression multi-appareils | ❌ À construire |
| Tests / CI | ❌ À construire |

---

## 2. Positionnement : pourquoi ce projet est pertinent

Le marché est saturé d'apps de *gamification* (Duolingo) et d'apps de lecture soit chères, soit à contenu limité (LingQ, Readle). La thèse de Leggendo :

> **La lecture extensive est la méthode la plus efficace pour l'acquisition du vocabulaire — et grâce au pipeline IA, Leggendo est le seul à pouvoir garantir qu'aucun mot ne reste sans traduction, sur un catalogue qui grandit à coût marginal quasi nul.**

Différenciateurs réels, déjà dans le code :

- **Couverture lexicale totale garantie** — pas un dictionnaire approximatif branché par-dessus, mais des gloses générées et validées pour *ce* texte, y compris les formes fléchies.
- **Offline-first** — l'app entière fonctionne sans connexion, sans compte. Friction d'entrée nulle.
- **Méthode assumée** — pages Méthode/Méthodologie déjà rédigées : le produit a un point de vue pédagogique, pas juste des features.
- **Prix honnête** — 5 CHF/mois là où LingQ est à ~13 $.

Le différenciateur **futur** (axe 4 ci-dessous) est celui qu'aucun concurrent n'a : le pipeline qui alimente le catalogue peut générer un texte *pour un utilisateur donné* — son niveau, ses intérêts, ses mots faibles.

---

## 3. Axe Business & lancement — le déblocage

Rien de révolutionnaire ici : c'est le travail qui rend le reste possible. Dans l'ordre, chaque étape apportant de la valeur seule :

1. **Config Firebase réelle** — remplir `src/lib/firebase.js`, activer email/Google dans la console. `LoginView` et les gardes du routeur fonctionnent déjà, tout se met en marche seul.
2. **Sync de la progression dans Firestore** — miroir du `localStorage` (`readTexts`, `favorites` avec boîtes Leitner) sous `users/{uid}`. C'est la **première vraie raison de créer un compte** : « ne perds pas tes mots ». À lancer avant tout paiement pour constituer une base d'utilisateurs identifiés.
3. **Paiement + accès Premium** — Payment Links Stripe dans `src/lib/stripe.js`, webhook (Cloud Function) qui pose le custom claim `premium`, et surtout : **les textes premium servis depuis Firestore** (les règles `firestore.rules` l'anticipent déjà — publié gratuit public, premium sur claim), plus jamais embarqués dans le build. `ProfileView` lit le claim au lieu du « Gratuit » codé en dur.

**Modèle** : gratuit généreux (le catalogue actuel de 44 textes, la méthode complète) ; premium = catalogue étendu + génération personnalisée (axe suivant) + sync illimitée. Le gratuit est le marketing.

**Hygiène pré-lancement** (non négociable avant d'encaisser un franc) : pages Mentions légales / Confidentialité / CGV réelles, tests unitaires sur le cœur pur (`translate.js`, `progress.js`, `scripts/lib/schema.mjs` — tous testables sans mock), CI GitHub Actions (build + tests).

---

## 4. Axe Produit & IA — le révolutionnaire

Le pipeline de génération est aujourd'hui un outil interne. Le retourner vers l'utilisateur change la catégorie du produit :

- **Textes à la demande** *(le pari principal)* — « Je veux un texte B1 sur le cyclisme » → le pipeline génère, valide la couverture lexicale, sert le texte. Toute la mécanique existe (`generate-text.mjs` + validation + sink Firestore) ; il manque un déclencheur serveur (Cloud Function avec quota par abonné) et une file d'attente. Réservé au premium : c'est l'argument de vente n° 1.
- **Niveau adaptatif** *(quick win)* — les données existent déjà : résultats de quiz, boîtes Leitner, textes lus par niveau. Un score simple estime le niveau CEFR réel et pilote les recommandations — puis, combiné au point précédent, la *génération* : textes qui réutilisent délibérément les mots en boîte 1–2 de l'utilisateur.
- **Tuteur post-lecture** *(pari, phase ultérieure)* — discuter du texte en italien avec correction douce. Fort en valeur, mais coût API récurrent et UX à inventer : après validation des deux premiers.
- **Audio neural** *(amélioration continue)* — Web Speech est inégal selon les navigateurs. Pré-générer l'audio des textes premium (une fois, au moment de la génération) avec une voix neurale : coût unique par texte, qualité constante, cohérent avec l'offline-first.

Priorité : niveau adaptatif (données déjà là, zéro coût API) → textes à la demande (le différenciateur) → audio neural → tuteur.

---

## 5. Axe Multi-langues & échelle — la plateforme

Rien dans le schéma de contenu n'est spécifique à l'italien : `paragraphs`, `words` (cible→source), `sentences`, `questions` sont langue-agnostiques, et le pipeline prend la langue en paramètre de prompt.

- **Généralisation** : `it→fr` devient `{cible}→{source}`. Concrètement : champ `lang` dans l'index et les textes, voix TTS par langue dans `tts.js`, namespace de routes (`/es/textes`…), et une marque ombrelle (« Leggendo » est déjà un nom de méthode plus que de langue).
- **Ordre suggéré** : espagnol (plus grand marché francophone d'apprenants, TTS excellent) → allemand (marché suisse naturel) → anglais→X plus tard (marché énorme mais concurrence maximale).
- **Chaque langue coûte** : ~50 textes générés et relus (~quelques jours de pipeline), une passe de QA native, des pages Méthode adaptées. C'est le coût marginal faible qui rend l'expansion crédible — mais **pas avant** que l'italien ait prouvé la conversion (phase 2 terminée).
- **Stores** : le chemin Capacitor est déjà documenté dans le README. À faire quand le web paie, pas avant — la PWA couvre l'essentiel entre-temps.

---

## 6. Roadmap phasée

### Phase 0 — Hygiène (~1 semaine)
Mettre README/ARCHITECTURE à jour (PWA active), rédiger les pages légales réelles, tests unitaires sur `translate.js` / `progress.js` / `schema.mjs`, CI build+tests.
**Sortie** : CI verte, docs exactes, base légale prête.

### Phase 1 — Lancement payant (~1 mois)
Config Firebase, sync progression Firestore, Payment Links + webhook + claim `premium`, textes premium servis par Firestore, ProfileView branché sur l'abonnement réel. Une première vague de ~15 textes premium (C1 inclus — le pipeline le supporte déjà, aucun n'est publié).
**Sortie** : un utilisateur peut payer, accéder au contenu premium sur deux appareils, et personne ne peut extraire ce contenu du build.
**Métriques** : comptes créés / lecteurs actifs, conversion gratuit→payant, rétention J7.

### Phase 2 — IA différenciante (~2 mois)
Niveau adaptatif à partir des données Leitner/quiz, puis génération de textes à la demande (Cloud Function + quota premium), audio neural sur le catalogue premium.
**Sortie** : un abonné peut demander un texte sur son sujet, à son niveau, avec ses mots faibles réinjectés.
**Métriques** : textes générés/abonné/mois, rétention J30 des abonnés, coût API par abonné vs revenu.

### Phase 3 — Échelle
Deuxième langue (espagnol), marque ombrelle, stores via Capacitor si la traction web le justifie, tuteur conversationnel.
**Sortie** : la plateforme, plus l'app.

---

## 7. Risques & garde-fous

| Risque | Garde-fou |
|---|---|
| Coût API de la génération à la demande explose | Quota mensuel par abonné, textes générés mutualisés dans le catalogue (un texte demandé par A est servi à B) |
| Qualité d'un texte généré sans relecture humaine | La validation automatique (couverture lexicale, schéma) est déjà stricte ; ajouter un bouton « signaler » + passe de relecture asynchrone avant entrée au catalogue public |
| Web Speech inégal casse l'expérience audio | Audio neural pré-généré sur le premium (phase 2) ; Web Speech reste le fallback gratuit |
| Apple/Google : commission 30 % et obligation d'IAP | Rester web/PWA tant que possible ; au passage stores, prix distincts ou compte web-only (modèle « reader app ») |
| Se disperser sur les 4 axes en parallèle | La roadmap est séquentielle exprès : rien en phase N+1 tant que les critères de sortie de N ne sont pas verts |

---

*Document de travail — à réviser à chaque fin de phase.*
