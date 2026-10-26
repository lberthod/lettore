import { describe, it, expect, vi } from 'vitest'
import { shouldStartTrial, isSettledError, startTrialIfEligible } from './trial.js'

function store() {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }
}
const mkUser = (claims = {}, emailVerified = true) => ({
  uid: 'u1',
  emailVerified,
  getIdTokenResult: vi.fn(async () => ({ claims })),
  getIdToken: vi.fn(async () => 't'),
})

describe('shouldStartTrial', () => {
  it('exige un e-mail vérifié', () => {
    expect(shouldStartTrial({ emailVerified: false, claims: {} })).toBe(false)
    expect(shouldStartTrial({ emailVerified: true, claims: {} })).toBe(true)
  })
  it('ignore les comptes déjà dotés d’une formule ou d’un essai', () => {
    expect(shouldStartTrial({ emailVerified: true, claims: { role: 'premium' } })).toBe(false)
    expect(shouldStartTrial({ emailVerified: true, claims: { trialEnd: 5 } })).toBe(false)
    expect(shouldStartTrial({ emailVerified: true, claims: { periodEnd: 5 } })).toBe(false)
    expect(shouldStartTrial({ emailVerified: true, claims: { role: 'gratuit' } })).toBe(true)
  })
  it('ignore si déjà réglé', () => {
    expect(shouldStartTrial({ emailVerified: true, claims: {}, settled: true })).toBe(false)
  })
})

describe('isSettledError', () => {
  it('reconnaît les refus définitifs', () => {
    expect(isSettledError({ code: 'functions/already-exists' })).toBe(true)
    expect(isSettledError({ code: 'functions/failed-precondition' })).toBe(true)
    expect(isSettledError({ code: 'functions/unavailable' })).toBe(false)
  })
})

describe('startTrialIfEligible', () => {
  it('appelle le callable puis rafraîchit le jeton', async () => {
    const user = mkUser()
    const call = vi.fn(async () => ({}))
    expect(await startTrialIfEligible(user, { call, storage: store() })).toBe('started')
    expect(call).toHaveBeenCalledOnce()
    expect(user.getIdToken).toHaveBeenCalledWith(true)
  })
  it('ne fait rien si non vérifié', async () => {
    const call = vi.fn()
    expect(await startTrialIfEligible(mkUser({}, false), { call })).toBe('skipped')
    expect(call).not.toHaveBeenCalled()
  })
  it('n’échoue pas sur erreur réseau et retentera', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = store()
    const call = vi.fn(async () => { throw { code: 'functions/unavailable' } })
    expect(await startTrialIfEligible(mkUser(), { call, storage: s })).toBe('error')
    expect(await startTrialIfEligible(mkUser(), { call, storage: s })).toBe('error')
    expect(call).toHaveBeenCalledTimes(2)
  })
  it('mémorise un refus définitif', async () => {
    const s = store()
    const call = vi.fn(async () => { throw { code: 'functions/already-exists' } })
    expect(await startTrialIfEligible(mkUser(), { call, storage: s })).toBe('skipped')
    expect(await startTrialIfEligible(mkUser(), { call, storage: s })).toBe('skipped')
    expect(call).toHaveBeenCalledOnce()
  })
})
