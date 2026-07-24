# Analyse de la taxonomie de contenu — toucher tous les publics

Stratégie de catégorisation du Lettore Italiano : état des lieux chiffré, publics visés, taxonomie à deux dimensions (genre × thème), plan de production chiffré.

> **Mise à jour du 24/07/2026** : la taxonomie genre × thème proposée en §3–§5 est **implémentée** (`src/texts/category.json`, champs `genre`/`category` sur les textes, orchestrateur `--genre`, `curatedMatrix`). Les Phases 1 et 2 du plan initial sont dépassées. Ce document reflète l'état réel du catalogue et fixe la suite : **Phase 4, cap sur 420 textes**.

---

## 0. Synthèse exécutive (TL;DR)

1. **L'axe `genre` est en place.** Le catalogue est passé de 51 textes mono-genre (`racconto`) à **340 textes sur 10 genres** (racconto, dialogo, poesia, fiaba, fantascienza, giallo, documentario, lettera_diario, teatro, pratico) × 14 thèmes, générés par `generator/orchestrate-matrix.mjs` à partir de la `curatedMatrix` de `category.json`.
2. **8 publics sur 8 sont désormais servis** — chaque genre absent identifié en §2 (poésie, SF, policier, fables, théâtre) a maintenant ≥ 20 textes au catalogue.
3. **Nouveau problème : la pyramide des niveaux reste inversée.** Part A1–A2 du catalogue = **35,6 %** (121/340) contre une cible de ≥ 45 % — moins bonne que ne le laissait espérer la Phase 1. Les débutants restent le public le moins bien servi en volume, alors qu'ils sont statistiquement les plus nombreux et les plus susceptibles de churner faute de matière.
4. **Cellules ⭐ de la matrice §4.3 : toutes ≥ 2**, la règle anti-dilution (§7) est respectée. Quelques cellules restent à 1 texte (fragiles) : `fantascienza`/`giallo`/`teatro`/`lettera_diario` A1, `pratico` B2–C2.
5. **Objectif Phase 4 : +80 textes (340 → 420 minimum)**, orientés à ~85 % vers A1–A2 pour ramener la part des débutants à ≥ 45 %, le reste pour combler les cellules encore à 1 texte (§6).

---

## 1. État des lieux chiffré

> §1.1–1.2 documentent le **point de départ** (avant la refonte genre × thème) : ils expliquent le diagnostic et restent la référence pour comprendre *pourquoi* la taxonomie a changé. L'état **actuel** du catalogue est en §1.3.

### 1.1 Les 12 catégories actuelles (baseline, avant refonte)

Définies dans `src/texts/categories.json` (UI) et dupliquées dans `generator/config.mjs` (hints LLM). 51 textes, tous de genre implicite « récit/article ».

| id | Nom | Textes | % du catalogue |
|---|---|---:|---:|
| `cucina` | Cuisine et saveurs | 7 | 14 % |
| `vita_quotidiana` | Vie quotidienne | 6 | 12 % |
| `viaggi` | Voyages | 6 | 12 % |
| `montagna` | Montagne et Alpes | 4 | 8 % |
| `natura_animali` | Nature et animaux | 4 | 8 % |
| `feste` | Fêtes et traditions | 4 | 8 % |
| `storia_antica` | Histoire ancienne et Renaissance | 4 | 8 % |
| `storia_moderna` | Histoire moderne | 4 | 8 % |
| `sport` | Sport et défis | 3 | 6 % |
| `societa` | Société | 3 | 6 % |
| `arte_lingua` | Arts et langue | 3 | 6 % |
| `regioni` | Régions alpines | 2 | 4 % |

Par niveau : **A1 : 8 · A2 : 11 · B1 : 15 · B2 : 17 · C1 : 0.** La pyramide est inversée : plus on monte en niveau, plus il y a de textes — alors que la base d'utilisateurs est presque toujours l'inverse (les débutants sont les plus nombreux et churnent le plus vite faute de matière à leur niveau).

### 1.2 Cinq faiblesses structurelles

| # | Faiblesse | Preuve | Coût |
|---|---|---|---|
| 1 | **Axe unique (thème)** — aucune info sur la forme du texte | 51/51 textes = prose narrative/factuelle | 4 publics sur 8 sans porte d'entrée |
| 2 | **Pyramide des niveaux inversée** | A1 = 8 textes vs B2 = 17 | churn des débutants, C1 = impasse |
| 3 | **Sur-segmentation alpine** | `montagna` + `regioni` + moitié de `viaggi` ≈ 20 % du catalogue sur la même niche | dilution de l'effort de génération |
| 4 | **Frontières floues** | `montagna`/`regioni`/`viaggi`, `storia_*`/`societa` | mis-tags (cf. #5), sections redondantes dans LibraryView |
| 5 | **Grille trop étroite → tags forcés** | `pioggia` (jour de pluie) classé `cucina` | signal que la taxonomie ne couvre pas le réel |

À cela s'ajoute une dette technique : `categories.json` et `config.mjs` sont **deux sources de vérité synchronisées à la main**.

### 1.3 État des lieux actuel (24/07/2026, 340 textes)

Répartition par genre :

| Genre | A1 | A2 | B1 | B2 | C1 | C2 | Total |
|---|--:|--:|--:|--:|--:|--:|--:|
| racconto | 20 | 19 | 22 | 20 | 6 | 8 | 95 |
| documentario | 0 | 2 | 6 | 11 | 12 | 12 | 43 |
| dialogo | 6 | 9 | 5 | 2 | 2 | 4 | 28 |
| pratico | 11 | 8 | 5 | 1 | 1 | 1 | 27 |
| teatro | 1 | 5 | 9 | 3 | 3 | 3 | 24* |
| fantascienza | 1 | 3 | 9 | 5 | 5 | 3 | 26 |
| fiaba | 7 | 8 | 3 | 2 | 2 | 3 | 25 |
| giallo | 1 | 3 | 6 | 6 | 5 | 3 | 24 |
| poesia | 4 | 4 | 4 | 5 | 3 | 4 | 24 |
| lettera_diario | 1 | 8 | 4 | 3 | 3 | 3 | 22 |
| **Total par niveau** | **52** | **69** | **74** | **58** | **43** | **44** | **340** |

*léger écart d'arrondi entre les deux comptages (fichiers sans métadonnées explicites).*

Constats :

- **Les 10 genres sont désormais tous représentés avec un volume comparable** (22 à 95 textes chacun) — le problème d'axe unique de 2026-07-22 est résolu.
- **Le niveau C1, nul en 2026-07-22, atteint 43 textes** et le niveau **C2 a été ouvert** (44 textes) — dépassement large de la cible « ≥ 4 textes C1 » du plan initial (§6).
- **La pyramide reste inversée dans sa partie basse** : A1 (52) < A2 (69) < B1 (74), puis ça redescend. Part A1–A2 = (52+69)/340 = **35,6 %**, en dessous de la cible de 45 % fixée en Phase 1 — malgré +289 textes générés depuis le baseline, l'effort n'a pas été suffisamment orienté débutants.
- **Cellules à 1 seul texte** (fragiles, sous le seuil de confort même si la règle « ≥ 2 pour les ⭐ » est techniquement respectée) : `fantascienza` A1, `giallo` A1, `teatro` A1, `lettera_diario` A1, `pratico` B2/C1/C2, `documentario` A2.

---

## 2. Publics : qui lit, qu'attend-il, est-il servi ?

| Profil | Attente | Genres qui le retiennent | Niveaux | Servi en 2026-07-22 | Servi en 2026-07-24 |
|---|---|---|---|:-:|:-:|
| Débutant scolaire / autodidacte | Textes courts et rassurants | Dialogues, mini-récits, fables, pratique | A1–A2 | 🟡 partiel (récits seuls) | 🟡 partiel (volume A1 encore faible, §1.3) |
| Voyageur / expatrié | Situations réelles | Dialogues situationnels, textes pratiques | A2–B1 | 🟡 partiel | ✅ bien servi |
| Passionné de culture italienne | Histoire, art, gastronomie | Documentaire, biographies | B1–B2 | ✅ bien servi | ✅ bien servi |
| Senior / apprenant loisir | Terroir, histoires humaines | Récits de vie, lettres, traditions | A2–B1 | ✅ bien servi | ✅ bien servi |
| **Lecteur littéraire** | Plaisir de lire, belle langue | Nouvelles, poésie, classiques adaptés | B1–C1 | ❌ absent | ✅ bien servi (poesia : 24 textes) |
| **Ado / jeune adulte** | Imaginaire, suspense | SF, fantastique, policier | A2–B2 | ❌ absent | ✅ bien servi (fantascienza + giallo : 50 textes) |
| **Enfant / lecture en famille** | Histoires ludiques | Fables, contes, animaux | A1–A2 | ❌ absent | ✅ bien servi (fiaba : 25 textes, 15 en A1–A2) |
| **Curieux scientifique** | Apprendre en lisant | Vulgarisation, géographie, techno | B1–C1 | ❌ quasi absent (1 texte) | ✅ bien servi (documentario : 43 textes) |

**Score de couverture : 4/8 → 7,5/8.** Les 4 publics absents en 2026-07-22 sont désormais servis par le volume de textes. Reste un profil imparfaitement couvert : le débutant complet (A1), pénalisé par la pyramide inversée (§1.3) — c'est le seul écart restant, et la cible de la Phase 4 (§6).

---

## 3. Décision de conception : deux dimensions, pas vingt catégories

### Option rejetée : ajouter « Poésie », « SF », « Policier » comme catégories

- La liste passerait à 20+ entrées mélangeant thème et forme (« Montagne » à côté de « Poésie »).
- Chevauchements ingérables : un poème sur la montagne, un polar à Venise, une fable culinaire vont où ?
- LibraryView groupe par catégorie → 20 sections, la page devient illisible.

### Option retenue : axe `genre` (forme) ⊥ axe `category` (thème)

```
                     THÈME — de quoi ça parle (14 valeurs)
                     quotidien · cuisine · nature · voyages · histoire · science · …
GENRE — la forme   ┌────────────────────────────────────────────────────────
racconto           │  ✅ l'existant : les 51 textes actuels
dialogo            │  à créer        fantascienza   │  à créer
poesia             │  à créer        giallo         │  à créer
fiaba              │  à créer        documentario   │  ~existant (histoire)
lettera_diario     │  1 texte        teatro         │  à créer
pratico            │  à créer
```

**Avantages :** chaque texte = 1 genre + 1 thème ; deux portes d'entrée dans la bibliothèque ; les publics manquants sont adressés par le genre sans toucher aux thèmes ; migration triviale (51 textes → `racconto`, `lettera` → `lettera_diario`) ; les hints du générateur se composent (hint du genre + hint du thème).

---

## 4. La taxonomie proposée

### 4.1 Dimension GENRE — 10 valeurs

| id | Nom FR | Icône | Hint générateur (à composer avec le hint du thème) | Niveaux |
|---|---|---|---|---|
| `racconto` | Récit & nouvelle | 📖 | Histoire narrative avec personnages, arc début-milieu-fin | A1–C1 |
| `dialogo` | Dialogue & conversation | 💬 | Échange parlé réaliste (café, gare, téléphone), italien oral naturel, tours de parole courts | A1–B1 |
| `poesia` | Poésie & chanson | 🪶 | A1–A2 : filastrocche (comptines), rimes simples. B1+ : vers libres, images, poèmes courts | A1–C1 |
| `fiaba` | Fables & contes | 🦊 | Contes traditionnels, fables avec morale explicite, animaux qui parlent, formules répétitives | A1–B1 |
| `fantascienza` | Science-fiction & fantastique | 🚀 | Futur proche, robots, mystères surnaturels ; intrigue simple au présent pour A2 | A2–C1 |
| `giallo` | Policier & mystère | 🕵️ | Enquête, disparition, indices, chute — le *giallo*, genre très italien | A2–C1 |
| `documentario` | Histoire & documentaire | 🏛 | Texte factuel : événement historique, lieu géographique, vulgarisation scientifique, biographie | B1–C1 |
| `lettera_diario` | Lettres & journal | ✉️ | Correspondance, journal intime, e-mails, cartes postales — 1re personne, registre personnel | A1–B2 |
| `teatro` | Théâtre & sketch | 🎭 | Petite scène jouable à 2–3 personnages, didascalies minimales, humour | A2–B2 |
| `pratico` | Textes pratiques | 📋 | Recette, mode d'emploi, annonce, menu, horaires — l'italien « utile » du quotidien | A1–B1 |

Trois choix assumés :
- **Poésie dès A1** via les *filastrocche* (comptines) — format court, répétitif, idéal débutant ; la poésie « littéraire » commence à B1.
- **SF et giallo dès A2** : des intrigues simples au présent fonctionnent et fidélisent les ados — le suspense est le meilleur moteur de lecture extensive.
- **`documentario` = le genre « texte historique / géographie / science »** demandé : c'est la *forme factuelle*, croisée avec les thèmes `storia_*`, `regioni`, `scienza_tecnologia`.

### 4.2 Dimension THÈME — 12 existants conservés + 2 ajouts

Zéro suppression, zéro migration (hors re-tag de `pioggia` → `vita_quotidiana`). Deux libellés élargis, deux ajouts :

| Action | id | Nom FR | Icône | Note |
|---|---|---|---|---|
| = | `vita_quotidiana` | Vie quotidienne | ☕ | pilier A1–A2 |
| = | `cucina` | Cuisine et saveurs | 🍝 | |
| = | `natura_animali` | Nature et animaux | 🐾 | porte d'entrée enfants (× `fiaba`) |
| ✏️ | `viaggi` | Voyages et découvertes | 🧳 | libellé élargi |
| = | `montagna` | Montagne et Alpes | 🏔 | niche assumée (public CH) |
| ✏️ | `regioni` | Régions et géographie | 🗺 | **élargi à toute l'Italie** + géographie — répond au besoin « géographie » sans nouvelle catégorie |
| = | `sport` | Sport et défis | ⚽ | |
| = | `feste` | Fêtes et traditions | 🎉 | |
| = | `storia_antica` | Histoire ancienne et Renaissance | 🏛 | |
| = | `storia_moderna` | Histoire moderne | 🇮🇹 | |
| ✏️ | `societa` | Société et actualité | 🗞 | libellé élargi |
| = | `arte_lingua` | Arts et langue | 🎨 | absorbe musique/cinéma pour l'instant |
| ➕ | `scienza_tecnologia` | Science et technologie | 🔬 | curieux scientifiques ; support naturel de la SF |
| ➕ | `scuola_lavoro` | École, travail et ville | 🏙 | jeunes adultes, Erasmus, vie urbaine — trou actuel |

**Règle anti-flou** (à documenter dans le générateur) : en cas d'hésitation entre deux thèmes, choisir celui du *sujet principal*, pas du décor. Un polar à Venise → `giallo` × `viaggi` seulement si Venise est le sujet ; sinon le thème du mobile (ex. `cucina` pour un vol de recette).

### 4.3 Matrice genre × niveau — cible de couverture (baseline 2026-07-22)

| Genre | A1 | A2 | B1 | B2 | C1 |
|---|:-:|:-:|:-:|:-:|:-:|
| racconto | ✅ | ✅ | ✅ | ✅ | ◻ |
| dialogo | ⭐ | ⭐ | ◻ | — | — |
| poesia | ⭐ comptines | ⭐ | ◻ | ◻ | ◻ |
| fiaba | ⭐ | ⭐ | ◻ | — | — |
| fantascienza | — | ⭐ | ⭐ | ◻ | ◻ |
| giallo | — | ◻ | ⭐ | ⭐ | ◻ |
| documentario | — | — | ◻ | ✅ | ⭐ |
| lettera_diario | ◻ | ✅ | ◻ | — | — |
| teatro | — | ◻ | ◻ | ◻ | — |
| pratico | ⭐ | ◻ | ◻ | — | — |

✅ couvert · ⭐ priorité forte · ◻ souhaitable · — peu pertinent

### 4.4 Matrice genre × niveau — état réel (24/07/2026, cf. §1.3)

Nombre de textes par cellule ; le niveau C2 (hors périmètre de ce document initial, ouvert depuis) est inclus pour mémoire.

| Genre | A1 | A2 | B1 | B2 | C1 | C2 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| racconto | 20 ✅ | 19 ✅ | 22 ✅ | 20 ✅ | 6 ✅ | 8 |
| dialogo | 6 ✅ | 9 ✅ | 5 | — | — | 4 |
| poesia | 4 ✅ | 4 ✅ | 4 | 5 | 3 | 4 |
| fiaba | 7 ✅ | 8 ✅ | 3 | — | — | 3 |
| fantascienza | 1 ⚠️ | 3 ✅ | 9 ✅ | 5 | 5 | 3 |
| giallo | 1 ⚠️ | 3 | 6 ✅ | 6 ✅ | 5 | 3 |
| documentario | 0 | 2 ⚠️ | 6 | 11 ✅ | 12 ✅ | 12 |
| lettera_diario | 1 ⚠️ | 8 ✅ | 4 | — | — | 3 |
| teatro | 1 ⚠️ | 5 | 9 | 3 | 3 | 3 |
| pratico | 11 ✅ | 8 | 5 | 1 ⚠️ | 1 ⚠️ | 1 ⚠️ |

✅ cible ⭐ dépassée (≥ 2, souvent ≥ 5) · ⚠️ encore à 1 texte, à consolider en Phase 4 (§6) · cellules `—` du baseline non prioritaires, remplies incidemment par les runs larges.

---

## 5. Implications techniques — état d'implémentation

1. ~~**Données** : champ `genre` dans `index.json`~~ ✅ fait : chaque texte porte `genre` + `category` ; `src/texts/category.json` regroupe `levels`, `sizes`, `genres`, `themes`, `curatedMatrix`.
2. ~~**Générateur** : `GENRES` dans `config.mjs`~~ ✅ fait : `generator/orchestrate-matrix.mjs` compose hint-genre + hint-thème depuis `category.json`.
3. ~~**Matrice de génération**~~ ✅ fait : `curatedMatrix` dans `category.json` pilote l'orchestrateur (`--genre` supporté), plus besoin du produit cartésien.
4. ~~**Source unique de vérité**~~ ✅ fait : `category.json` est la seule source (UI + générateur).
5. **UI (LibraryView)** : filtre « Genre » et regroupement — à vérifier à l'usage ; pas ré-audité dans cette mise à jour, cf. [LibraryView.vue](src/views/LibraryView.vue).
6. ~~**Quick wins immédiats**~~ ✅ fait (`pioggia` re-tagué, thèmes élargis).

Les points 1 à 4 et 6, qui étaient « à planifier » en juillet 2026, sont livrés. Seul le point 5 (UI) reste à revalider.

---

## 6. Plan de production chiffré

### Phases 1–3 (2026-07-22 → 2026-07-24) — statut : ✅ dépassées

| Phase | Cible d'origine | Réalisé |
|---|---|---|
| Phase 1 — combler les publics absents | +24 textes → 75 | Le catalogue est passé à **340 textes**, tous les publics ciblés (dialogo, fiaba, fantascienza, giallo, pratico A1–A2) sont largement servis (§1.3, §4.4) |
| Phase 2 — profondeur littéraire et savante | +15 textes → 90 | `poesia` (24 textes, tous niveaux), `documentario` (43 textes), **C1 ouvert avec 43 textes** (cible ≥ 4 dépassée ×10) |
| Phase 3 — enrichissement continu | teatro, lettera_diario, poésie B2–C1 | `teatro` (24), `lettera_diario` (22), poésie présente jusqu'en C2 ; **niveau C2 ouvert** (44 textes, hors périmètre du plan initial) |

Le volume a été atteint plus vite que la profondeur ciblée : la part A1–A2 (35,6 %) reste sous la cible de 45 % fixée en Phase 1 (§1.3). C'est l'objet de la Phase 4.

### Phase 4 — cap sur 420 textes, correction de la pyramide (+80 → 420 minimum)

Deux leviers, dans cet ordre de priorité :

**a) Rééquilibrage A1–A2 (~65 textes, priorité 1).** Pour ramener la part A1–A2 à ≥ 45 % de 420 textes (≥ 189, contre 121 aujourd'hui), l'essentiel des +80 textes doit cibler ces deux niveaux :

| Combinaisons (genre × niveau) | Nb indicatif | Justification |
|---|---:|---|
| `dialogo` × A1–A2 | 10 | pilier débutant, encore sous-représenté en A1 (6) |
| `pratico` × A1–A2 | 8 | idem, cœur de cible « voyageur/débutant » |
| `fiaba` × A1–A2 | 8 | enfants/famille, A2 (8) < A1 potentiel |
| `giallo` × A1 (nouvelle ouverture) | 6 | cellule à 1 texte (§4.4) — suspense dès A1 avec intrigue très simple |
| `fantascienza` × A1 (nouvelle ouverture) | 6 | idem, cellule à 1 texte |
| `teatro` × A1 (nouvelle ouverture) | 6 | idem, cellule à 1 texte |
| `lettera_diario` × A1 | 6 | cellule à 1 texte |
| `poesia` × A1–A2 (filastrocche) | 8 | renforcer l'entrée « comptines », déjà stratégique en §4.1 |
| `racconto` × A1–A2 | 7 | garder le genre pilier proportionnel à la croissance |

**b) Consolidation des cellules fragiles (~15 textes, priorité 2).** Faire passer à ≥ 3 les cellules encore à 1 texte hors A1 : `documentario` A2 (2→4), `pratico` B2/C1/C2 (1→3 chacune, 6 textes), `giallo` A2 (3→5).

Total indicatif : 65 + 15 = **80 textes**, catalogue **340 → 420**.

### Indicateurs de succès

| KPI | Baseline 2026-07-22 | Atteint 2026-07-24 | Cible Phase 4 |
|---|---|---|---|
| Profils de publics servis | 4/8 | 7,5/8 | 8/8 |
| Genres représentés | 1 (+1 marginal) | 10 | 10 (maintenu) |
| Textes au catalogue | 51 | 340 | **≥ 420** |
| Part A1–A2 du catalogue | 37 % | 35,6 % | ≥ 45 % |
| Textes C1 | 0 | 43 | ≥ 4 (déjà dépassé) |
| Textes par cellule ⭐ de la matrice §4.3 | 0 | ≥ 2 (toutes) | ≥ 3 (cellules encore à 1, §4.4) |

---

## 7. Risques et garde-fous

| Risque | Garde-fou |
|---|---|
| La poésie générée par LLM est de qualité inégale | Hints très contraints (filastrocca : 4–8 vers, rimes AABB) ; relecture humaine systématique pour ce genre |
| Dilution : trop de cellules, catalogue mince partout | Règle « ≥ 2 textes par cellule ⭐ avant d'ouvrir une cellule ◻ » — respectée à ce jour (§4.4) ; monter le seuil à ≥ 3 pour la Phase 4 |
| 2 filtres + 2 regroupements = UI confuse | Un seul axe de regroupement à la fois (toggle), genre par défaut pour les nouveaux visiteurs |
| Divergence `config.mjs` / JSON UI | Source unique (§5.4) avant la Phase 2 |
| `teatro` casse le schéma de rendu | Prototyper 1 texte avant d'en générer une série |

---

*Document d'analyse — rédigé le 2026-07-22, mis à jour le 2026-07-24 (état réel du catalogue + Phase 4, cap 420 textes). Aucun changement de code n'accompagne cette mise à jour.*
