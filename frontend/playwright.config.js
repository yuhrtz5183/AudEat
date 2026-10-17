import { defineConfig, devices } from '@playwright/test'

const PORT = 5179
// Set E2E_API_URL (e.g. http://localhost:8080) to run against the Spring Boot API instead of the mock.
const API_URL = process.env.E2E_API_URL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: API_URL ? { VITE_API_URL: API_URL } : {},
  },
})
