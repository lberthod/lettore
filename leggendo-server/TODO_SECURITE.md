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

## Hors périmètre de cette passe (voir README_TARIFICATION.md)

- Fonctionnalités Enseignant : classes/dossiers, export PDF, personnalisation des quiz, duplication de texte, statistiques.
- Intégration Stripe (webhooks, portail client, attribution/retrait automatique des rôles).
- Alerte automatisée en temps réel sur le ratio coût IA / revenu (25 %) — pour l'instant seulement un seuil par génération, pas d'agrégation.
