import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { notFoundLocation } from './notFound.js'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: {} },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: {} },
  ],
})

describe('notFoundLocation', () => {
  it("conserve l'adresse demandée, query et hash compris", () => {
    const location = notFoundLocation({ path: '/testo/inconnu', query: { a: '1' }, hash: '#x' })
    expect(router.resolve(location).fullPath).toBe('/testo/inconnu?a=1#x')
  })

  it('ne retombe pas sur la racine, contrairement au nom seul', () => {
    expect(router.resolve({ name: 'not-found' }).fullPath).toBe('/')
    expect(router.resolve(notFoundLocation({ path: '/classici/x/01', query: {}, hash: '' })).fullPath).toBe(
      '/classici/x/01'
    )
  })
})
