# Scripts — pipeline de contenu

Génération de textes par LLM (API Claude) et gestion de la base Firestore. Ces scripts tournent hors de l'app : sur ton Mac ou en cron sur le VPS.

## Prérequis

```bash
npm install
```

**API Claude** — une clé dans l'environnement :

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

**Firestore (sink `firestore` et publication)** — une clé de compte de service :

1. Console Firebase → Paramètres du projet → Comptes de service → *Générer une nouvelle clé privée*
2. `export GOOGLE_APPLICATION_CREDENTIALS=/chemin/vers/serviceAccount.json`

Le sink `local` (défaut) n'a besoin que de la clé API Claude.

## Générer un texte

```bash
# Écrit src/texts/<id>.json + met à jour index.json (workflow actuel, statique)
node scripts/generate-text.mjs --id vendemmia --level B1 --topic "Les vendanges au Piémont"

# Écrit un brouillon dans Firestore (workflow base en ligne)
node scripts/generate-text.mjs --id vendemmia --level B1 --topic "Les vendanges au Piémont" --sink firestore
```

Options : `--words <n>` (longueur cible), `--free` (texte gratuit, sinon premium).

Le script impose le format exact de l'app via un schéma JSON (structured outputs), puis **valide la couverture lexicale** : chaque mot et chaque phrase du texte doit avoir sa traduction, vérifié avec le même découpage que le lecteur (`ReaderView` / `translate.js`). Les manques déclenchent jusqu'à deux passes de réparation automatiques.

## Relire et publier (Firestore)

Les textes générés arrivent en `status: draft` — invisibles pour l'app (les security rules n'exposent que `published`). Après relecture :

```bash
node scripts/publish-text.mjs --id vendemmia       # draft → published + index
node scripts/publish-text.mjs --id vendemmia --unpublish
node scripts/publish-text.mjs --reindex            # reconstruit meta/index seul
```

## Structure Firestore

```
texts/<id>       # doc complet : paragraphs, words, sentences, questions,
                 # + status (draft|published), premium (bool), timestamps
meta/index       # { entries: [...] } — index léger des textes publiés
```

Les règles d'accès sont dans [firestore.rules](../firestore.rules) : textes gratuits publics, textes premium réservés au custom claim `premium` (posé par le webhook Stripe). L'écriture passe exclusivement par l'Admin SDK.

## Cron VPS (exemple)

```cron
# Un nouveau texte B1 chaque lundi à 6h, en brouillon à relire
0 6 * * 1 cd /srv/leggendo && node scripts/generate-text.mjs --id auto-$(date +\%s) --level B1 --topic "$(shuf -n1 topics.txt)" --sink firestore
```
