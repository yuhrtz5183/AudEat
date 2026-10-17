import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import mockApi from './mock/vitePlugin.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    // Without VITE_API_URL the dev server answers /api/* from an in-memory mock.
    plugins: [react(), env.VITE_API_URL ? null : mockApi()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      include: ['src/**/*.test.{js,jsx}', 'mock/**/*.test.js'],
    },
  }
})
