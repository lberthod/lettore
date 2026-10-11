// Faux db + faux messaging pour tester push.mjs / news-push.mjs sans réseau.
// Le faux db couvre juste ce qu'ils utilisent : collection().doc() get/update/
// set(merge), getAll. Les `update({ fcmTokens: arrayRemove(...) })` sont
// enregistrés dans `updates` (le sentinelle FieldValue n'est pas évalué).

export function makeFakePushDb({ users = {}, newsState = null } = {}) {
  const updates = []
  const state = { newsState: newsState ? { ...newsState } : undefined }
  const userRef = (uid) => ({
    id: uid,
    async get() {
      return { exists: uid in users, id: uid, data: () => users[uid] }
    },
    async update(patch) {
      updates.push({ uid, patch })
    },
  })
  const stateRef = {
    async get() {
      return { exists: state.newsState !== undefined, data: () => state.newsState }
    },
    async set(data) {
      state.newsState = { ...(state.newsState || {}), ...data }
    },
  }
  const db = {
    collection(name) {
      return {
        doc(id) {
          if (name === 'users') return userRef(id)
          if (name === 'newsState') return stateRef
          throw new Error(`collection inattendue ${name}`)
        },
      }
    },
    async getAll(...refs) {
      return Promise.all(refs.map((r) => r.get()))
    },
  }
  return { db, updates, state }
}

// `behavior(batchTokens, callIndex)` renvoie un tableau de réponses
// ({ success } ou { success:false, error:{ code } }) ; par défaut tout réussit.
export function makeFakeMessaging(behavior) {
  const calls = []
  return {
    calls,
    async sendEachForMulticast(msg) {
      calls.push(msg)
      if (behavior) {
        const res = await behavior(msg.tokens, calls.length - 1)
        return { responses: res }
      }
      return { responses: msg.tokens.map(() => ({ success: true })) }
    },
  }
}
