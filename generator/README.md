# Generator — orchestrateur de contenu

Scripts **Node.js autonomes** (zéro dépendance npm, `fetch` natif — Node ≥ 18), indépendants de tout outil externe, prêts à partir sur le VPS. Deux orchestrateurs, tous deux **idempotents** (relançables à volonté, cron-friendly) :

| Script | Base | Génère |
|---|---|---|
| [`orchestrate.mjs`](orchestrate.mjs) | 12 thèmes (`config.mjs`) | 1 texte par thème × niveau × taille (240 cases, genre implicite = récit) |
| [`orchestrate-matrix.mjs`](orchestrate-matrix.mjs) | `src/texts/category.json` (`curatedMatrix`) | 1 texte par genre × thème × niveau × taille, sur la liste curée de l'analyse [ANALYSE_CATEGORIES.md](../ANALYSE_CATEGORIES.md) |

**`orchestrate-matrix.mjs` est le script à privilégier** : il couvre la dimension `genre` (dialogue, poésie, fable, SF, giallo, documentaire, théâtre, pratique…) en plus du thème, sans exploser en produit cartésien (22 combinaisons curées, pas 12 × 10). Par défaut il couvre les niveaux **A1, A2, B1, B2** (C1 exclu) × les tailles **court, moyen, long** (`molto_lungo` exclu) — soit **93 cellules**, ajustable via `--levels`/`--sizes`.

`orchestrate.mjs` reste disponible pour compléter le socle thématique existant (ex. remplir le C1, ou la taille `molto_lungo`).

## Prérequis

Node.js ≥ 18 (pour `fetch` natif). Aucune installation npm nécessaire.

```bash
export GLM_API_KEY=...           # clé API GLM (Zhipu AI / Z.ai)
```

Par défaut le script appelle l'endpoint Zhipu AI (Chine) :
`https://open.bigmodel.cn/api/paas/v4/chat/completions`.
Pour l'hébergement international Z.ai, surcharger :

```bash
export GLM_BASE_URL=https://api.z.ai/api/paas/v4/chat/completions
export GLM_MODEL=glm-5.2         # nom exact du modèle chez ton fournisseur
```

## Utilisation

### `orchestrate-matrix.mjs` — genre × thème (recommandé)

```bash
# Voir le plan complet sans rien générer (aucun appel API)
node generator/orchestrate-matrix.mjs --dry-run --all

# Générer 5 textes manquants (défaut) : A1-B2 × court/moyen/long
node generator/orchestrate-matrix.mjs

# En générer 20, avec 3 générations en parallèle
node generator/orchestrate-matrix.mjs --limit 20 --concurrency 3

# Remplir toute la matrice curée (93 cellules par défaut — long et coûteux !)
node generator/orchestrate-matrix.mjs --all

# Seulement la phase 1 de l'analyse (priorité 1 = publics absents)
node generator/orchestrate-matrix.mjs --all --priority 1

# Un seul genre, ou un seul thème
node generator/orchestrate-matrix.mjs --all --genre poesia
node generator/orchestrate-matrix.mjs --all --theme cucina

# Niveaux/tailles personnalisés (défaut : A1,A2,B1,B2 × corto,medio,lungo)
node generator/orchestrate-matrix.mjs --all --levels A1,A2 --sizes corto
```

### `orchestrate.mjs` — thème seul (socle existant, genre implicite = récit)

```bash
node generator/orchestrate.mjs --dry-run --all
node generator/orchestrate.mjs --limit 20 --concurrency 3
node generator/orchestrate.mjs --all
node generator/orchestrate.mjs --category cucina --level A1 --size molto_lungo

# Un texte hors matrice, sujet imposé
node generator/generate-one.mjs --id vendemmia --level B1 --category cucina \
  --size medio --topic "Les vendanges au Piémont"
```

## Tester un texte (avant de lancer un lot)

[`test-one.mjs`](test-one.mjs) génère **un seul texte** sans toucher au catalogue réel — idéal pour évaluer un modèle (ex. GLM-4.7-FlashX vs glm-5.2) ou une combinaison avant un run complet. Par défaut le texte va dans `generator/test-output/` (ignoré par git) et `index.json` n'est pas modifié.

```bash
export GLM_API_KEY=...

# Sujet proposé par le LLM
node generator/test-one.mjs --genre dialogo --theme cucina --level A2 --size corto

# Sujet imposé
node generator/test-one.mjs --theme cucina --level A1 --size medio --topic "Une recette de famille"

# Comparer un modèle moins cher, sans changer l'export GLM_MODEL global
node generator/test-one.mjs --genre poesia --theme natura_animali --level A1 --model glm-4.7-flashx

# Une fois satisfait du résultat, l'écrire pour de vrai dans le catalogue
node generator/test-one.mjs --genre dialogo --theme cucina --level A2 --write
```

Affiche en console : temps de génération, nombre de mots/paragraphes/lexique/phrases, le texte complet, le quiz avec la bonne réponse cochée, et un extrait du lexique — pour juger la qualité (traduction, cohérence, respect du niveau) avant de lancer `orchestrate-matrix.mjs` sur un lot.

### Tester la tenue de la longueur (lungo / molto_lungo)

Certains modèles respectent bien le schéma JSON et la couverture lexicale (contraintes strictes, revalidées par le script) mais **sous-dimensionnent la longueur demandée** (contrainte molle, seulement dans le prompt) — ce qui s'aggrave parfois sur les tailles longues. [`test-sizes.mjs`](test-sizes.mjs) génère le **même sujet** sur plusieurs tailles pour mesurer ça proprement :

```bash
export GLM_API_KEY=...
node generator/test-sizes.mjs --genre dialogo --theme cucina --level A2 \
  --sizes lungo,molto_lungo --model glm-4.7-flashx
```

Sort un tableau `taille · cible · réel · ratio · paragraphes · temps` et une conclusion automatique sur la dérive du ratio entre la plus petite et la plus grande taille testée. Comme `test-one.mjs`, rien n'est écrit dans `index.json` (fichiers dans `test-output/`).

## Pipeline par texte

1. **Sujet** — le LLM propose un sujet + slug pour la cellule, en évitant les titres déjà présents dans le thème. Avec `orchestrate-matrix.mjs`, le hint du genre (ex. « dialogue oral, tours de parole courts ») est injecté en plus du hint du thème.
2. **Génération** — texte complet au format de l'app (paragraphes, lexique mot→fr, phrases→fr, quiz). Le schéma est décrit dans le prompt et demandé en JSON strict (`response_format: json_object`) ; pas de garantie de schéma côté API (contrairement aux "structured outputs" propriétaires), donc tout est revalidé côté script. Pour un genre donné (théâtre, poésie…), le prompt rappelle la convention de mise en forme des paragraphes (ex. `"NOM — réplique"` pour le théâtre).
3. **Validation** — mêmes découpages que le lecteur (`ReaderView`/`translate.js`) : chaque mot et chaque phrase doit avoir sa traduction. Jusqu'à 2 passes de réparation ; si la couverture reste incomplète, la cellule est marquée en échec (rien n'est écrit).
4. **Écriture** — `TEXTS_DIR/<id>.json` + mise à jour de `index.json` (avec `category`, `size`, et `genre` pour `orchestrate-matrix.mjs`).

Les échecs sont journalisés dans `generator/state.json` (clé `genre|thème|niveau|taille` ou `thème|niveau|taille` selon le script) et retentés au run suivant.

## Configuration (env)

| Variable | Défaut | Rôle |
|---|---|---|
| `GLM_API_KEY` | — | clé API GLM (obligatoire) |
| `GLM_MODEL` | `glm-5.2` | modèle utilisé |
| `GLM_BASE_URL` | endpoint Zhipu AI | endpoint chat completions (compatible OpenAI) |
| `TEXTS_DIR` | `../src/texts` | dossier de sortie des JSON |
| `GENERATOR_STATE` | `generator/state.json` | fichier d'état |

Thèmes (legacy), niveaux et tailles de `orchestrate.mjs` se règlent dans [config.mjs](config.mjs). Genres, thèmes et matrice curée de `orchestrate-matrix.mjs` se règlent dans [`src/texts/category.json`](../src/texts/category.json) (surchargeable via `CATEGORY_FILE`).

## Sur le VPS

Le dossier se copie seul, sans le reste du repo ni npm install :

```bash
scp -r generator/ vps:/opt/leggendo-generator/
ssh vps 'cd /opt/leggendo-generator && node --version'   # vérifier Node ≥ 18
# cron : 5 textes par nuit
# 0 3 * * * cd /opt/leggendo-generator && GLM_API_KEY=... TEXTS_DIR=/opt/leggendo/texts node orchestrate.mjs --limit 5 >> orchestrate.log 2>&1
```
