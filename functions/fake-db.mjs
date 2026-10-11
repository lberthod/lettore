// Faux Firestore/Auth minimaux pour tester les modules de functions/ sans
// réseau ni émulateur. Ce fichier n'est PAS un test (pas de suffixe .test).

export function makeFakeDb(initial = {}) {
  const cols = new Map()
  const col = (name) => {
    if (!cols.has(name)) cols.set(name, new Map())
    return cols.get(name)
  }
  for (const [name, docs] of Object.entries(initial)) {
    for (const [id, data] of Object.entries(docs)) col(name).set(id, data)
  }
  const reads = { users: 0 }
  const ref = (name, id) => ({
    id,
    path: `${name}/${id}`,
    async get() {
      const data = col(name).get(id)
      return { exists: data !== undefined, id, data: () => data, ref: this }
    },
    async set(data, opts) {
      col(name).set(id, opts?.merge ? { ...(col(name).get(id) || {}), ...data } : { ...data })
    },
    async update(patch) {
      col(name).set(id, { ...(col(name).get(id) || {}), ...patch })
    },
    async delete() {
      col(name).delete(id)
    },
  })
  const query = (name, filters = [], lim, after) => ({
    where(field, op, value) {
      return query(name, [...filters, { field, op, value }], lim, after)
    },
    limit(n) {
      return query(name, filters, n, after)
    },
    // Seul l'ordre par identifiant ('__name__') est géré.
    orderBy() {
      return this
    },
    startAfter(snap) {
      return query(name, filters, lim, snap.id)
    },
    async get() {
      if (name === 'users') reads.users += 1
      let entries = [...col(name).entries()].filter(([, d]) =>
        filters.every((f) => {
          const v = f.field.split('.').reduce((o, k) => o?.[k], d)
          if (f.op === '==') return v === f.value
          if (f.op === '<') return v !== undefined && v < f.value
          if (f.op === '>') return v !== undefined && v > f.value
          throw new Error('op non supporté ' + f.op)
        })
      )
      entries.sort((a, b) => (a[0] < b[0] ? -1 : 1))
      if (after !== undefined) entries = entries.filter(([id]) => id > after)
      if (lim) entries = entries.slice(0, lim)
      const docs = entries.map(([id, data]) => ({ id, data: () => data, ref: ref(name, id) }))
      return { empty: !docs.length, size: docs.length, docs }
    },
  })
  return {
    cols,
    reads,
    collection(name) {
      return { doc: (id) => ref(name, id), ...query(name) }
    },
    batch() {
      const ops = []
      return {
        delete: (r) => ops.push(r),
        commit: async () => {
          for (const r of ops) await r.delete()
        },
      }
    },
    async runTransaction(fn) {
      let written = false
      return fn({
        get: (r) => {
          if (written) throw new Error('reads after writes')
          return r.get()
        },
        set: (r, d, o) => {
          written = true
          return r.set(d, o)
        },
      })
    },
  }
}

export function makeFakeAuth(users = {}) {
  const claimsWrites = []
  return {
    claimsWrites,
    async getUser(uid) {
      const u = users[uid]
      if (!u) throw new Error('auth/user-not-found')
      return { uid, ...u }
    },
    async setCustomUserClaims(uid, claims) {
      claimsWrites.push({ uid, claims })
      users[uid] = { ...(users[uid] || {}), customClaims: claims }
    },
  }
}
