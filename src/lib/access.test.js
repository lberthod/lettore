import { describe, it, expect } from 'vitest'
import {
  EXAMPLE_TEXT_IDS,
  EXAMPLE_COUNT,
  FREE_CLASSICI_BOOK_IDS,
  FREE_CLASSICI_PREVIEW_BOOK_IDS,
  isFreeClassiciChapter,
} from './access.js'
import textsIndex from '../texts/index.json'

describe('EXAMPLE_TEXT_IDS (aperçu gratuit)', () => {
  it('propose exactement EXAMPLE_COUNT textes', () => {
    expect(EXAMPLE_TEXT_IDS).toHaveLength(EXAMPLE_COUNT)
  })

  it('ne contient pas de doublon', () => {
    expect(new Set(EXAMPLE_TEXT_IDS).size).toBe(EXAMPLE_TEXT_IDS.length)
  })

  it('ne référence que des textes existant réellement dans le catalogue', () => {
    const ids = new Set(textsIndex.map((t) => t.id))
    for (const id of EXAMPLE_TEXT_IDS) expect(ids.has(id)).toBe(true)
  })

  it('couvre plusieurs niveaux différents (pas tous le même)', () => {
    const levels = new Set(
      EXAMPLE_TEXT_IDS.map((id) => textsIndex.find((t) => t.id === id).level)
    )
    expect(levels.size).toBeGreaterThan(1)
  })
})

describe('isFreeClassiciChapter', () => {
  it('les livres entièrement gratuits sont accessibles à tous les chapitres', () => {
    for (const bookId of FREE_CLASSICI_BOOK_IDS) {
      expect(isFreeClassiciChapter(bookId, '01')).toBe(true)
      expect(isFreeClassiciChapter(bookId, '05')).toBe(true)
    }
  })

  it('les livres en aperçu ne libèrent que le premier chapitre', () => {
    for (const bookId of FREE_CLASSICI_PREVIEW_BOOK_IDS) {
      expect(isFreeClassiciChapter(bookId, '01')).toBe(true)
      expect(isFreeClassiciChapter(bookId, '02')).toBe(false)
    }
  })

  it('un livre entièrement payant ne libère aucun chapitre', () => {
    expect(isFreeClassiciChapter('inferno', '01')).toBe(false)
  })

  it('un identifiant de livre inconnu est traité comme payant', () => {
    expect(isFreeClassiciChapter('livre-inexistant', '01')).toBe(false)
  })
})
