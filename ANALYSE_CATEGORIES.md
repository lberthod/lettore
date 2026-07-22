# Analyse de la taxonomie de contenu — toucher tous les publics

Stratégie de catégorisation du Lettore Italiano : état des lieux chiffré, publics visés, proposition d'une taxonomie à deux dimensions (genre × thème), plan de production chiffré.

---

## 0. Synthèse exécutive (TL;DR)

1. **Le problème n'est pas le nombre de catégories, c'est l'axe unique.** Les 12 catégories actuelles décrivent toutes *de quoi parle* le texte, jamais *comment il est écrit*. 51 textes sur 51 sont du récit/article en prose : zéro poésie, zéro fiction de genre, zéro dialogue, zéro fable.
2. **4 publics sur 8 ne sont pas servis** : lecteurs littéraires, ados (SF/policier), enfants/famille (fables), curieux scientifiques.
3. **Solution : ajouter une dimension `genre` (10 valeurs) orthogonale au thème**, plutôt que de gonfler la liste des thèmes. Un poème sur les Alpes = `genre: poesia` × `category: montagna`. Zéro migration des textes existants (tous → `racconto`, sauf 1).
4. **Ne pas générer le produit cartésien** (2 800 cellules) : une liste curée de ~45 combinaisons genre × thème × niveau suffit pour couvrir tous les publics (§6).
5. **Objectif Phase 1 : +24 textes ciblés** (dialogues A1–A2, fables, SF/giallo A2–B1, textes pratiques) → couverture des 8 profils passe de 4/8 à 8/8.

---

## 1. État des lieux chiffré

### 1.1 Les 12 catégories actuelles

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

---

## 2. Publics : qui lit, qu'attend-il, est-il servi ?

| Profil | Attente | Genres qui le retiennent | Niveaux | Servi aujourd'hui ? |
|---|---|---|---|:-:|
| Débutant scolaire / autodidacte | Textes courts et rassurants | Dialogues, mini-récits, fables, pratique | A1–A2 | 🟡 partiel (récits seuls) |
| Voyageur / expatrié | Situations réelles | Dialogues situationnels, textes pratiques | A2–B1 | 🟡 partiel |
| Passionné de culture italienne | Histoire, art, gastronomie | Documentaire, biographies | B1–B2 | ✅ bien servi |
| Senior / apprenant loisir | Terroir, histoires humaines | Récits de vie, lettres, traditions | A2–B1 | ✅ bien servi |
| **Lecteur littéraire** | Plaisir de lire, belle langue | Nouvelles, poésie, classiques adaptés | B1–C1 | ❌ absent |
| **Ado / jeune adulte** | Imaginaire, suspense | SF, fantastique, policier | A2–B2 | ❌ absent |
| **Enfant / lecture en famille** | Histoires ludiques | Fables, contes, animaux | A1–A2 | ❌ absent |
| **Curieux scientifique** | Apprendre en lisant | Vulgarisation, géographie, techno | B1–C1 | ❌ quasi absent (1 texte) |

**Score de couverture actuel : 4/8 profils** (2 bien servis, 2 partiels). Chaque profil non servi est un segment qui ne revient pas après la première visite.

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

### 4.3 Matrice genre × niveau — cible de couverture

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

---

## 5. Implications techniques (hors périmètre de ce document, à planifier)

1. **Données** : champ `genre` dans `index.json` (existants → `racconto`, `lettera` → `lettera_diario`) ; nouveau `src/texts/genres.json` calqué sur `categories.json`.
2. **Générateur** : `GENRES` dans `config.mjs` ; le prompt compose hint-genre + hint-thème. Le schéma de sortie (`title, level, paragraphs, questions, words, sentences`) reste valable pour tous les genres — un poème = paragraphes courts ; seul `teatro` demandera peut-être une convention (préfixe « MARCO — » dans les paragraphes).
3. **Matrice de génération** : remplacer le produit cartésien (14 thèmes × 10 genres × 5 niveaux × 4 tailles = 2 800 cellules) par la **liste curée du §6** (~45 combinaisons en phase 1–2). L'orchestrateur idempotent actuel s'y prête déjà (`--category/--level/--size` → ajouter `--genre`).
4. **Source unique de vérité** : le générateur lit `categories.json` + `genres.json` (ou les génère depuis `config.mjs`) — supprimer la double maintenance.
5. **UI (LibraryView)** : filtre « Genre » à côté de Niveau/Taille/Catégorie ; toggle de regroupement « par genre / par thème ». Garder ≤ 2 filtres visibles par défaut sur mobile.
6. **Quick wins immédiats** : re-tag `pioggia` → `vita_quotidiana` ; libellés élargis de `regioni`/`viaggi`/`societa` (changement de `name` uniquement, ids stables).

---

## 6. Plan de production chiffré

### Phase 1 — combler les publics absents (+24 textes → 75)

| Combinaisons (genre × thème × niveau) | Nb | Public débloqué |
|---|---:|---|
| `dialogo` × {vita_quotidiana, viaggi, cucina, scuola_lavoro} × A1–A2 | 8 | débutants, voyageurs |
| `fiaba` × {natura_animali, feste} × A1–A2 | 4 | enfants / famille |
| `fantascienza` × {scienza_tecnologia, vita_quotidiana} × A2–B1 | 4 | ados |
| `giallo` × {viaggi, societa} × A2–B1 | 4 | ados / jeunes adultes |
| `pratico` × {cucina, viaggi} × A1–A2 | 4 | voyageurs, débutants |

Effet attendu : couverture des profils 4/8 → **8/8** ; ratio A1–A2 remonte de 37 % à ~50 % du catalogue (correction de la pyramide inversée).

### Phase 2 — profondeur littéraire et savante (+15 textes → 90)

- `poesia` A1 (filastrocche) puis A2–B1 : 5 textes
- `documentario` × {regioni élargi, scienza_tecnologia, storia_*} B1–B2 : 6 textes
- **Ouverture du C1** : `documentario`, `racconto`, `giallo` : 4 textes

### Phase 3 — enrichissement continu

- `teatro` A2–B1, `lettera_diario` supplémentaires
- Poésie B2–C1 : extraits adaptés de classiques **libres de droits** (Leopardi, Pascoli, Carducci — morts avant 1955, domaine public)
- Équilibrage piloté par l'usage : si les stats de lecture (progress) montrent qu'un genre sur-performe, densifier sa colonne dans la matrice §4.3.

### Indicateurs de succès

| KPI | Aujourd'hui | Cible post-Phase 2 |
|---|---|---|
| Profils de publics servis | 4/8 | 8/8 |
| Genres représentés | 1 (+1 marginal) | 10 |
| Part A1–A2 du catalogue | 37 % | ≥ 45 % |
| Textes C1 | 0 | ≥ 4 |
| Textes par cellule ⭐ de la matrice §4.3 | 0 | ≥ 2 |

---

## 7. Risques et garde-fous

| Risque | Garde-fou |
|---|---|
| La poésie générée par LLM est de qualité inégale | Hints très contraints (filastrocca : 4–8 vers, rimes AABB) ; relecture humaine systématique pour ce genre |
| Dilution : trop de cellules, catalogue mince partout | Règle « ≥ 2 textes par cellule ⭐ avant d'ouvrir une cellule ◻ » |
| 2 filtres + 2 regroupements = UI confuse | Un seul axe de regroupement à la fois (toggle), genre par défaut pour les nouveaux visiteurs |
| Divergence `config.mjs` / JSON UI | Source unique (§5.4) avant la Phase 2 |
| `teatro` casse le schéma de rendu | Prototyper 1 texte avant d'en générer une série |

---

*Document d'analyse — juillet 2026. Aucun changement de code n'accompagne ce document.*
