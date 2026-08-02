# Plan de travail — Itération post-audit de maturité

Date : 2026-08-02

Ce document découpe en sprints exécutables les 6 priorités de [`outpedagogy.md` §10.9](outpedagogy.md). Contrairement à [`opiphasesprint.md`](opiphasesprint.md) (qui couvrait la roadmap précédente, désormais largement livrée — session composée, missions, dialogue, prononciation, écoute, cartes d'erreur, indicateur de confiance CECR dans `ProfileView.vue`/`src/lib/metrics.js`), ce plan part de l'état réel du code au 2026-08-02, vérifié fichier par fichier (voir « État constaté » dans chaque sous-phase).

Ordre des sprints = dépendances logiques d'abord (une sauvegarde de brouillon protège tout le reste), puis meilleur ratio effort/impact.

---

## Sprint 0 — Filet de sécurité (avant tout le reste)

### 0.1 Sauvegarde automatique des brouillons d'écriture

**État constaté** : `WriteView.vue` garde `text` en mémoire pure (aucune clé localStorage, aucun indicateur « enregistré », aucune confirmation avant remplacement, aucun retry si le réseau/quota est indisponible). Le seul compteur affiché est un compteur de caractères (`text.length` vs `CORRECTION_MAX_CHARS`), pas de mots.

**Pourquoi en premier** : c'est un risque de perte de travail utilisateur (mobile, changement de page, coupure réseau) — le corriger avant d'investir dans des fonctionnalités plus avancées de la même vue évite de refaire deux fois le câblage d'état de `WriteView.vue`.

**Fichiers à toucher**
| Fichier | Changement |
|---|---|
| `src/lib/writingDraft.js` (nouveau) | Pattern localStorage identique à `dailySession.js` (clé par uid, `keyFor(uid)`) : `saveDraft({uid, mode, promptId, text, savedAt})` / `loadDraft(...)` / `clearDraft(...)`. Une entrée par couple `(mode, promptId ou 'libre')`. |
| `src/views/WriteView.vue` | `watch(text, ...)` avec debounce (~800 ms) → `saveDraft`. Au montage, si un brouillon existe pour le mode/sujet courant, proposer restauration. Avant de changer de sujet/mode avec du texte non vidé : confirmation. Ajouter compteur de mots (`text.trim().split(/\s+/)`) à côté du compteur de caractères existant. Petit indicateur textuel « Enregistré sur cet appareil à HH:MM ». |
| `src/lib/writingDraft.test.js` (nouveau) | Logique pure testée sans DOM (comme `correctionRetry.test.js`). |

**Critère de fini** : fermer l'onglet en plein brouillon (mode libre et mode guidé) puis rouvrir `WriteView.vue` restaure le texte ; changer de sujet avec du texte présent déclenche une confirmation ; le brouillon est purgé après une correction réussie envoyée.

---

## Sprint 1 — Boucle de correction : juger l'objectif, pas seulement la langue

### 1.1 Séparer réussite communicative et qualité linguistique

**État constaté** : `leggendo-server/correct.mjs` + `CORRECTION_SCHEMA` (`schema.mjs`) ne renvoient que `{ corrected, errors[], level_estimate }` — évaluation purement linguistique (grammatica/lessico/registro/ortografia). Aucun champ ne dit si le message a atteint son but ; `WriteView.vue` (bloc résultat) n'affiche que le niveau estimé et les erreurs groupées, pour les modes `guidato` et `contenuto` comme pour le mode libre.

**Fichiers à toucher**
| Fichier | Changement |
|---|---|
| `leggendo-server/schema.mjs` | Ajouter au schéma de sortie, **seulement quand une consigne/objectif est fournie** (modes guidé/contenu) : `communicative: { status: "atteint"\|"partiel"\|"a_completer", note: string }` (une phrase max). Ne pas l'exiger en mode libre (pas d'objectif à évaluer). |
| `leggendo-server/correct.mjs` | Transmettre au LLM la consigne/l'objectif communicatif (déjà connu côté client pour les modes guidé/contenu — vérifier ce qui est actuellement envoyé au endpoint) et l'intégrer au prompt système : juger l'atteinte du but *avant* la liste d'erreurs linguistiques. |
| `leggendo-server/test/` | Fixtures avec/sans `communicative` selon le mode ; `npm test` doit rester vert. |
| `src/views/WriteView.vue` | Afficher `communicative.status` en tête du résultat (au-dessus des erreurs groupées), avec un style neutre (pas un score chiffré) — distinct visuellement du détail linguistique. Tolérer l'absence du champ (mode libre, anciens résultats en cache). |

**Piège à éviter** (rappelé par `outpedagogy.md` §10.3) : ne pas transformer l'écran en grille scolaire — un seul statut + une phrase, pas une nouvelle catégorie d'erreurs à cocher.

**Critère de fini** : une production en mode guidé qui remplit l'objectif mais contient des fautes mineures affiche « objectif atteint » distinctement des erreurs listées ; une production hors-sujet mais sans faute affiche « à compléter ».

### 1.2 Mesurer la réussite différée et le transfert, pas que la reprise immédiate

**État constaté** : `src/lib/correctionRetry.js` (`selectPriorityErrors`, `checkRewrite`) et `CorrectionRetry.vue` ne mesurent que la reformulation immédiate après affichage de la correction (`retryCount`/`retrySuccess`, journalisés dans `WriteView.vue`). Un signal de réemploi existe déjà (`reuseWordsOffered`/`reuseWordsUsed` dans `WriteView.vue`) mais se limite au vocabulaire en mode « contenuto », n'est pas relié aux erreurs grammaticales, et n'est ni affiché ni exploité pour adapter quoi que ce soit.

**Fichiers à toucher**
| Fichier | Changement |
|---|---|
| `src/lib/correctionRetry.js` | Ajouter le concept de « règle à revoir » : quand une erreur de `type: "grammaire"` est corrigée, stocker `{ pattern/type, textId ou promptId, correctedAt }` dans un journal léger (réutiliser le pattern d'activité déjà journalisé, pas une nouvelle collection Firestore). |
| `src/lib/spacedErrorCards.js` (existant, à vérifier — cartes d'erreur SRS) | Si les cartes d'erreur savent déjà planifier une révision, brancher dessus plutôt que créer un second mécanisme : la « réussite différée » = résultat correct d'une carte d'erreur du même type, quelques jours plus tard, dans un **contexte différent** (nouvelle phrase, pas la même). |
| `src/views/ProfileView.vue` / `src/lib/metrics.js` | Nouvel indicateur discret : « erreurs consolidées » = types d'erreurs dont la carte de révision associée a été réussie en contexte différent, vs « encore fragiles ». Réutilise `confidenceLevel`/`skillTrend` déjà en place plutôt que d'inventer un nouveau calcul. |

**Critère de fini** : une erreur grammaticale corrigée aujourd'hui génère une carte de révision qui, réussie plusieurs jours plus tard dans une phrase différente, est comptabilisée séparément d'un simple « retry immédiat réussi ».

---

## Sprint 2 — Personnalisation à partir de signaux déjà journalisés

### 2.1 Missions dérivées d'une faiblesse observée

**État constaté** : `src/lib/missions.js` (`MISSIONS`, lignes 17-33) est une liste fixe de 3 missions identiques pour tous les utilisateurs chaque jour (`ascolto_avant_transcription`, `corrige_et_reecris`, `reutilise_mots_revus`), sélectionnées par simple correspondance à l'activité du jour — aucune n'est choisie en fonction d'une faiblesse réelle.

**Fichiers à toucher**
| Fichier | Changement |
|---|---|
| `src/lib/missions.js` | Ajouter une fonction `selectMissionsForToday(weekSummary, skillMetrics)` qui **priorise** parmi un pool élargi de missions candidates (garder les 3 existantes + en ajouter 2-3 : ex. « lis un paragraphe sans traduction de phrase » si `helpUsed` élevé récemment, « réussis deux rappels sur [type d'erreur récurrente] » si une carte d'erreur revient souvent) selon les signaux déjà disponibles : `skillTrend`/`confidenceLevel` (`metrics.js`), aides récentes (`helpUsed`), erreurs récurrentes (Sprint 1.2). |
| `src/lib/missions.test.js` | Étendre pour couvrir la sélection conditionnelle, pas seulement le matching fixe. |

**Garde-fou** (rappelé par `outpedagogy.md` §10.7) : rester sur « fait / pas encore fait », pas de points, pas de classement — la personnalisation porte sur *quelle* mission est proposée, pas sur la mécanique de récompense.

**Critère de fini** : deux utilisateurs avec des profils de compétence différents voient des missions différentes le même jour, dérivées de signaux déjà journalisés (pas de nouveau champ de tracking dédié).

### 2.2 Difficulté adaptative de la session composée

**État constaté** : `src/lib/percorso.js#composeSession` (lignes ~219-321) adapte déjà la *sélection* d'étapes selon la fréquence de pratique par compétence, les préférences (`learningPreferences.avoidedActivities/preferredActivities`) et le but déclaré — mais ne lit jamais les signaux d'aide déjà journalisés (`helpUsed` dans `WriteView.vue`, transcription affichée en écoute, traductions cliquées en lecture) pour ajuster la difficulté du *contenu* proposé.

**Fichiers à toucher**
| Fichier | Changement |
|---|---|
| `src/lib/percorso.js` | Nouvelle fonction pure `adjustDifficulty(recentActivity)` appliquant la règle simple de §10.5 : 2 réussites autonomes comparables → contenu légèrement plus exigeant ; réussite avec beaucoup d'aides → même niveau, retirer une aide ; 2 échecs/abandons → réduire longueur/complexité sans rétrograder le niveau affiché ; erreur récurrente ciblée → micro-activité de consolidation (relier à Sprint 1.2/2.1). |
| `src/lib/percorso.test.js` | Cas de test pour chacune des 4 règles. |
| `src/views/HomeView.vue` (ou vue affichant la session composée) | Si le niveau de difficulté proposé change, l'expliquer en une phrase simple (« Nous gardons ce niveau pour vous aider à lire avec moins de traductions »), pas silencieusement. |

**Critère de fini** : deux sessions composées consécutives avec beaucoup d'aides utilisées proposent un contenu plus court/simple que deux sessions réussies sans aide, et l'utilisateur voit une explication en langage simple du changement.

---

## Sprint 3 — Unifier le positionnement CECR

### 3.1 Fusionner le test de niveau et le jeu CECR en un seul moteur multimodal

**État constaté** : deux implémentations indépendantes et dupliquées coexistent aujourd'hui.
- `router.js` → `LevelTestView.vue` : QCM adaptatif en escalier A1→C2, `estimateLevel` = heuristique de majorité par niveau, sans intervalle de confiance, sans auto-évaluation, sans production.
- `router.js` → `GameView.vue` + `src/components/games/ScalaCecrGame.vue` (non commité, nouveau) : variante gamifiée (vies, streak) tirant sur la **même** banque de questions (`levelTestQuestions.js`), avec sa propre logique `pickQuestion`/anti-répétition dupliquée plutôt que partagée.

Ni l'une ni l'autre ne combine QCM + auto-évaluation par situations + production facultative + révision après 3 activités authentiques, comme demandé par `outpedagogy.md` §10.6.

**Fichiers à toucher**
| Fichier | Changement |
|---|---|
| `src/lib/levelTestEngine.js` (nouveau) | Extraire `pickQuestion`/anti-répétition/`estimateLevel` en module pur partagé, testé, utilisé par `LevelTestView.vue` **et** `ScalaCecrGame.vue` — élimine la duplication actuelle avant d'ajouter de nouvelles capacités dessus. |
| `src/lib/levelTestEngine.js` | Ajouter `estimateLevel` avec confiance explicite (taille d'échantillon, même logique que `confidenceLevel` dans `metrics.js` — réutiliser, pas réinventer). |
| `src/views/LevelTestView.vue` | Après le QCM, proposer 2-3 questions d'auto-évaluation par situation réelle (« Peux-tu commander au restaurant sans préparer tes phrases à l'avance ? ») et une production facultative courte (réutilise le composant de saisie de `WriteView.vue` si possible). Résultat formulé comme « niveau conseillé pour commencer », pas une certification. |
| `src/lib/percorso.js` ou nouveau `src/lib/levelReview.js` | Après 3 activités authentiques post-positionnement, déclencher une relecture automatique de la recommandation (comparer au niveau réellement observé via `skillTrend`). |

**Critère de fini** : `LevelTestView.vue` et `ScalaCecrGame.vue` partagent le même moteur de sélection/estimation ; le résultat affiché inclut confiance + origine multimodale ; après 3 activités, l'utilisateur voit une note discrète si le niveau recommandé a été ajusté.

---

## Suivi

| Sprint | Sous-phase | Statut |
|---|---|---|
| 0 | 0.1 Brouillons auto | Fait (198/198 tests) |
| 1 | 1.1 Objectif communicatif | Fait (114/114 serveur, 198/198 client) |
| 1 | 1.2 Réussite différée / transfert | Fait (243/243 tests) |
| 2 | 2.1 Missions personnalisées | Fait (228/228 tests) |
| 2 | 2.2 Difficulté adaptative | Fait (256/256 tests) |
| 3 | 3.1 Positionnement CECR unifié | Fait (256/256 tests) |

**Vérification finale (toutes sous-phases fusionnées dans le même arbre de travail)** : `npx vitest run` → 256/256, `leggendo-server && npm test` → 114/114, `npx vite build` → OK. Rien n'a été committé — à relire et committer manuellement.

Chaque sous-phase = une branche (`feat/write-draft`, `feat/correction-goal`, `feat/error-transfer`, `feat/missions-adaptive`, `feat/session-difficulty`, `feat/level-test-unify`), un commit à la fin, `npm test` vert avant merge.
