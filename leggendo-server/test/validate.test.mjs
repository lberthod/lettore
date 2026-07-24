import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTaxonomyIndex, parseRequest, slugify } from '../validate.mjs'

const taxonomy = {
  themes: [{ id: 'quotidien', name: 'Quotidien' }],
  genres: [{ id: 'histoire', name: 'Histoire', levels: ['A1', 'A2'] }],
  sizes: [{ id: 'court', name: 'Court' }],
}
const index = buildTaxonomyIndex(taxonomy)

const validBody = {
  theme: 'quotidien',
  genre: 'histoire',
  size: 'court',
  level: 'A1',
  title: 'Un titre valable',
  summary: 'Un résumé suffisamment long pour passer la validation.',
}

test('parseRequest accepte une demande valide', () => {
  const { errors } = parseRequest(validBody, index)
  assert.deepEqual(errors, [])
})

test('parseRequest rejette un thème, genre ou taille inconnu', () => {
  const { errors } = parseRequest({ ...validBody, theme: 'inconnu' }, index)
  assert.ok(errors.some((e) => e.includes('thème')))
})

test('parseRequest rejette un niveau non proposé par le genre', () => {
  const { errors } = parseRequest({ ...validBody, level: 'B2' }, index)
  assert.ok(errors.some((e) => e.includes('niveau')))
})

test('parseRequest rejette un titre ou résumé hors bornes', () => {
  assert.ok(parseRequest({ ...validBody, title: 'ab' }, index).errors.some((e) => e.includes('titre')))
  assert.ok(parseRequest({ ...validBody, summary: 'court' }, index).errors.some((e) => e.includes('résumé')))
})

test('slugify normalise et ajoute un suffixe unique', () => {
  const slug = slugify('Città incredibile !')
  assert.match(slug, /^citta_incredibile_[0-9a-f]{6}$/)
})

test('slugify retombe sur "testo" si le titre ne laisse rien après nettoyage', () => {
  const slug = slugify('!!!')
  assert.match(slug, /^testo_[0-9a-f]{6}$/)
})
