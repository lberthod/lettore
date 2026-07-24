# leggendo-server — API « Créer son texte »

Serveur Node **sans dépendance npm** (http natif + fetch, Node ≥ 18) qui tourne sur le VPS derrière Caddy (`api.loicberthod.ch/leggendo/*`). Un utilisateur connecté (Firebase Auth) demande un texte sur mesure (sujet, niveau, genre, thème, taille) ; la génération GLM prenant plusieurs minutes, l'API fonctionne en **mode job** : l'app crée un job puis sonde son état ([src/lib/generation.js](../src/lib/generation.js)), et enregistre le texte fini dans Firestore ([src/lib/userTexts.js](../src/lib/userTexts.js)).

## Endpoints

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/leggendo/health` | vitalité + modèle utilisé |
| GET | `/leggendo/taxonomy` | niveaux, tailles, genres, thèmes (copie de `category.json`) |
| POST | `/leggendo/generate` | crée un job → `{ jobId }` (auth requise) |
| GET | `/leggendo/jobs/<uuid>` | état du job : `pending` / `running` / `done` (+ texte) / `error` |
| GET | `/leggendo/my-job` | job actif du compte (reprise après rechargement) |

Garde-fous :

- **Auth** : l'ID token Firebase (header `Authorization: Bearer …`) est vérifié via l'API identitytoolkit — pas de SDK admin sur le VPS. Le rôle (`gratuit` / `premium` / `enseignant`) est relu depuis les custom claims embarqués dans le token (posés côté Cloud Functions, voir [functions/index.js](../functions/index.js)).
- **Quotas** (persistés dans `quotas.json`, à côté du serveur, pour survivre à un redémarrage) :
  - compte gratuit : 3 générations « de bienvenue » cumulées, puis 1 génération par jour une fois ce capital épuisé ;
  - compte payant (`premium` / `enseignant`) : 10 générations par jour, 100 par mois.
- **Un seul job actif par compte** ; jobs en mémoire (perdus au redémarrage du VPS), purgés après 1 h (TTL) ; un job actif depuis plus de 45 min est marqué en erreur (filet anti-blocage, en plus du timeout des appels GLM).
- **CORS** restreint aux origines listées dans `ALLOWED_ORIGINS` (le token Firebase reste la vraie protection, ceci évite juste qu'un site tiers rejoue les appels authentifiés depuis le navigateur d'un utilisateur).
- **Validation** : même exigence de couverture lexicale que le catalogue ([generate.mjs](generate.mjs), découpage identique au lecteur, passes de réparation) — le lexique des mots doit être complet ; jusqu'à 2 phrases sans traduction sont tolérées plutôt que de jeter la génération.

## Configuration (env)

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `8091` | port d'écoute |
| `FIREBASE_API_KEY` | clé web du projet | vérification des ID tokens |
| `ALLOWED_ORIGINS` | `https://leggendo-dbb84.web.app,https://leggendo-dbb84.firebaseapp.com,http://localhost:5173` | origines autorisées (CORS), séparées par des virgules |
| `GLM_API_KEY` | — | clé API GLM (obligatoire) |
| `GLM_MODEL` | `glm-5.1` | modèle utilisé |
| `GLM_BASE_URL` | endpoint Zhipu AI | endpoint chat completions (compatible OpenAI) |
| `GLM_FALLBACK_URL` | endpoint Z.ai | bascule automatique en cas d'erreur réseau sur l'endpoint principal |
| `GLM_TIMEOUT_MS` | 8 min | timeout par appel GLM |

## Déploiement

Le dossier se copie seul (`category.json` inclus, copie de [src/texts/category.json](../src/texts/category.json) — à resynchroniser quand la taxonomie change) :

```bash
scp -r leggendo-server/ vps:/opt/leggendo-api/
ssh vps 'cd /opt/leggendo-api && GLM_API_KEY=... node server.mjs'   # ou via systemd
```

Caddy proxifie `api.loicberthod.ch/leggendo/*` vers `localhost:8091` ; l'URL côté app se règle via `VITE_LEGGENDO_API`.
