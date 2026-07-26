import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { freeContentPlugin, catalogPlugin } from './vite.config.js'

export default defineConfig({
  // Les modules virtuels du build doivent aussi être résolus ici, sans quoi
  // tout test qui les traverse échouerait à la résolution :
  // `virtual:free-content` (aperçu gratuit embarqué) est importé par
  // src/lib/protectedContent.js, `virtual:catalog` (extraits du catalogue)
  // par src/lib/access.js et le routeur.
  plugins: [freeContentPlugin(), catalogPlugin(), vue()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.js'],
  },
})
