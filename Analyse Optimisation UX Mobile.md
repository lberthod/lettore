# Analyse & Optimisation UX Mobile — audit de zéro

Date : 2026-08-04

Ce document reprend l'exercice depuis zéro sur ce qui **n'a pas encore été
traité** par [Optimisation Mobile.md](Optimisation%20Mobile.md) (Phases 1-3,
déjà livrées : coquille native, barre d'onglets, accueil = tableau de bord,
grilles compactes Giochi/Classici, z-index des modales, contraste de la
barre d'onglets). Deux sources : un audit de code fichier par fichier
(numéros de ligne exacts) et une vérification visuelle sur device réel
(Samsung Galaxy S23 Ultra) pour les écrans déjà accessibles.

## Méthode

Pour chaque écran non encore audité : cibles tactiles (< 44px = sous la
recommandation WCAG 2.5.5 / Material Design), contraste de texte (< 4.5:1 =
échoue WCAG AA texte normal), verrous de mise en page (`position: fixed` +
`overflow: hidden` sans secours de défilement interne — la classe de bug
déjà trouvée et corrigée sur `HomeView.vue`), grilles sans repli mobile, et
débordement de texte non protégé.

---

## Diagnostic — les 3 problèmes qui reviennent partout

### 1. Cibles tactiles sous 44px, systématiquement sur les contrôles les plus utilisés

| Fichier | Élément | Taille estimée | Fréquence d'usage |
|---|---|---|---|
| `src/views/ReaderView.vue:994-995` | `.icon-btn` (lecture/pause/stop TTS) | ~33.6px | Très haute — barre du lecteur |
| `src/views/ReaderView.vue:1195-1200` | `.punct` (traduire une phrase) | largeur = 1 caractère | Haute — action phare du lecteur |
| `src/views/ReaderView.vue:1213-1219` | `.drill-btn` (🎙 exercice de prononciation) | ~21.6px, opacité 0.4 | Haute — après chaque phrase |
| `src/views/ReaderView.vue:1457-1462` | `.quiz-close` (fermer le quiz) | ~32px | Moyenne |
| `src/components/QuizSection.vue:134-149` | `.option` (réponses du quiz) | ~32-33px de haut, largeur au contenu | Haute — quiz après chaque texte |
| `src/views/WordsView.vue:640-651` / `:865-876` / `:920-932` | `.trash` / `.speak` / `.remove` | ~18-20px, non contraintes | Haute — écran de révision |
| `src/views/DictionaryView.vue:664-676` | `.letter` (index A-Z) | ~30.4px | Très haute — nav principale du dictionnaire |
| `src/views/DictionaryView.vue:696-708` | `.prefix` (affinage 2 lettres) | ~25.6px | Moyenne |
| `src/views/DictionaryView.vue:1069-1080` | `.btn-nav` (précédent/suivant, mode session) | ~33px | Haute — répété à chaque mot |
| `src/views/PricingView.vue:445-461` | `.toggle-btn` (Mensuel/Annuel) | ~29px | Moyenne |
| `src/views/LoginView.vue:150-159` | liens « Créer un compte » / « Mot de passe oublié » | hauteur = ligne de texte | Haute — parcours d'inscription |

**Pourquoi c'est le problème n°1** : ce ne sont pas des recoins secondaires
de l'app — TTS, traduction de phrase, quiz, dictionnaire alphabétique sont
les interactions les plus fréquentes. Un mistap régulier sur ces contrôles
dégrade l'usage quotidien plus qu'un bouton mal calibré sur un écran visité
une fois.

### 2. Contraste texte insuffisant, concentré sur `DictionaryView.vue`

| Ligne | Sélecteur | Couleur / fond | Ratio estimé | Où |
|---|---|---|---|---|
| 601 | `.proper-category` | `#a89c8c` sur blanc/crème | ≈ 2.5:1 | Fiches noms propres |
| 652 | `.count` | `#a89c8c` | ≈ 2.5:1 | Compteurs de section, onglet Nomi propri |
| 1059 | `.session-progress` | `#a89c8c` | ≈ 2.5:1 | « Mot X / Y », affiché en continu pendant toute la session audio |
| 618-619 | `.proper-desc-fr` | `#8a8072`, 0.88rem italique | ≈ 3.6:1 | Traduction française des noms propres |
| 756 | `.index-fr` | `#8a8072`, 0.8rem | ≈ 3.6:1 | Traduction à côté de **chaque** lemme de l'index — élément central |

Ces couleurs n'existent pas ailleurs dans la palette de l'app (le reste
utilise `#6b6156`/`#8a5a2b`, tous deux > 5.5:1 sur fond clair, déjà vérifiés
lors du fix de contraste de `NativeTabBar.vue`) — probablement introduites
localement dans ce fichier sans vérification.

### 3. Verrous de mise en page et détails de robustesse

- **`src/views/WordsView.vue:503-512`** — `.words-screen` reste
  `overflow: hidden`. `.list` (la liste de mots) a bien son propre
  `overflow-y: auto` (L.837), mais **l'état « en révision »** (`.stage`,
  L.529-540, contenant `.review-card`) n'a aucun scroll interne : si le
  clavier s'ouvre sur `.exercise-input` ou si carte + explication + actions
  dépassent la hauteur visible sur un petit téléphone, le contenu est coupé
  sans moyen d'y accéder. Même classe de bug que `HomeView.vue` avant son
  correctif (voir Optimisation Mobile.md), pas traitée ici.
- **`src/views/PricingView.vue:467`** — `.plans` n'a pas de media query
  `max-width: 480px` dédiée (contrairement au correctif déjà fait sur
  Giochi/Classici) : comportement non contrôlé sur petit écran avec 3-4
  formules.
- **`src/views/DictionaryView.vue:1009-1018`** — `.preset-custom` (input
  nombre de mots du mode aléatoire) a `font-size: 0.9rem` (14.4px), **hors
  de la classe `.form` globale** qui applique la règle anti-zoom iOS
  (`style.css:126-133`, 16px minimum sur mobile) : ce champ précis
  déclenchera le zoom automatique au focus sur iOS.
- **`src/views/DictionaryView.vue:725-759`** — `.index-list { columns: 4
  220px }` (largeur de colonne fixée en px, pas en %/rem) + `.index-lemma`
  sans `text-overflow`/`overflow` (L.747-751, à la différence de
  `.index-fr` qui a bien `ellipsis`, L.757-759) : un lemme long peut
  déborder de sa colonne sur mobile étroit.

---

## Phase 1 — Cibles tactiles (priorité : impact le plus large)

### Sprint 1.1 — Lecteur (ReaderView.vue / BookReaderView.vue)

**Fichiers à toucher**

| Fichier | Changement |
|---|---|
| `src/views/ReaderView.vue` (+ `BookReaderView.vue` si dupliqué) | `.icon-btn` : `width`/`height` 2.1rem → 2.75rem (44px). `.drill-btn` : agrandir à ~1.8em et remonter l'opacité par défaut (0.4 → 0.6, le `:hover`/`:active` reste le plein contraste). `.punct` : élargir la zone cliquable avec un `padding` généreux plutôt que la largeur du seul caractère (ex. `padding: 0.3em 0.15em`, le glyphe reste visuellement identique). `.quiz-close` : 2rem → 2.75rem. |

**Critère de fini** : chaque contrôle audio/traduction/quiz mesure au moins
44×44px de zone cliquable (padding inclus), sans changer la densité visuelle
du texte lui-même.

### Sprint 1.2 — QuizSection.vue

**Fichiers à toucher**

| Fichier | Changement |
|---|---|
| `src/components/QuizSection.vue` | `.options` : `align-items: flex-start` → `stretch` (réponses courtes en pleine largeur, cible tactile large plutôt qu'ajustée au texte). `.option` : `padding` 0.45rem 0.9rem → 0.7rem 0.9rem (~44px de haut). `.retry` : même ajustement. |

**Critère de fini** : sur un quiz à réponses courtes (« Sì »/« No »), les
boutons occupent toute la largeur disponible et mesurent ≥ 44px de haut.

### Sprint 1.3 — WordsView.vue

**Fichiers à toucher**

| Fichier | Changement |
|---|---|
| `src/views/WordsView.vue` | `.trash`, `.speak`, `.remove` : fixer `width`/`height` explicites (≥ 2.75rem) au lieu d'un simple `padding` sur l'icône seule. `.actions` (L.904-908) : `gap` 0.6rem → 0.9rem pour réduire le risque de mistap entre lien et ✕ dans `.entry`. |

**Critère de fini** : supprimer un mot, l'écouter, ou effacer une carte
d'erreur reste fiable au doigt sans zoomer.

### Sprint 1.4 — DictionaryView.vue (navigation)

**Fichiers à toucher**

| Fichier | Changement |
|---|---|
| `src/views/DictionaryView.vue` | `.letter` : `min-width`/`height` 1.9rem → 2.75rem (grille A-Z, revoir le `gap` pour que 8 colonnes restent lisibles — passer à 6-7 colonnes sur mobile si besoin, comme fait pour Giochi/Classici). `.prefix` : même traitement, `2.4rem×1.6rem` → au moins `2.75rem` de haut. `.btn-nav` : `padding` → ~0.75rem vertical. `.preset` : `2.6rem×2rem` → `2.75rem` de haut minimum. |

**Piège à éviter** : l'index A-Z tient actuellement sur 3 lignes de 8
colonnes (voir capture d'écran) — l'agrandissement des cibles ne doit pas
le faire déborder sur mobile étroit sans repli en grille, sous peine de
recréer le problème déjà réglé sur Giochi.

**Critère de fini** : navigation alphabétique et boutons précédent/suivant
du mode session utilisables à une main sans mistap répété.

### Sprint 1.5 — PricingView.vue

**Fichiers à toucher**

| Fichier | Changement |
|---|---|
| `src/views/PricingView.vue` | `.toggle-btn` : padding vertical → ~0.6rem (44px). `.link-btn` (« Restaurer mes achats ») et le lien CGU adjacent (L.280-281) : séparer visuellement (marge ou saut de ligne) plutôt que deux liens minuscules côte à côte dans le même paragraphe. |

**Critère de fini** : bascule Mensuel/Annuel et restauration d'achat
fiables au doigt.

### Sprint 1.6 — LoginView.vue

**Fichiers à toucher**

| Fichier | Changement |
|---|---|
| `src/views/LoginView.vue` | `.switcher a` : ajouter `padding: 0.4rem 0` (zone cliquable verticale élargie sans changer l'apparence du texte, `line-height` déjà à 1.8). |

**Critère de fini** : « Créer un compte » et « Mot de passe oublié » ont
une zone cliquable qui dépasse la seule hauteur de ligne du texte.

---

## Phase 2 — Contraste (DictionaryView.vue)

### Sprint 2.1 — Remplacer les couleurs hors palette

**Fichiers à toucher**

| Fichier | Changement |
|---|---|
| `src/views/DictionaryView.vue` | `#a89c8c` (L.601, 652, 1059) → `#6b6156` (déjà utilisé partout ailleurs dans l'app, 5.8:1 sur fond clair). `#8a8072` (L.618-619, 756) → même remplacement ou `#8a5a2b` si un accent de couleur reste voulu (5.6:1). |

**Critère de fini** : les 5 usages passent le vérificateur de contraste
WCAG AA (≥ 4.5:1) ; aucune régression visuelle notable (les deux couleurs
de repli sont déjà la palette « texte secondaire » du reste de l'app).

---

## Phase 3 — Robustesse de mise en page

### Sprint 3.1 — WordsView.vue : scroll de l'état « en révision »

**État constaté** : `.stage` (L.529-540) n'a pas de `overflow-y: auto`,
contrairement à `.list`. Le clavier virtuel ou un contenu de carte plus
long que d'habitude peut rendre une partie de l'exercice inatteignable.

**Fichiers à toucher**

| Fichier | Changement |
|---|---|
| `src/views/WordsView.vue` | `.stage { overflow-y: auto }` (même logique que le fix `HomeView.vue` de la session précédente — voir Optimisation Mobile.md). |

**Critère de fini** : ouvrir le clavier sur `.exercise-input` en pleine
révision, sur un écran compact, laisse tout le contenu (carte + actions)
atteignable par défilement.

### Sprint 3.2 — PricingView.vue : grille des formules sur mobile

**Fichiers à toucher**

| Fichier | Changement |
|---|---|
| `src/views/PricingView.vue` | Media query `max-width: 480px` sur `.plans` : forcer 1 colonne pleine largeur (comme fait pour `.game-grid`/`.grid` sur Giochi/Classici), plutôt que de laisser `auto-fit`/`minmax(190px,1fr)` décider seul. |

**Critère de fini** : les formules s'empilent proprement en 1 colonne sur
un écran ≤ 480px, sans carte tronquée ni texte de prix compressé.

### Sprint 3.3 — DictionaryView.vue : input et débordement de texte

**Fichiers à toucher**

| Fichier | Changement |
|---|---|
| `src/views/DictionaryView.vue` | `.preset-custom` : `font-size: 0.9rem` → `1rem` (16px, aligné sur la règle globale anti-zoom iOS de `style.css`). `.index-lemma` : ajouter `overflow: hidden; text-overflow: ellipsis` (même traitement que `.index-fr` juste à côté, pour cohérence). |

**Critère de fini** : le champ personnalisé du mode aléatoire ne déclenche
plus de zoom au focus sur iOS ; un lemme long dans l'index s'ellipse au
lieu de déborder de sa colonne.

---

## Phase 4 (stretch) — Cohérence visuelle continue

Non chiffré en détail, à évaluer une fois les Phases 1-3 livrées :

- **CreateTextView.vue / WriteView.vue** : `.link-btn` répété une dizaine
  de fois (Réessayer, Autre situation, Autres mots…) sans padding — même
  traitement que Sprint 1.3/1.6 à appliquer par cohérence, impact moindre
  (actions secondaires, pas le flux principal).
  Voir `WriteView.vue:539-548` et équivalent `CreateTextView.vue`.
- **Audit systématique des `.link-btn`** dans toute l'app : le pattern
  « lien texte sans padding » revient dans au moins 4 fichiers
  (`LoginView`, `PricingView`, `WriteView`, `CreateTextView`) — envisager
  une classe utilitaire partagée (`style.css`) avec un `padding` minimum
  plutôt que de corriger fichier par fichier.
- **DictionaryView.vue `.index-list { columns: 4 220px }`** : au-delà du
  débordement de texte (Sprint 3.3), le pattern colonnes CSS multi-colonnes
  reste peu naturel au défilement mobile (ordre de lecture haut→bas puis
  saut en haut de la colonne suivante) — évaluer une liste verticale simple
  sur mobile, sujet à part entière plutôt qu'un correctif rapide.

---

## Ordre recommandé et effort

| Phase | Sprints | Effort relatif | Pourquoi cet ordre |
|---|---|---|---|
| 1 | 1.1 → 1.6 | Moyen (6 fichiers, changements ciblés et mécaniques) | Impact le plus large — contrôles utilisés à chaque session |
| 2 | 2.1 | Faible (5 remplacements de couleur, 1 fichier) | Rapide, corrige un vrai échec d'accessibilité concentré |
| 3 | 3.1 → 3.3 | Faible à moyen | Bugs ponctuels mais réels (contenu inatteignable, zoom iOS intempestif) |
| 4 | — | Variable | Cohérence, pas de bug bloquant identifié |

Recommandation : Phase 1 d'abord (le geste le plus fréquent dans l'app —
lire, traduire, répondre à un quiz — doit être fiable au doigt), Phase 2
ensuite (rapide, isolé), Phase 3 en parallèle ou juste après (bugs
ponctuels indépendants les uns des autres).
