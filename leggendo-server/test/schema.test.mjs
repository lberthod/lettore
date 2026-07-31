import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEXT_SCHEMA, validateStructure, toTextData } from '../schema.mjs'

// Sortie LLM minimale valide (3 questions avec explication).
function validOut() {
  const question = (n) => ({
    q: `Domanda ${n} ?`,
    options: ['a', 'b', 'c'],
    correct: 0,
    explanation: `Le texte dit clairement la réponse ${n}.`,
  })
  return {
    title: 'Un titolo',
    level: 'A1',
    paragraphs: ['Prima frase. Seconda frase.'],
    questions: [question(1), question(2), question(3)],
    words: [{ it: 'prima', fr: 'première' }],
    sentences: [{ it: 'Prima frase.', fr: 'Première phrase.' }],
  }
}

test('le schéma des questions exige "explanation"', () => {
  const questionSchema = TEXT_SCHEMA.properties.questions.items
  assert.ok(questionSchema.required.includes('explanation'))
  assert.equal(questionSchema.properties.explanation.type, 'string')
  assert.equal(questionSchema.additionalProperties, false)
})

test('validateStructure accepte une sortie complète', () => {
  assert.deepEqual(validateStructure(validOut()), [])
})

test('validateStructure signale une explication manquante ou vide', () => {
  const out = validOut()
  delete out.questions[1].explanation
  out.questions[2].explanation = '   '
  const errors = validateStructure(out)
  assert.ok(errors.some((e) => e === 'question 2 : explication manquante'))
  assert.ok(errors.some((e) => e === 'question 3 : explication manquante'))
})

test('validateStructure garde ses contrôles existants (options, index)', () => {
  const out = validOut()
  out.questions[0].options = ['a', 'b']
  out.questions[1].correct = 5
  const errors = validateStructure(out)
  assert.ok(errors.some((e) => e.includes('moins de 3 options')))
  assert.ok(errors.some((e) => e.includes('hors limites')))
})

test('toTextData conserve les explications des questions', () => {
  const textData = toTextData('test_id', validOut())
  assert.equal(textData.questions.length, 3)
  for (const q of textData.questions) {
    assert.equal(typeof q.explanation, 'string')
    assert.ok(q.explanation.length > 0)
  }
})
