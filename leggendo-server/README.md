# leggendo-server — API « Créer son texte »

Serveur Node (http natif + fetch, Node ≥ 18 ; seule dépendance npm : `firebase-admin`, pour Firestore) qui tourne sur le VPS derrière Caddy (`api.loicberthod.ch/leggendo/*`). Un utilisateur connecté (Firebase Auth) demande un texte sur mesure (sujet, niveau, genre, thème, taille) ; la génération GLM prenant plusieurs minutes, l'API fonctionne en **mode job** : l'app crée un job puis sonde son état ([src/lib/generation.js](../src/lib/generation.js)), et enregistre le texte fini dans Firestore ([src/lib/userTexts.js](../src/lib/userTexts.js)).

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
- **Un seul job actif par compte** ; jobs persistés dans Firestore (collection `leggendoJobs`, survivent à un redémarrage du VPS), purgés après 1 h (TTL) ; un job actif depuis plus de 45 min est marqué en erreur (filet anti-blocage, en plus du timeout des appels GLM).
- **CORS** restreint aux origines listées dans `ALLOWED_ORIGINS` (le token Firebase reste la vraie protection, ceci évite juste qu'un site tiers rejoue les appels authentifiés depuis le navigateur d'un utilisateur).
- **Validation** : même exigence de couverture lexicale que le catalogue ([generate.mjs](generate.mjs), découpage identique au lecteur, passes de réparation) — le lexique des mots doit être complet ; jusqu'à 2 phrases sans traduction sont tolérées plutôt que de jeter la génération.

## Configuration (env)

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `8091` | port d'écoute |
| `FIREBASE_API_KEY` | clé web du projet | vérification des ID tokens |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | chemin vers la clé JSON du compte de service (accès Firestore, obligatoire) |
| `ALLOWED_ORIGINS` | `https://leggendo-dbb84.web.app,https://leggendo-dbb84.firebaseapp.com,http://localhost:5173` | origines autorisées (CORS), séparées par des virgules |
| `GLM_API_KEY` | — | clé API GLM (obligatoire) |
| `GLM_MODEL` | `glm-5.1` | modèle utilisé |
| `GLM_BASE_URL` | endpoint Zhipu AI | endpoint chat completions (compatible OpenAI) |
| `GLM_FALLBACK_URL` | endpoint Z.ai | bascule automatique en cas d'erreur réseau sur l'endpoint principal |
| `GLM_TIMEOUT_MS` | 8 min | timeout par appel GLM |

En prod, ces variables sont posées via `leggendo-api.env` (copie de [leggendo-api.env.example](leggendo-api.env.example)), chargé par le service systemd — voir [Déploiement](#déploiement).

## Identifiants Firestore (compte de service)

Le VPS n'est pas un runtime GCP géré : le SDK Admin (`firebase-admin`) a donc besoin d'une clé de compte de service explicite pour accéder à Firestore.

1. Console Google Cloud → *IAM & Admin* → *Comptes de service*, projet `leggendo-dbb84`.
2. Créer un compte de service dédié (ex. `leggendo-server-vps`) avec le rôle minimal **Cloud Datastore User** (lecture/écriture Firestore uniquement).
3. Générer une clé JSON, la télécharger.
4. La déposer sur le VPS **hors du repo** (ex. `/opt/leggendo-api/service-account.json`, permissions `600`).
5. Définir `GOOGLE_APPLICATION_CREDENTIALS=/opt/leggendo-api/service-account.json` dans l'environnement du service (variable d'env au lancement ou unité systemd).

Au premier appel réel à `activeJobFor` (garde-fou « un seul job actif » / `/leggendo/my-job`), Firestore peut demander la création d'un index composite (`uid` + `status` + `createdAt`) : le message d'erreur contient un lien direct pour le créer en un clic depuis la console.

## Déploiement

Le dossier se copie seul (`category.json` inclus, copie de [src/texts/category.json](../src/texts/category.json) — à resynchroniser quand la taxonomie change) :

```bash
scp -r leggendo-server/ vps:/opt/leggendo-api/
ssh vps 'cd /opt/leggendo-api && npm install --omit=dev'
```

Puis, sur le VPS (une seule fois) :

1. Déposer la clé du compte de service dans `/opt/leggendo-api/service-account.json` (`chmod 600`, hors du repo — voir [Identifiants Firestore](#identifiants-firestore-compte-de-service) ci-dessus).
2. Copier `leggendo-api.env.example` en `/opt/leggendo-api/leggendo-api.env` (`chmod 600`) et renseigner `GLM_API_KEY` (et ajuster `ALLOWED_ORIGINS`/`GOOGLE_APPLICATION_CREDENTIALS` si les chemins diffèrent).
3. Créer un compte système dédié et installer le service :

```bash
sudo useradd --system --home /opt/leggendo-api --shell /usr/sbin/nologin leggendo
sudo chown -R leggendo:leggendo /opt/leggendo-api
sudo cp /opt/leggendo-api/leggendo-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now leggendo-api
sudo systemctl status leggendo-api
```

Le service redémarre automatiquement (`Restart=on-failure`) et les jobs/quotas survivent grâce à Firestore (jobs) et au fichier `quotas.json` (quotas), tous deux persistés indépendamment du process.

Pour une mise à jour du code : `scp` à nouveau, `npm install --omit=dev` si `package.json` a changé, puis `sudo systemctl restart leggendo-api`.

Caddy proxifie `api.loicberthod.ch/leggendo/*` vers `localhost:8091` ; l'URL côté app se règle via `VITE_LEGGENDO_API`.

## Notizie — cron d'actualité (Premium+)

[news-cron.mjs](news-cron.mjs) est un script indépendant du serveur HTTP (`server.mjs`) : il ne tourne pas en continu, il est **invoqué par cron** et fait une seule chose à chaque exécution — récupérer les flux RSS ANSA ([rss.mjs](rss.mjs)), choisir un article pas encore traité, générer un texte gradué qui le reformule fidèlement ([news.mjs](news.mjs)), et l'écrire dans Firestore (collection `newsTexts`). L'app lit ce pool via [src/lib/newsTexts.js](../src/lib/newsTexts.js) (page « Notizie », réservée au rôle `premium_plus`, voir [firestore.rules](../firestore.rules) et [PREMIUM_PLUS_ANALYSIS.md](../PREMIUM_PLUS_ANALYSIS.md)).

Pool partagé, pas un appel par abonné : chaque exécution produit **un seul texte**, lu ensuite par tous les abonnés Premium+ — planifier 3 exécutions par jour donne bien « jusqu'à 3 textes par jour », sans multiplier le coût par le nombre d'abonnés.

Mêmes identifiants que le serveur HTTP (`GLM_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS` — voir [Configuration](#configuration-env) et [Identifiants Firestore](#identifiants-firestore-compte-de-service) ci-dessus), pas de port ni de service systemd à installer.

```bash
# crontab -e (même utilisateur système que leggendo-api.service)
0 7,13,20 * * * cd /opt/leggendo-api && \
  GLM_API_KEY=... GOOGLE_APPLICATION_CREDENTIALS=/opt/leggendo-api/service-account.json \
  /usr/bin/node news-cron.mjs >> /var/log/leggendo-news.log 2>&1
```

Le rôle `premium_plus` n'est pour l'instant posé que manuellement (`adminSetUserRole`, voir [functions/index.js](../functions/index.js)) — le webhook Stripe ne le pose pas encore automatiquement (à faire quand le Payment Link Premium+ sera actif, voir `src/lib/stripe.js`).
