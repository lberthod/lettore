# Plan de sprints — Roadmap pédagogique Lettore Italiano

Date : 2026-07-31 (v2 — vérifié contre le code réel de `leggendo-server/` et `scripts/`)

Ce document découpe en phases exécutables les recommandations de [`outpedagogy.md`](outpedagogy.md). Chaque phase liste : objectif, fichiers exacts à créer/modifier, changements de schéma, garde-fous serveur à respecter, et critère de "fini". Ordre = meilleur ratio effort/impact d'abord.

## Rappel de l'architecture serveur (à respecter dans toutes les phases)

Vérifié dans `leggendo-server/README.md` et le code :

- **Serveur** : Node natif (http + fetch), **une seule dépendance npm : `firebase-admin`** — ne pas introduire Express ni d'autres libs sans raison forte. Routes dans `server.mjs` (pas de `index.mjs`), préfixe public `api.loicberthod.ch/leggendo/*`, derrière Caddy, service systemd `leggendo-api.service`, env via `leggendo-api.env` (modèle : `leggendo-api.env.example`).
- **Auth** : ID token Firebase vérifié via `verifyIdToken` ; rôle lu dans les custom claims. Tout nouvel endpoint doit suivre ce pattern.
- **Garde-fous existants à brancher sur tout nouvel endpoint IA** : App Check (`appcheck.mjs`, modes off/soft/enforce), rate-limit par IP (`ratelimit.mjs`), CORS `ALLOWED_ORIGINS`.
- **Crédits** : vérification + consommation + création de job dans **une même transaction Firestore** (collection `leggendoQuotas`), **remboursement automatique** si le job échoue (`jobStore.failJob`). Toute nouvelle fonctionnalité payante en crédits doit réutiliser ce mécanisme, pas en créer un autre.
- **Coûts IA** : chaque génération est loguée dans `generationLogs` (tokens, coût estimé, alerte > 0.50 $). Étendre ce logging aux nouveaux types d'appels (correction, dialogue) avec un champ `kind` pour distinguer.
- **Tests** : `npm test` (node --test, zéro dépendance), logique métier isolée de `server.mjs` dans des modules purs (`quota.mjs`, `jobs.mjs`, `validate.mjs`) testés avec `test/fake-firestore.mjs`. Toute nouvelle logique (correction, dialogue, streak-merge) doit suivre ce découpage pour être testable sans serveur ni Firestore réel.
- **LLM** : GLM-5.1 via `llm.mjs` (`callLLM`), endpoint compatible OpenAI, fallback réseau, retry/backoff, remontée auto de `max_tokens`. `GLM_MODEL`/`GLM_BASE_URL` configurables par env → **on peut pointer un autre fournisseur compatible OpenAI sans toucher au code**. Le SDK Anthropic (`@anthropic-ai/sdk`) est déjà en devDependency du repo principal, utilisé seulement dans `scripts/` (offline).

### Décision LLM à prendre en Phase 0 (pas en cours de route)

Pour la **correction pédagogique** (Phase 5) et le **dialogue** (Phase 7), la qualité des explications compte plus que pour la génération de récits. Trois options, par ordre de simplicité :

1. **Rester sur GLM-5.1** — zéro changement d'infra ; à valider par un test qualité (Phase 0).
2. **Endpoint compatible OpenAI d'un autre fournisseur** — juste des variables d'env (`GLM_BASE_URL`, `GLM_API_KEY`, `GLM_MODEL`), mais attention : `llm.mjs` sert *tous* les usages ; si on veut GLM pour la génération ET un autre modèle pour la correction, il faut paramétrer `callLLM` (petit refactor : accepter `{model, baseUrl, apiKey}` en option, défauts inchangés).
3. **API Claude via `@anthropic-ai/sdk`** — meilleure qualité pédagogique attendue, mais nouvelle dépendance *runtime* sur le VPS + nouveau format d'appel (pas compatible OpenAI) → écrire un `llm-anthropic.mjs` séparé plutôt que de complexifier `llm.mjs`.

**Recommandation** : option 1 d'abord (test qualité en Phase 0 avec le script d'échantillon ci-dessous), basculer vers 2 ou 3 seulement si la qualité déçoit. Ne pas mélanger les fournisseurs avant d'avoir mesuré.

### VPS — capacité et prérequis

- Le serveur actuel est léger (Node natif, jobs séquentiels par compte, 1 job actif/compte). La correction (Phase 5) est un appel LLM court (< génération) : pas de dimensionnement supplémentaire attendu.
- Le dialogue (Phase 7) multiplie les appels courts par session : surveiller `generationLogs` et le rate-limit IP existant suffira au début — pas besoin d'un second VPS.
- Prévoir dans `leggendo-api.env` : rien de nouveau pour les Phases 1-4 ; Phase 5+ selon la décision LLM (éventuel `ANTHROPIC_API_KEY` ou clés du fournisseur choisi).

---

## Phase 0 — Prérequis (une demi-journée, avant tout code)

- [ ] **Accès VPS** : vérifier SSH + droits sur `leggendo-api.service` (restart) et le fichier `leggendo-api.env`.
- [ ] **Test qualité correction GLM** : petit script jetable (sur le modèle de `scripts/generate-text.mjs`) qui envoie 5-10 textes d'élève avec fautes typiques (accords, prépositions, subjonctif, faux-amis fr→it) à GLM-5.1 avec un prompt de correction, et évaluer à la main la justesse des explications. C'est ce test qui tranche la décision LLM ci-dessus.
- [ ] **Budget backfill Phase 1** : ~440 textes × 1 appel court ≈ vérifier le coût unitaire dans `generationLogs` (champ coût estimé déjà loggé) avant de lancer ; batcher par lots de 20-50 avec reprise (le script doit être idempotent : skipper les textes ayant déjà `explanation`).
- [ ] **Branches** : une branche par phase (`feat/quiz-explanations`, `feat/streaks`, `feat/ascolto`, `feat/pronuncia`, `feat/correzione`...).
- [ ] **App Check** : noter le mode actuel (`APP_CHECK_MODE`) — les nouveaux endpoints doivent appliquer le même mode, pas le contourner.

---

## Phase 1 — Explications sur les erreurs de quiz

**Objectif** : transformer le quiz de sanction pure en feedback formatif. Effort le plus faible, impact immédiat.

### Fichiers à modifier

| Fichier | Changement |
|---|---|
| `leggendo-server/schema.mjs` | Ajouter `explanation: string` (obligatoire, `additionalProperties: false` respecté) à chaque objet de `questions[]` |
| `leggendo-server/generate.mjs` | Étendre le system prompt : explication courte (1 phrase) justifiant la bonne réponse, avec renvoi au passage du texte si possible |
| `leggendo-server/validate.mjs` | Si la validation vérifie la structure des questions, accepter/exiger le nouveau champ |
| `leggendo-server/test/` | Étendre les tests existants (fixtures avec `explanation`) — `npm test` doit rester vert |
| `src/components/QuizSection.vue` | Afficher `question.explanation` sous la question dès qu'une réponse est sélectionnée ; **tolérer son absence** (textes non backfillés, vieux `userTexts` en Firestore) |
| `scripts/backfill-quiz-explanations.mjs` (nouveau) | Batch sur `src/texts/*.json` : ne demander que le champ manquant (pattern `REPAIR_SCHEMA`), idempotent, lots de 20-50, log de progression. S'inspirer de `scripts/annotate-chapter.mjs`/`scripts/lib/annotate.mjs` qui font déjà ce genre de passe éditoriale offline |

### Points d'attention

- Les textes utilisateur déjà en Firestore (`userTexts`) et les actus (`newsTexts`) n'auront pas d'explication — l'UI doit dégrader proprement (pas de bloc vide).
- `news.mjs` partage le pipeline : vérifier que le nouveau champ ne casse pas la génération d'actus (même schéma → il en profitera automatiquement).

### Ordre d'exécution

1. `schema.mjs` + `generate.mjs` + `validate.mjs` + tests → déployer sur le VPS (les nouveaux textes ont l'explication).
2. Backfill du corpus statique par lots, commit des JSON modifiés.
3. `QuizSection.vue` (avec fallback sans explication).

### Critère de fini

Toute question affiche une explication après réponse sur : un texte du corpus backfillé, un texte fraîchement généré, et **pas d'UI cassée** sur un vieux `userText` sans le champ. `npm test` vert côté serveur.

---

## Phase 2 — Streaks + dashboard de progression

**Objectif** : boucle de motivation quotidienne, aucune nouvelle infra.

### Fichiers à modifier

| Fichier | Changement |
|---|---|
| `src/progress.js` | Ajouter `streak: { current, longest, lastActiveDate }` au défaut + `normalize()` (migration des profils existants, comme fait pour les favoris pré-SRS) ; fonction `touchStreak()` : incrémente si `lastActiveDate` = hier, reset si écart > 1 jour, no-op si aujourd'hui déjà compté. Utiliser une **date calendaire locale** (`YYYY-MM-DD`), pas un timestamp — sinon un utilisateur actif à 23h50 puis 00h10 perd/gagne des jours selon le fuseau |
| `src/views/ReaderView.vue` | `touchStreak()` dans le handler `completed` du quiz (là où `markRead` est déjà appelé) |
| `src/views/WordsView.vue` | `touchStreak()` à la fin d'une session de révision SRS |
| `src/lib/progressSync.js` | Règle de fusion multi-appareils explicite : `longest = max`, `current`/`lastActiveDate` = celui dont `lastActiveDate` est le plus récent. À tester (la fusion existante est champ par champ — ne pas laisser un écrasement naïf) |
| `src/views/ProfileView.vue` | Bloc dashboard : streak actuel/record, `readTexts.length`, `knownWords.length`, `dueFavorites().length` (fonctions déjà exposées par `progress.js`) |

### Critère de fini

Scénario sur 3 jours simulés (modifier `lastActiveDate` à la main) : jour 1 quiz réussi → streak 1 ; jour 2 session SRS → streak 2 ; saut d'un jour → retombe à 1. Fusion testée entre deux appareils (ou deux profils localStorage).

---

## Phase 3 — Compréhension orale pure (écoute sans texte)

**Objectif** : nouveau mode de consommation du contenu existant, aucun nouveau contenu.

### Fichiers à modifier

| Fichier | Changement |
|---|---|
| `src/views/ReaderView.vue` | Mode "ascolto" : query param `?mode=ascolto` (pas de nouvelle route) ; masque `paragraphs[]` (flou CSS ou placeholder, pas de retrait du DOM — le TTS lit depuis les mêmes données) ; bouton "Mostra il testo" ; le quiz existant sert de vérification |
| `src/views/LibraryView.vue` | Optionnel : action "Écouter" à côté de "Lire" sur chaque carte, pointant vers `?mode=ascolto` |

### Points d'attention

- Sur mobile natif, pas de vraie pause TTS (limitation documentée de `tts.js` : pause = stop) — l'UI du mode écoute doit proposer "relire la phrase" plutôt qu'une pause fine.

### Critère de fini

Depuis la bibliothèque, lancer un texte en mode écoute : texte masqué, lecture TTS aux 3 vitesses, révélation à la demande, quiz accessible. Fonctionne web + iOS/Android (vérifier le comportement stop/reprise natif).

---

## Phase 4 — Prononciation avec reconnaissance vocale (web d'abord)

**Objectif** : ouvrir le pilier "expression orale", aujourd'hui totalement absent.

### Fichiers à créer/modifier

| Fichier | Changement |
|---|---|
| `src/lib/speechRecognition.js` (nouveau) | Wrapper `window.SpeechRecognition \|\| webkitSpeechRecognition`, `lang='it-IT'`, `startListening()/stopListening()` + callbacks résultat/erreur. Exposer `isSupported()` — **Firefox ne supporte pas l'API** : l'UI doit masquer la fonctionnalité proprement si non supportée |
| `src/lib/textSimilarity.js` (nouveau) | Normalisation (minuscules, sans ponctuation/accents optionnels) puis Levenshtein token-par-token → score % + liste des mots manqués. Module pur, **tests unitaires vitest** (le repo a `vitest.config.js`) |
| `src/components/PronunciationDrill.vue` (nouveau) | Cycle : écouter (réutilise `speakItalian`) → répéter (micro) → score + mots ratés en rouge. États : permission micro refusée, API non supportée, silence/timeout |
| `src/views/ReaderView.vue` | Intégrer le drill par phrase (icône micro à côté de chaque phrase, ou intégré au mode écoute de la Phase 3) |

### Points d'attention

- HTTPS + permission micro requis ; état d'erreur clair si refus.
- **Conflit TTS/micro** : arrêter toute lecture TTS avant d'ouvrir le micro (sinon la reconnaissance capte la synthèse).
- Ne pas prétendre analyser l'accent/prosodie — présenter comme exercice de diction (exactitude des mots).
- **v2 native (phase séparée, après validation web)** : ajouter `@capacitor-community/speech-recognition` à `package.json` + permissions iOS (`NSSpeechRecognitionUsageDescription`, `NSMicrophoneUsageDescription` dans `ios/App/App/Info.plist`) et Android (`RECORD_AUDIO` dans `android/app/src/main/AndroidManifest.xml`). C'est la seule nouvelle dépendance de toute la roadmap.

### Critère de fini

Sur Chrome/Safari : écouter une phrase, la répéter, obtenir un score avec mots ratés surlignés. Sur Firefox : la fonctionnalité est absente sans erreur. Tests vitest verts sur `textSimilarity`.

---

## Phase 5 — Production écrite libre + correction IA

**Objectif** : combler le pilier "expression écrite" en réutilisant l'infra VPS existante.

### Côté serveur (`leggendo-server/`)

| Fichier | Changement |
|---|---|
| `correct.mjs` (nouveau) | Logique de correction : prompt pédagogique + appel `callLLM` + validation du schéma de sortie. Module pur testable (pattern `generate.mjs`) |
| `schema.mjs` | `CORRECTION_SCHEMA` : `{ corrected: string, errors: [{ original, correction, explanation, type: "grammatica"\|"lessico"\|"registro"\|"ortografia" }], level_estimate: "A1"..."C2" }`, `additionalProperties: false` |
| `quota.mjs` | Coût d'une correction : 1 crédit (même barème que `corto`). **Réutiliser la transaction Firestore existante** (vérif + consommation atomiques) et le **remboursement auto en cas d'échec** — le mécanisme est déjà là pour les jobs de génération |
| `server.mjs` | Route `POST /leggendo/correct` : auth (`verifyIdToken`), App Check, rate-limit IP, CORS — mêmes garde-fous que `/generate`. **Décision synchrone vs job** : une correction est bien plus courte qu'une génération (pas de texte long à produire) → commencer en **synchrone** (réponse directe, timeout ~60 s) ; ne passer en mode job que si les timeouts le justifient |
| `server.mjs` (logging) | Étendre `logGeneration` → `generationLogs` avec `kind: "correction"` (tokens, coût, alerte) |
| `validate.mjs` + `test/` | Validation d'entrée : longueur max du texte soumis (ex. 2 000 caractères — anti-abus de tokens), langue attendue ; tests avec `fake-firestore.mjs` |
| `ratelimit.mjs` | Vérifier que le plafond IP couvre aussi les corrections (compteur commun ou dédié) |

### Côté client

| Fichier | Changement |
|---|---|
| `src/lib/correction.js` (nouveau) | Client `POST /correct` (pattern de `generation.js` mais sans polling si synchrone) ; gestion 402/quota épuisé |
| `src/views/WriteView.vue` (nouveau) | Textarea (compteur de caractères, max aligné sur le serveur) + suggestion de sujet (réutilise la taxonomie via `GET /leggendo/taxonomy` déjà existant) + rendu : texte corrigé, liste d'erreurs expliquées par type, niveau estimé |
| `src/router.js` | Route `/scrivi`, garde d'accès premium_plus (pattern des routes existantes via `lib/access.js`) |
| `src/lib/access.js` | Si nécessaire : exposer le droit "correction" (aligné sur `premium_plus`/`enseignant`, comme la génération) |

### Points d'attention

- La décision LLM de la Phase 0 s'applique ici — si GLM déçoit au test qualité, c'est *avant* cette phase qu'on change de fournisseur.
- Stocker (optionnel, v2) les productions corrigées dans une collection `userWritings` pour un historique de progrès — pas nécessaire pour la v1.

### Critère de fini

Un compte premium_plus écrit 5-10 phrases avec fautes, reçoit correction + explications typées + niveau estimé, crédit décompté (visible via `/quota`), remboursé si erreur serveur. Compte gratuit → refus propre. `npm test` vert.

---

## Phase 6 — Registre de langue (dictionnaire + module tu/Lei)

**Objectif** : combler le trou sociolinguistique — contenu/éditorial, parallélisable avec les phases 4-5.

### 6a — Champ registre dans le dictionnaire

| Fichier | Changement |
|---|---|
| `src/dictionary/lemmas/{a-z}.json` | Champ `register: "formale"\|"neutro"\|"informale"\|"letterario"\|"dialettale"` (absent = neutro implicite, pas besoin de backfiller les 11 275 lemmes) |
| `scripts/backfill-dictionary-register.mjs` (nouveau) | Batch LLM ciblé sur les mots **réellement présents dans le corpus** (réutiliser `scripts/extract-dictionary-words.mjs` qui fait déjà l'extraction corpus→dictionnaire) ; s'inspirer de `scripts/prepare-batch.mjs`/`merge-dictionary-batches.mjs` qui gèrent déjà le cycle batch/fusion du dictionnaire |
| `src/lib/dictionary.js` | Exposer le champ (probablement transparent si le loader passe l'objet entier) |
| `src/views/DictionaryView.vue` | Badge de registre à côté du POS, seulement si `register` présent et ≠ neutro |

### 6b — Mini-module tu/Lei (textes contrastifs)

| Fichier | Changement |
|---|---|
| `leggendo-server/category.json` + `src/texts/category.json` | Nouvelle catégorie/thème `"registro"` (les deux copies doivent rester synchrones — vérifier s'il existe un script de sync, sinon modifier les deux) |
| Contenu | 3-5 paires de textes contrastifs (même scène en formel/informel) au format JSON existant, produits avec `scripts/generate-text.mjs` (pipeline éditorial offline déjà en place, utilise le SDK Anthropic) puis publiés via `scripts/publish-text.mjs` |

### Critère de fini

Les mots à registre marqué du corpus affichent leur badge dans le dictionnaire ; les paires formel/informel sont lisibles dans la bibliothèque sous la catégorie "registro".

---

## Phase 7 — Dialogue simulé / pragmatique conversationnelle

**Objectif** : le plus gros chantier. À lancer après la Phase 5 (même brique "le LLM évalue une production utilisateur", mais avec état).

### Fichiers à créer/modifier

| Fichier | Changement |
|---|---|
| `leggendo-server/dialogue.mjs` (nouveau) | Moteur multi-tour. **État** : l'historique vit dans Firestore (`dialogueSessions/{sessionId}` : uid, scénario, tours, statut) et est rechargé à chaque appel — le serveur reste stateless entre requêtes (cohérent avec l'architecture jobs persistés existante, survit aux redémarrages du VPS) |
| `schema.mjs` | Schéma de tour : `{ reply: string, corrections: [...facultatif], suggested_replies: string[3] }` — les suggestions de réponse aident les niveaux A1-A2 à ne pas rester bloqués |
| `quota.mjs` | Tarification : à la **session** (ex. 2 crédits pour un dialogue jusqu'à N tours), pas au tour — sinon imprévisible pour l'utilisateur. Plafond de tours par session côté serveur |
| `server.mjs` | Routes `POST /leggendo/dialogue` (nouveau tour) + `GET /leggendo/dialogue/:id` (reprise) ; mêmes garde-fous auth/App Check/rate-limit ; logging `kind: "dialogue"` |
| `firestore.rules` | Règles pour `dialogueSessions` (lecture/écriture owner uniquement, écriture des tours côté serveur via Admin SDK) |
| `src/views/DialogueView.vue` (nouveau) | UI chat : choix du scénario ("al bar", "dal medico", "in stazione"...), tours, TTS sur les répliques IA (réutilise `speakItalian`), affichage des `suggested_replies` en boutons |
| `src/router.js` | Route `/dialogo`, accès premium_plus |

### Critère de fini

Session complète sur un scénario : l'IA reste dans son rôle, corrige légèrement en fin de session, la session survit à un rechargement de page, le coût en crédits est celui annoncé.

---

## Phase 8 (bas de priorité) — Karaoke mot-à-mot

Exploiter `onboundary` de `SpeechSynthesisUtterance` (web seulement, fiabilité variable selon moteur) dans `src/tts.js` + descendre le surlignage de `ReaderView.vue` du niveau phrase (`readingKey`) au mot. Nice-to-have — ne faire que si tout le reste est livré.

---

## Récapitulatif

| Phase | Contenu | Effort | Déploiement VPS ? | Nouvelle dépendance ? | Nouvel endpoint ? |
|---|---|---|---|---|---|
| 0 | Prérequis + test qualité LLM | ½ jour | Non (lecture seule) | Non | Non |
| 1 | Explications quiz | Faible | Oui (schema/generate) | Non | Non |
| 2 | Streaks/dashboard | Faible | Non | Non | Non |
| 3 | Écoute sans texte | Faible | Non | Non | Non |
| 4 | Prononciation (web) | Moyen | Non | Non (natif : oui, plus tard) | Non |
| 5 | Correction d'écriture | Moyen | Oui | Selon décision LLM | `POST /leggendo/correct` |
| 6 | Registre + tu/Lei | Faible-Moyen | Marginal (category.json) | Non | Non |
| 7 | Dialogue simulé | Élevé | Oui | Selon décision LLM | `POST/GET /leggendo/dialogue` |
| 8 | Karaoke mot-à-mot | Moyen | Non | Non | Non |

**Démarrage** : Phase 0 (une demi-journée, dont le test qualité GLM qui conditionne les Phases 5 et 7), puis Phase 1 — chemin de bout en bout le plus court : `schema.mjs` → `generate.mjs` → backfill → `QuizSection.vue`.

---

## Checklist de mise en production (état au 2026-07-31 : phases 1-7 implémentées et commitées)

Tout est implémenté et testé en local (106 tests serveur, 44 tests client). Étapes restantes, dans l'ordre :

1. **Push** : publier les commits sur origin.
2. **Déployer `leggendo-server/` sur le VPS** puis `systemctl restart leggendo-api.service`. Requis pour : explications de quiz sur les nouveaux textes générés, `/scrivi` (POST /leggendo/correct), `/dialogo` (routes /leggendo/dialogue). Aucune nouvelle variable d'env requise (GLM inchangé).
3. **Déployer les règles Firestore** : `firebase deploy --only firestore:rules` (nouvelle collection `dialogueSessions`, lecture owner uniquement).
4. **Synchroniser le contenu protégé** : `node scripts/sync-content.mjs` (credentials service account) — sans ça, les abonnés ne voient pas le contenu complet des 6 textes tu/Lei.
5. **Backfill des explications de quiz** : `ANTHROPIC_API_KEY=... node scripts/backfill-quiz-explanations.mjs --limit 5` d'abord (contrôle qualité), puis sans limite (460 textes). Re-committer les JSON modifiés puis re-sync (étape 4).
6. **Backfill des registres du dictionnaire** : `ANTHROPIC_API_KEY=... node scripts/backfill-dictionary-register.mjs --limit 5` d'abord, puis sans limite (~11 200 lemmes du corpus, lots de 50). Re-committer les shards.
7. **Test en réel avec un compte premium_plus** : une correction sur `/scrivi` (vérifier la qualité pédagogique de GLM-5.1 — si décevante, cf. section « Décision LLM » plus haut) et une session `/dialogo` complète avec bilan.
8. **Build mobile** : `npx cap sync` déjà fait ; vérifier la compilation Xcode (portage Swift vendorisé `SpeechRecognitionPlugin.swift`), tester sur appareil : double permission micro/reconnaissance iOS au premier usage, comportement `no-speech` Android, drill de prononciation de bout en bout.
9. **Déploiement web** : build + déploiement Firebase Hosting habituel.
