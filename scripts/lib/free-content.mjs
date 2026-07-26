// Partage entre outils Node (vite.config.js, scripts/sync-content.mjs,
// scripts/check-build-leaks.mjs) du découpage « contenu gratuit » / « contenu
// réservé » du catalogue.
//
// Règle d'or : la frontière est calculée à un seul endroit, depuis
// src/lib/catalogAccess.js (le même module qui sert au client et au prérendu).
// Un contenu classé « réservé » ici ne doit jamais entrer dans le bundle :
// il est servi depuis Firestore après vérification du rôle.

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EXAMPLE_COUNT,
  pickExampleTexts,
  isFreeClassiciChapter,
} from '../../src/lib/catalogAccess.js'

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
)
const SRC = path.join(ROOT, 'src')

function readJson(absPath) {
  return JSON.parse(readFileSync(absPath, 'utf8'))
}

export function loadTextsIndex() {
  return readJson(path.join(SRC, 'texts/index.json'))
}

export function loadBooksIndex() {
  return readJson(path.join(SRC, 'books/index.json'))
}

export function loadBookManifest(bookId) {
  return readJson(path.join(SRC, 'books', bookId, 'book.json'))
}

// Tous les textes du catalogue (l'index est la liste de référence : un
// fichier orphelin dans src/texts/ n'est pas un texte publié).
export function allTexts() {
  return loadTextsIndex().map((t) => ({
    id: t.id,
    level: t.level,
    file: path.join(SRC, 'texts', `${t.id}.json`),
  }))
}

// Tous les chapitres de Classici, d'après le manifeste de chaque livre.
export function allChapters() {
  const chapters = []
  for (const book of loadBooksIndex()) {
    const manifest = loadBookManifest(book.id)
    for (const chapter of manifest.chapters || []) {
      chapters.push({
        bookId: book.id,
        chapterId: chapter.id,
        level: book.level,
        file: path.join(
          SRC,
          'books',
          book.id,
          `${book.id}-${chapter.id}.json`
        ),
      })
    }
  }
  return chapters
}

// Fichiers présents sur le disque mais absents des index (ex. chapitre
// annoté pas encore publié) — signalés par les scripts plutôt qu'ignorés en
// silence, car un fichier oublié ici est un fichier qui ne sera pas
// synchronisé vers Firestore.
export function orphanTextFiles() {
  const known = new Set(loadTextsIndex().map((t) => `${t.id}.json`))
  return readdirSync(path.join(SRC, 'texts'))
    .filter(
      (name) =>
        name.endsWith('.json') && name !== 'index.json' && name !== 'category.json'
    )
    .filter((name) => !known.has(name))
}

export function freeTextIds() {
  return new Set(
    pickExampleTexts(loadTextsIndex(), EXAMPLE_COUNT).map((t) => t.id)
  )
}

// Identifiants du contenu accessible sans abonnement (aperçu gratuit) :
// seul contenu autorisé à entrer dans le bundle public.
export function freeContentIds() {
  const free = freeTextIds()
  return {
    texts: allTexts()
      .filter((t) => free.has(t.id))
      .map((t) => t.id),
    chapters: allChapters()
      .filter((c) => isFreeClassiciChapter(c.bookId, c.chapterId))
      .map(({ bookId, chapterId }) => ({ bookId, chapterId })),
  }
}

// Contenu réservé : à synchroniser vers Firestore, et à ne jamais retrouver
// dans dist/ (voir check-build-leaks.mjs).
export function lockedContent() {
  const free = freeTextIds()
  return {
    texts: allTexts().filter((t) => !free.has(t.id)),
    chapters: allChapters().filter(
      (c) => !isFreeClassiciChapter(c.bookId, c.chapterId)
    ),
  }
}

// Identifiant du document Firestore d'un chapitre (`/` interdit dans un id).
export function chapterDocId(bookId, chapterId) {
  return `${bookId}__${chapterId}`
}
