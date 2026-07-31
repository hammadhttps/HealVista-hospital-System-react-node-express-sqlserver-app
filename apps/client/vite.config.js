import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Must mirror the `paths` in tsconfig.json — tsc resolving them is not enough,
    // Vite needs its own map or the build fails to resolve `@/…` at runtime.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@medicore/shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
    },
    // Prefer TypeScript over any leftover prototype `.jsx` of the same name.
    extensions: ['.mjs', '.js', '.mts', '.ts', '.tsx', '.jsx', '.json'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
