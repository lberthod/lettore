// Faux Firestore minimal (juste ce qu'utilise jobs.mjs : get/set/update,
// where/orderBy/limit, batch, runTransaction) — permet de tester la logique
// des jobs et des quotas sans dépendance réseau ni émulateur.

import crypto from 'node:crypto'

function matchFilter(fieldVal, op, value) {
  switch (op) {
    case '==':
      return fieldVal === value
    case '<':
      return fieldVal < value
    case 'in':
      return value.includes(fieldVal)
    default:
      throw new Error(`opérateur non supporté dans le faux Firestore : ${op}`)
  }
}

class FakeDocRef {
  constructor(collection, id) {
    this.collection = collection
    this.id = id
  }
  async get() {
    const data = this.collection.store.get(this.id)
    return { exists: data !== undefined, id: this.id, data: () => data, ref: this }
  }
  async set(data) {
    this.collection.store.set(this.id, { ...data })
  }
  async update(patch) {
    const current = this.collection.store.get(this.id) || {}
    this.collection.store.set(this.id, { ...current, ...patch })
  }
}

class FakeQuery {
  constructor(collection, filters = []) {
    this.collection = collection
    this.filters = filters
  }
  where(field, op, value) {
    return new FakeQuery(this.collection, [...this.filters, { field, op, value }])
  }
  orderBy(field, direction = 'asc') {
    const q = new FakeQuery(this.collection, this.filters)
    q._orderBy = { field, direction }
    q._limit = this._limit
    return q
  }
  limit(n) {
    const q = new FakeQuery(this.collection, this.filters)
    q._orderBy = this._orderBy
    q._limit = n
    return q
  }
  async get() {
    let entries = [...this.collection.store.entries()].filter(([, data]) =>
      this.filters.every((f) => matchFilter(data[f.field], f.op, f.value))
    )
    if (this._orderBy) {
      const { field, direction } = this._orderBy
      entries.sort((a, b) => (direction === 'desc' ? b[1][field] - a[1][field] : a[1][field] - b[1][field]))
    }
    if (this._limit) entries = entries.slice(0, this._limit)
    const docs = entries.map(([id, data]) => ({ id, data: () => data, ref: this.collection.doc(id) }))
    return { empty: docs.length === 0, docs }
  }
}

class FakeCollection extends FakeQuery {
  constructor() {
    super(null)
    this.collection = this
    this.store = new Map()
  }
  doc(id = crypto.randomUUID()) {
    return new FakeDocRef(this, id)
  }
}

class FakeBatch {
  constructor() {
    this.ops = []
  }
  delete(ref) {
    this.ops.push(() => ref.collection.store.delete(ref.id))
  }
  async commit() {
    this.ops.forEach((op) => op())
  }
}

export class FakeFirestore {
  constructor() {
    this.collections = new Map()
  }
  collection(name) {
    if (!this.collections.has(name)) this.collections.set(name, new FakeCollection())
    return this.collections.get(name)
  }
  batch() {
    return new FakeBatch()
  }
  async runTransaction(fn) {
    const tx = {
      get: (ref) => ref.get(),
      set: (ref, data) => ref.set(data),
      update: (ref, patch) => ref.update(patch),
    }
    return fn(tx)
  }
}
