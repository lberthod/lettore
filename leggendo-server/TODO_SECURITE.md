# Suivi des corrections — génération IA & sécurité

Issu de la revue du 2026-07-24 sur `leggendo-server/server.mjs`.

| # | Sujet | Statut | Détail |
|---|-------|--------|--------|
| 1 | Quota consommé avant écriture Firestore réussie | ✅ fait | `consumeQuota` déplacé après `jobRef.set` réussi dans `server.mjs` |
| 2 | `quotas.json` écrit en async sans gestion d'erreur | ✅ fait | Quotas migrés vers Firestore (`leggendoQuotas`), consommés dans la même transaction que la création du job (`reserveJob`) |
| 3 | `decodeClaims` décode le JWT à la main après `accounts:lookup` | ✅ fait | Remplacé par `firebase-admin/auth.verifyIdToken()` (vérification + claims en un seul appel local, plus de `FIREBASE_API_KEY`) |
| 4 | Aucun test automatisé | ✅ fait | Logique quota/jobs/validation extraite (`quota.mjs`, `jobs.mjs`, `validate.mjs`) et testée via `node --test` (27 tests) avec un faux Firestore en mémoire (`test/fake-firestore.mjs`) — `npm test` |
| 5 | Quotas jour/mois non conformes à README_TARIFICATION.md | ✅ fait | `quota.mjs` réécrit en système de crédits (1 essai gratuit à vie, Premium sans accès, 30 crédits/mois Premium IA, 100/mois Enseignant, coût par taille de texte) ; remboursement automatique si le job échoue (`jobStore.refundCredit`) |
| 6 | Aucune mesure des coûts IA | ✅ fait | `logGeneration` dans `server.mjs` écrit dans Firestore (`generationLogs`) : uid, rôle, taille, crédits, appels modèle, tokens, coût estimé ; alerte loguée au-delà de 0.50 $/génération |

Légende : ⬜ à faire · 🔄 en cours · ✅ fait

## P1 — Essai IA exploitable par création massive de comptes

Issu de la revue du 2026-07-26. L'inscription créait un compte utilisable
sans validation d'adresse, et l'API acceptait tout ID token Firebase valide
sans contrôler `email_verified`, App Check, ni limite transversale par IP —
or chaque compte gratuit reçoit un essai IA gratuit : un script pouvait donc
automatiser inscription → essai → nouveau compte pour consommer le
fournisseur LLM sans jamais dépasser le quota par compte.

| # | Mesure | Statut | Détail |
|---|--------|--------|--------|
| 1 | Vérification d'adresse obligatoire avant l'essai | ✅ fait | `register()` envoie le lien de confirmation ([auth.js](../src/lib/auth.js)) ; `quotaError` refuse l'essai tant que `emailVerified` est faux ([quota.mjs](quota.mjs)) ; bandeau + relance dans [CreateTextView.vue](../src/views/CreateTextView.vue) et [ProfileView.vue](../src/views/ProfileView.vue) |
| 2 | Firebase App Check (app + API) | ✅ fait | Client : `initAppCheck` (ReCaptchaV3Provider) dans [firebase.js](../src/lib/firebase.js), désactivé tant que `VITE_RECAPTCHA_SITE_KEY` n'est pas renseignée. Serveur : [appcheck.mjs](appcheck.mjs), modes `off`/`soft`/`enforce` via `APP_CHECK_MODE` — démarrer en `soft` (observation) avant `enforce` |
| 3 | Limite complémentaire par IP | ✅ fait | [ratelimit.mjs](ratelimit.mjs) : plafond de comptes d'essai distincts par IP/24h (`MAX_TRIAL_ACCOUNTS_PER_IP`, défaut 5) et plafond global de générations par IP/24h (`MAX_GENERATIONS_PER_IP`, défaut 40), en mémoire (garde-fou complémentaire, pas la source de vérité des quotas) |
| 4 | Alerte sur créations/générations anormales | ✅ fait | `onUserCreated` (Cloud Function, [functions/index.js](../functions/index.js)) journalise au-delà de `SIGNUPS_ALERT_PER_HOUR` (défaut 30/h) ; `server.mjs` journalise au-delà de `TRIAL_ALERT_PER_HOUR` (défaut 20/h) — alertes dans les logs (`journalctl`/`firebase functions:log`), pas encore de notification active |
| 5 | CAPTCHA sur l'inscription | ⬜ à faire | Non fait séparément : App Check (reCAPTCHA v3, invisible) couvre le même besoin sans friction supplémentaire à l'inscription ; à revisiter seulement si l'abus persiste malgré 1–4 |

**Reste à faire manuellement avant l'ouverture publique** : créer la clé
reCAPTCHA v3 dans la console Firebase (App Check → Applications → Web),
renseigner `VITE_RECAPTCHA_SITE_KEY` côté build et enregistrer la clé côté
Cloud Functions/App Check, puis passer `APP_CHECK_MODE` de `off` à `soft`
quelques jours pour confirmer que le vrai trafic est bien attesté avant de
passer à `enforce`.

## Hors périmètre de cette passe (voir README_TARIFICATION.md)

- Fonctionnalités Enseignant : classes/dossiers, export PDF, personnalisation des quiz, duplication de texte, statistiques.
- Intégration Stripe (webhooks, portail client, attribution/retrait automatique des rôles).
- Alerte automatisée en temps réel sur le ratio coût IA / revenu (25 %) — pour l'instant seulement un seuil par génération, pas d'agrégation.

## P1 — Dépendances serveur signalées comme vulnérables (audit `npm audit --omit=dev`, 2026-07-25)

**Statut : accepté / faux positif, pas de correctif à ce jour.**

`npm audit` remonte 9 (Cloud Functions) / 8 (`leggendo-server`) vulnérabilités modérées, toutes issues d'une seule chaîne : `firebase-admin` → `@google-cloud/storage` → `teeny-request`/`retry-request`/`gaxios` → `uuid` (CVE sur les fonctions v3/v5/v6 d'UUID nommées, `uuid < 11.1.1`).

Vérifié concrètement (pas seulement lu dans le rapport) :
- `npm audit fix` (sans `--force`) ne corrige rien : les deux paquets restent inchangés.
- La seule mise à niveau proposée (`firebase-admin` 13.10.0 → 14.2.0, `--force`) a été testée en local : `@google-cloud/storage@7.21.0` (dernière version existante, y compris sous firebase-admin 14.x) dépend toujours de `google-auth-library@9.x` → `gaxios@6.x` → `uuid@9.x` — le correctif n'existe pas encore en amont chez Google. Pire, elle introduit une nouvelle vulnérabilité *high* (`brace-expansion` via la chaîne `google-gax@5.x` → `rimraf`/`glob` obsolètes de Firestore), faisant passer le total de 9 à 12. `firebase-functions@6.6.0` déclare en plus un peer-dependency `firebase-admin ^11–13`, incompatible avec la v14.
- Le code du projet n'utilise ni `instanceId` ni d'API dépréciée par firebase-admin v14, donc pas de blocage côté code — le blocage est uniquement en amont (paquets Google Cloud pas encore migrés).
- `firebase-admin` v14 exigerait Node ≥ 22 alors que le [README du serveur VPS](README.md) documente `Node ≥ 18` — à vérifier avant toute tentative future.

Le chemin de code réellement exécuté par `@google-cloud/storage`/`firestore` n'appelle pas les fonctions `uuid` v3/v5/v6 concernées par le CVE : risque jugé non exploitable ici.

**À faire** : réévaluer avec `npm audit` quand une nouvelle version de `@google-cloud/storage` migrera vers `google-auth-library@10.x`/`gaxios@7.x` (le correctif viendra de là, pas d'un bump de `firebase-admin`).
