import { describe, it, expect } from 'vitest'
import {
  GUIDED_PROMPTS,
  CONTENT_ACTIONS,
  levelTier,
  wordsForLevel,
  pickGuidedPrompt,
  contentActionById,
  pickWordsFrom,
} from './writingPrompts.js'

describe('writingPrompts — boîte de texte pédagogique (§7)', () => {
  it('chaque prompt guidé fournit situation, destinataire, objectif et 5 mots par palier', () => {
    for (const p of GUIDED_PROMPTS) {
      expect(p.situation).toBeTruthy()
      expect(p.recipient).toBeTruthy()
      expect(p.goal).toBeTruthy()
      expect(p.ideas.length).toBeGreaterThanOrEqual(1)
      expect(p.ideas.length).toBeLessThanOrEqual(3)
      for (const tier of ['A', 'B', 'C']) {
        expect(p.words[tier]).toHaveLength(5)
      }
    }
  })

  it('levelTier classe A1/A2 → A, B1/B2 → B, C1/C2 → C, repli sur A', () => {
    expect(levelTier('A1')).toBe('A')
    expect(levelTier('B2')).toBe('B')
    expect(levelTier('C1')).toBe('C')
    expect(levelTier(null)).toBe('A')
  })

  it('wordsForLevel replie sur le palier A si le niveau est inconnu', () => {
    const words = { A: ['uno', 'due'], B: ['tre'] }
    expect(wordsForLevel(words, 'B1')).toEqual(['tre'])
    expect(wordsForLevel(words, undefined)).toEqual(['uno', 'due'])
  })

  it('pickGuidedPrompt évite de reproduire le même prompt quand un autre existe', () => {
    const first = GUIDED_PROMPTS[0]
    for (let i = 0; i < 20; i++) {
      expect(pickGuidedPrompt(first.id).id).not.toBe(first.id)
    }
  })

  it('contentActionById retombe sur la première action si l’id est inconnu', () => {
    expect(contentActionById('inexistant')).toBe(CONTENT_ACTIONS[0])
    expect(contentActionById('riuso').id).toBe('riuso')
  })

  it('pickWordsFrom choisit au plus `count` clés distinctes du lexique', () => {
    const dict = { casa: 'maison', mare: 'mer', sole: 'soleil', pane: 'pain' }
    const picked = pickWordsFrom(dict, 3)
    expect(picked).toHaveLength(3)
    expect(new Set(picked).size).toBe(3)
    for (const w of picked) expect(dict).toHaveProperty(w)
  })
})
