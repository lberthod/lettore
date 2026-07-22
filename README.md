# Lettore Italiano 🇮🇹

Application web de lecture pour apprendre l'italien : des textes gradués en italien, avec traduction française instantanée mot à mot ou phrase par phrase, et lecture audio par synthèse vocale.

**Tout fonctionne hors ligne côté client** — aucune API externe : les traductions sont pré-générées dans les fichiers de textes, et l'audio utilise la Web Speech API du navigateur.

## Fonctionnalités

- 📚 **24 textes en italien** de difficulté progressive : vie quotidienne, voyages, montagnes, histoire d'Italie (Rome antique, Renaissance, Risorgimento, miracle économique…)
- 👆 **Traduction au clic** : cliquer sur un mot affiche sa traduction française ; possibilité de traduire la phrase entière
- 🔊 **Lecture audio** en italien (voix it-IT via la Web Speech API), avec pause/reprise
- ⚡ **Chargement à la demande** : chaque texte est un chunk séparé (via `import.meta.glob`)
- 📱 Interface simple, navigation texte précédent / suivant

## Stack technique

- [Vue 3](https://vuejs.org/) + [Vue Router 4](https://router.vuejs.org/)
- [Vite 6](https://vite.dev/)
- Firebase Hosting pour le déploiement

## Démarrage

```bash
npm install
npm run dev
```

L'application est disponible sur http://localhost:5173.

### Build et déploiement

```bash
npm run build
firebase deploy
```

Le build est généré dans `dist/`, servi par Firebase Hosting (SPA avec rewrite vers `index.html`).

## Structure du projet

```
src/
├── views/
│   ├── HomeView.vue        # Liste des textes
│   └── ReaderView.vue      # Lecteur : découpage en phrases/mots, TTS
├── components/
│   └── TranslationOverlay.vue  # Bulle de traduction
├── texts/
│   ├── index.json          # Index des textes (titre, extrait, nb de mots)
│   └── *.json              # Un fichier par texte : paragraphes + lexique
├── translate.js            # Recherche locale dans le lexique du texte
├── tts.js                  # Synthèse vocale (Web Speech API, voix italienne)
├── router.js
└── main.js
```

### Format d'un texte

Chaque fichier `src/texts/<id>.json` contient :

```json
{
  "id": "marco",
  "title": "La mattina di Marco",
  "paragraphs": ["La mattina, Marco si sveglia presto…"],
  "words": { "mattina": "matin", "presto": "tôt" },
  "sentences": { "La mattina, Marco si sveglia presto.": "Le matin, Marco se réveille tôt." }
}
```

Pour ajouter un texte : créer le fichier JSON avec son lexique, puis ajouter une entrée dans `src/texts/index.json`.
