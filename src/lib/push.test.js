import { describe, it, expect, vi } from 'vitest'
import {
  nextTokens,
  shouldShowPrompt,
  routeForTap,
  createPushController,
  DECLINE_COOLDOWN_MS,
} from './push.js'

vi.mock('./auth.js', async () => {
  const { ref } = await import('vue')
  return { currentUser: ref(null) }
})
vi.mock('./firebase.js', () => ({ getDbInstance: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

function makeStorage() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  }
}

function makePlugin(receive = 'prompt', requested = 'granted') {
  const listeners = {}
  return {
    listeners,
    removeAllListeners: vi.fn(async () => {
      for (const k of Object.keys(listeners)) delete listeners[k]
    }),
    addListener: vi.fn(async (name, fn) => {
      listeners[name] = fn
    }),
    checkPermissions: vi.fn(async () => ({ receive })),
    requestPermissions: vi.fn(async () => ({ receive: requested })),
    register: vi.fn(async () => {}),
  }
}

function setup(plugin, nowValue = { t: 1_000_000 }) {
  const tokenStore = { add: vi.fn(async () => {}), remove: vi.fn(async () => {}) }
  const storage = makeStorage()
  const c = createPushController({
    isNative: true,
    storage,
    now: () => nowValue.t,
    getPlugin: async () => plugin,
    tokenStore,
    navigate: vi.fn(),
  })
  return { c, tokenStore, storage, nowValue }
}

describe('nextTokens', () => {
  it('retourne null si le jeton existe déjà', () => {
    expect(nextTokens(['a', 'b'], 'a')).toBeNull()
  })
  it('ajoute et borne à 10', () => {
    const existing = Array.from({ length: 10 }, (_, i) => `t${i}`)
    const out = nextTokens(existing, 'new')
    expect(out).toHaveLength(10)
    expect(out.at(-1)).toBe('new')
    expect(out).not.toContain('t0')
  })
  it('tolère un champ absent ou invalide', () => {
    expect(nextTokens(undefined, 'x')).toEqual(['x'])
    expect(nextTokens([1, 'a'], 'x')).toEqual(['a', 'x'])
  })
})

describe('shouldShowPrompt / routeForTap', () => {
  const base = { isNative: true, uid: 'u', permission: 'prompt', declinedAt: 0, now: 5e9 }
  it('autorise le cas nominal', () => expect(shouldShowPrompt(base)).toBe(true))
  it('refuse hors natif, sans uid, accordé ou refusé système', () => {
    expect(shouldShowPrompt({ ...base, isNative: false })).toBe(false)
    expect(shouldShowPrompt({ ...base, uid: null })).toBe(false)
    expect(shouldShowPrompt({ ...base, permission: 'granted' })).toBe(false)
    expect(shouldShowPrompt({ ...base, permission: 'denied' })).toBe(false)
  })
  it('respecte les 30 jours après un refus', () => {
    expect(shouldShowPrompt({ ...base, declinedAt: base.now - DECLINE_COOLDOWN_MS + 1000 })).toBe(false)
    expect(shouldShowPrompt({ ...base, declinedAt: base.now - DECLINE_COOLDOWN_MS - 1 })).toBe(true)
  })
  it('route les types connus seulement', () => {
    expect(routeForTap({ type: 'new_content' })).toBe('/notizie')
    expect(routeForTap({ type: 'streak_reminder' })).toBeNull()
  })
})

describe('createPushController', () => {
  it('ne demande jamais la permission à la connexion', async () => {
    const plugin = makePlugin('prompt')
    const { c } = setup(plugin)
    await c.onUserChange('u1')
    expect(plugin.requestPermissions).not.toHaveBeenCalled()
    expect(plugin.register).not.toHaveBeenCalled()
  })

  it('3 changements d’uid avec permission accordée => un seul jeu de listeners actif', async () => {
    const plugin = makePlugin('granted')
    const { c } = setup(plugin)
    await c.onUserChange('u1')
    await c.onUserChange('u2')
    await c.onUserChange('u3')
    expect(plugin.removeAllListeners).toHaveBeenCalledTimes(3)
    expect(Object.keys(plugin.listeners)).toHaveLength(3)
  })

  it('le jeton est enregistré pour l’uid courant', async () => {
    const plugin = makePlugin('granted')
    const { c, tokenStore } = setup(plugin)
    await c.onUserChange('u1')
    await c.onUserChange('u2')
    plugin.listeners.registration({ value: 'tok' })
    expect(tokenStore.add).toHaveBeenCalledWith('u2', 'tok')
    expect(tokenStore.add).toHaveBeenCalledTimes(1)
  })

  it('déconnexion : retire le jeton de l’appareil (arrayRemove côté store)', async () => {
    const plugin = makePlugin('granted')
    const { c, tokenStore } = setup(plugin)
    await c.onUserChange('u1')
    plugin.listeners.registration({ value: 'tok' })
    expect(await c.removeCurrentDeviceToken()).toBe(true)
    expect(tokenStore.remove).toHaveBeenCalledWith('u1', 'tok')
  })

  it('texte terminé => écran explicatif puis demande système au clic seulement', async () => {
    const plugin = makePlugin('prompt', 'granted')
    const { c } = setup(plugin)
    await c.onUserChange('u1')
    await c.onTextCompleted()
    expect(c.promptVisible.value).toBe(true)
    expect(plugin.requestPermissions).not.toHaveBeenCalled()
    expect(await c.acceptPrompt()).toBe(true)
    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1)
    expect(plugin.register).toHaveBeenCalledTimes(1)
    expect(c.promptVisible.value).toBe(false)
  })

  it('« Plus tard » mémorise le refus 30 jours', async () => {
    const plugin = makePlugin('prompt')
    const { c, nowValue } = setup(plugin)
    await c.onUserChange('u1')
    await c.onTextCompleted()
    c.dismissPrompt()
    await c.onTextCompleted()
    expect(c.promptVisible.value).toBe(false)
    nowValue.t += DECLINE_COOLDOWN_MS + 1
    await c.onTextCompleted()
    expect(c.promptVisible.value).toBe(true)
  })

  it('refus du système mémorisé', async () => {
    const plugin = makePlugin('prompt', 'denied')
    const { c } = setup(plugin)
    await c.onUserChange('u1')
    await c.onTextCompleted()
    expect(await c.acceptPrompt()).toBe(false)
    await c.onTextCompleted()
    expect(c.promptVisible.value).toBe(false)
  })
})
