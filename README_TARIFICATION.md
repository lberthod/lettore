# Tarification Leggendo — décision de lancement

Ce document fixe la tarification et le périmètre fonctionnel à implémenter pour
le lancement commercial de Leggendo.

## Décision

Les quatre formules seront disponibles dès le lancement :

| Formule | Prix mensuel | Prix annuel | Public |
|---|---:|---:|---|
| Gratuit | 0 € | 0 € | Découverte |
| Premium | 7,90 € | 79 € | Apprenants réguliers |
| Premium IA | 14,90 € | 149 € | Apprenants souhaitant créer leurs lectures |
| Enseignant | 24,90 € | 249 € | Enseignants et classes |

Les offres annuelles correspondent approximativement à deux mois offerts.

Le lancement ne sera pas progressif : Gratuit, Premium et Premium IA doivent
être fonctionnels au moment de l'ouverture des paiements. **Enseignant est
annoncé sur la page tarifaire mais reste « bientôt disponible » : pas de lien
de paiement actif tant que les fonctions pédagogiques (classes, partage,
export) ne sont pas livrées.**

## Essai Premium IA à l'inscription

Chaque nouveau compte reçoit automatiquement le rôle `premium_plus` (Premium
IA) pendant **10 jours** à partir de la création du compte, sans carte
bancaire.

- L'essai est accordé au moment de la création du compte Firebase (déclencheur
  `onUserCreated`, voir `functions/index.js`).
- Pendant l'essai, le compte a les mêmes droits qu'un abonné Premium IA payant
  (catalogue complet, 30 crédits de génération, Classici, Notizie).
- À l'expiration des 10 jours, si aucun paiement n'a été effectué (pas de
  `periodEnd` Stripe/Play/Apple posé sur le compte), le rôle repasse
  automatiquement à `gratuit`. Le compte n'est jamais bloqué : il retrouve
  simplement les limites de la formule Gratuit.
- Si l'utilisateur s'abonne (Premium ou Premium IA) pendant l'essai, le
  paiement prend le relais normalement et l'essai n'a plus d'effet.
- Le retour au gratuit est effectué côté serveur par une fonction planifiée
  (`revertExpiredTrials`), jamais côté client : les claims du token restent la
  source de vérité.

## Principes

1. Le gratuit démontre toute la qualité de lecture, mais limite le volume.
2. Premium débloque la bibliothèque et l'expérience d'apprentissage complète.
3. Premium IA ajoute la personnalisation par génération de textes.
4. Enseignant inclut Premium IA et ajoute des outils pédagogiques.
5. Les quotas de génération sont mensuels, jamais quotidiens.
6. Les avantages doivent être contrôlés côté serveur, pas seulement masqués
   dans l'interface.

## Gratuit — 0 €

### Promesse

Découvrir la méthode Leggendo gratuitement.

### Fonctionnalités

- 6 à 10 textes complets répartis sur plusieurs niveaux ;
- traduction des mots et des phrases ;
- lecture audio en italien ;
- quiz de compréhension ;
- progression locale ;
- inscription gratuite ;
- une génération IA d'essai après inscription ;
- **Classici** (aperçu, dès la connexion) : le premier chapitre de chaque
  livre du catalogue, plus un livre entier par niveau A2, B2 et C2 — voir la
  section « Classici » de [README.md](README.md).

Le compte gratuit ne débloque pas automatiquement tout le catalogue.

## Premium — 7,90 €/mois

### Promesse

Lire sans limites et progresser régulièrement.

### Fonctionnalités

- tout le contenu Gratuit ;
- accès à l'ensemble du catalogue ;
- tous les niveaux, de A1 à C2 ;
- **catalogue Classici complet** (au-delà de l'aperçu offert au compte
  Gratuit) ;
- traductions, audio et quiz ;
- favoris et vocabulaire sauvegardé ;
- progression synchronisée entre appareils ;
- nouveaux textes ajoutés régulièrement ;
- lecture hors ligne lorsque le contenu a été téléchargé.

Premium est l'offre recommandée pour la majorité des apprenants.

## Premium IA — 14,90 €/mois

### Promesse

Créer des lectures adaptées à son niveau et à ses centres d'intérêt.

### Fonctionnalités

- tout Premium ;
- **30 crédits de génération par mois** ;
- choix du sujet, du niveau, du genre et de la longueur ;
- traduction complète du texte généré ;
- audio et quiz de compréhension ;
- bibliothèque personnelle des textes créés ;
- catalogue Classici complet (déjà inclus dans Premium — voir ci-dessus) ;
- notification lorsque la génération est terminée ;
- **Notizie** : jusqu'à 3 textes d'actualité italienne générés chaque jour
  (flux partagé, pas un crédit consommé par abonné — voir
  [leggendo-server/README.md](leggendo-server/README.md), section
  « Notizie — cron d'actualité »).

### Règles des crédits

Le quota est renouvelé à la date de renouvellement de l'abonnement.

Barème initial :

| Type de texte | Coût |
|---|---:|
| Court | 1 crédit |
| Moyen | 2 crédits |
| Long | 3 crédits |
| Très long | 4 crédits |

- Les crédits non utilisés ne sont pas reportés au mois suivant.
- Une génération qui échoue pour une raison technique ne consomme pas de
  crédit.
- Une nouvelle tentative automatique fait partie de la génération initiale.
- Le solde doit être visible avant de lancer une génération.
- Le serveur constitue la source de vérité du quota.

Le barème pourra être ajusté après mesure du coût réel, sans modifier la
promesse initiale de 30 crédits mensuels.

## Enseignant — 24,90 €/mois

### Promesse

Créer, organiser et partager des lectures adaptées à ses classes.

### Fonctionnalités

- **tout Premium IA** ;
- 100 crédits de génération par mois ;
- partage d'un texte par URL publique ;
- consultation par les élèves sans compte Leggendo ;
- création de classes ou de dossiers ;
- affectation d'un texte à une classe ;
- personnalisation des questions du quiz ;
- duplication et adaptation d'un texte existant ;
- export PDF ;
- activation et désactivation des liens partagés ;
- statistiques simples : ouvertures, lectures terminées et quiz terminés.

### Limites initiales

- un compte enseignant ;
- jusqu'à 10 classes actives ;
- jusqu'à 100 élèves actifs ;
- consultation gratuite pour les élèves ;
- aucune donnée nominative obligatoire pour consulter un lien public.

Les limites devront être visibles dans l'offre et vérifiées côté serveur.

## Comparaison à afficher sur la page d'abonnement

| Fonction | Gratuit | Premium | Premium IA | Enseignant |
|---|:---:|:---:|:---:|:---:|
| Textes découverte | Oui | Oui | Oui | Oui |
| Catalogue complet | Non | Oui | Oui | Oui |
| Audio, traductions et quiz | Oui | Oui | Oui | Oui |
| Progression synchronisée | Non | Oui | Oui | Oui |
| Création IA | 1 essai | Non | 30 crédits/mois | 100 crédits/mois |
| Classici : aperçu (1 livre/niveau A2·B2·C2 + 1ᵉʳ chapitre de chaque livre) | Oui | Oui | Oui | Oui |
| Classici : catalogue complet | Non | Oui | Oui | Oui |
| Notizie (actualité générée) | Non | Non | Oui | Oui |
| Liens publics | Non | Non | Non | Oui |
| Classes et dossiers | Non | Non | Non | Oui |
| Modification des quiz | Non | Non | Non | Oui |
| Export PDF | Non | Non | Non | Oui |
| Statistiques de classe | Non | Non | Non | Oui |

## Règles d'accès

Les rôles applicatifs sont :

- `gratuit`
- `premium`
- `premium_plus` pour l'offre commerciale Premium IA
- `enseignant`

La dénomination technique `premium_plus` peut rester dans le code afin d'éviter
une migration inutile. L'interface et les communications commerciales doivent
utiliser « Premium IA ».

Un rôle supérieur inclut les droits du rôle précédent :

```text
gratuit < premium < premium_plus < enseignant
```

Le simple fait d'être connecté ne doit plus donner accès au catalogue complet.

## Paiement et abonnements

Avant l'ouverture commerciale, le parcours doit prendre en charge :

- paiement mensuel et annuel ;
- association du paiement au compte Firebase ;
- attribution automatique du rôle ;
- renouvellement ;
- changement de formule ;
- annulation à la fin de la période payée ;
- échec de paiement ;
- portail client Stripe ;
- synchronisation fiable entre Stripe et Firebase ;
- affichage de la devise réellement facturée.

Stripe et le serveur doivent déterminer les droits. Les informations enregistrées
dans le navigateur ne doivent jamais permettre d'obtenir une formule payante.

## Mesure des coûts IA

Chaque génération doit enregistrer au minimum :

- identifiant de l'utilisateur ;
- formule active ;
- date ;
- longueur demandée ;
- crédits consommés ;
- nombre d'appels au modèle ;
- nouvelles tentatives ;
- succès ou échec ;
- coût estimé.

Une alerte interne doit être déclenchée si :

- le coût IA dépasse 25 % du revenu Premium IA ;
- un utilisateur consomme anormalement vite ses crédits ;
- le taux d'échec des générations augmente ;
- la file d'attente devient trop longue.

## Exigences avant lancement

Toutes les conditions suivantes doivent être remplies :

- [ ] les quatre formules sont affichées avec leurs prix mensuels et annuels ;
- [ ] le compte Gratuit reste limité au catalogue découverte ;
- [ ] Premium débloque le catalogue complet ;
- [ ] Premium IA dispose de 30 crédits mensuels ;
- [ ] Enseignant inclut tous les droits Premium IA ;
- [ ] Enseignant dispose des fonctions pédagogiques définies ci-dessus ;
- [ ] les quotas sont persistants et vérifiés côté serveur ;
- [ ] Stripe attribue, renouvelle et retire correctement les rôles ;
- [ ] le changement et l'annulation de formule fonctionnent ;
- [ ] les liens publics respectent les règles de confidentialité ;
- [ ] les CGU et la politique de confidentialité décrivent chaque formule ;
- [ ] les coûts et erreurs de génération sont mesurés ;
- [ ] les parcours critiques ont été testés avant activation des paiements.

## Ordre d'implémentation

Même si toutes les formules sortent ensemble, le développement doit suivre cet
ordre afin de limiter les dépendances :

1. modèle de rôles et matrice des droits ;
2. contrôle d'accès Gratuit/Premium ;
3. Stripe, webhooks et portail client ;
4. crédits Premium IA et journalisation des coûts ;
5. génération et bibliothèque personnelle ;
6. fonctions Enseignant ;
7. page tarifaire et parcours de conversion ;
8. tests complets des quatre formules ;
9. activation simultanée des paiements.

Cet ordre organise le développement, mais ne constitue pas un lancement par
étapes : les quatre offres sont publiées ensemble.
