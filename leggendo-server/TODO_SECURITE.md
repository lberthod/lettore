# Suivi des corrections — génération IA & sécurité

Issu de la revue du 2026-07-24 sur `leggendo-server/server.mjs`.

| # | Sujet | Statut | Détail |
|---|-------|--------|--------|
| 1 | Quota consommé avant écriture Firestore réussie | ✅ fait | `consumeQuota` déplacé après `jobRef.set` réussi dans `server.mjs` |
| 2 | `quotas.json` écrit en async sans gestion d'erreur | ✅ fait | Quotas migrés vers Firestore (`leggendoQuotas`), consommés dans la même transaction que la création du job (`reserveJob`) |
| 3 | `decodeClaims` décode le JWT à la main après `accounts:lookup` | ✅ fait | Remplacé par `firebase-admin/auth.verifyIdToken()` (vérification + claims en un seul appel local, plus de `FIREBASE_API_KEY`) |
| 4 | Aucun test automatisé | ✅ fait | Logique quota/jobs/validation extraite (`quota.mjs`, `jobs.mjs`, `validate.mjs`) et testée via `node --test` (21 tests) avec un faux Firestore en mémoire (`test/fake-firestore.mjs`) — `npm test` |

Légende : ⬜ à faire · 🔄 en cours · ✅ fait
