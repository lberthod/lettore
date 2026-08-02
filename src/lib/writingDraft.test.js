import { describe, it, expect, beforeEach } from 'vitest'
import { saveDraft, loadDraft, clearDraft } from './writingDraft.js'

beforeEach(() => {
  localStorage.clear()
})

describe('saveDraft / loadDraft — brouillon local par mode/sujet', () => {
  it('retrouve le brouillon sauvegardé pour le même mode et sujet', () => {
    saveDraft({ mode: 'libero', promptId: null, text: 'Ciao mondo', savedAt: 100 })
    expect(loadDraft({ mode: 'libero', promptId: null })).toEqual({
      text: 'Ciao mondo',
      savedAt: 100,
    })
  })

  it("renvoie null si aucun brouillon n'existe", () => {
    expect(loadDraft({ mode: 'libero', promptId: null })).toBeNull()
  })

  it('isole les brouillons par mode', () => {
    saveDraft({ mode: 'libero', promptId: null, text: 'testo libero', savedAt: 1 })
    saveDraft({ mode: 'guidato', promptId: 'p1', text: 'testo guidato', savedAt: 2 })
    expect(loadDraft({ mode: 'libero', promptId: null })?.text).toBe('testo libero')
    expect(loadDraft({ mode: 'guidato', promptId: 'p1' })?.text).toBe('testo guidato')
  })

  it('isole les brouillons par promptId au sein du même mode', () => {
    saveDraft({ mode: 'guidato', promptId: 'p1', text: 'texte 1', savedAt: 1 })
    saveDraft({ mode: 'guidato', promptId: 'p2', text: 'texte 2', savedAt: 2 })
    expect(loadDraft({ mode: 'guidato', promptId: 'p1' })?.text).toBe('texte 1')
    expect(loadDraft({ mode: 'guidato', promptId: 'p2' })?.text).toBe('texte 2')
  })

  it('isole les comptes : uid différent = stockage différent', () => {
    saveDraft({ uid: 'uid-a', mode: 'libero', promptId: null, text: 'de A', savedAt: 1 })
    expect(loadDraft({ uid: 'uid-b', mode: 'libero', promptId: null })).toBeNull()
    expect(loadDraft({ uid: 'uid-a', mode: 'libero', promptId: null })?.text).toBe('de A')
  })

  it('écrase le brouillon précédent du même contexte', () => {
    saveDraft({ mode: 'libero', promptId: null, text: 'v1', savedAt: 1 })
    saveDraft({ mode: 'libero', promptId: null, text: 'v2', savedAt: 2 })
    expect(loadDraft({ mode: 'libero', promptId: null })).toEqual({ text: 'v2', savedAt: 2 })
  })
})

describe('clearDraft', () => {
  it('efface uniquement le brouillon du contexte visé', () => {
    saveDraft({ mode: 'libero', promptId: null, text: 'a', savedAt: 1 })
    saveDraft({ mode: 'guidato', promptId: 'p1', text: 'b', savedAt: 2 })
    clearDraft({ mode: 'libero', promptId: null })
    expect(loadDraft({ mode: 'libero', promptId: null })).toBeNull()
    expect(loadDraft({ mode: 'guidato', promptId: 'p1' })?.text).toBe('b')
  })

  it("ne lève pas d'erreur si aucun brouillon n'existe", () => {
    expect(() => clearDraft({ mode: 'libero', promptId: null })).not.toThrow()
  })

  it("n'affecte pas les autres comptes", () => {
    saveDraft({ uid: 'uid-a', mode: 'libero', promptId: null, text: 'a', savedAt: 1 })
    saveDraft({ uid: 'uid-b', mode: 'libero', promptId: null, text: 'b', savedAt: 1 })
    clearDraft({ uid: 'uid-a', mode: 'libero', promptId: null })
    expect(loadDraft({ uid: 'uid-a', mode: 'libero', promptId: null })).toBeNull()
    expect(loadDraft({ uid: 'uid-b', mode: 'libero', promptId: null })?.text).toBe('b')
  })
})
