import { defineConfig, devices } from '@playwright/test'

// Browser journeys against the production build (`vite preview`). Locally that serves the real export in
// public/data; in CI it serves the mock dataset from pipeline/scripts/make_mock.py, so the specs only rely on
// clues and places that exist in both (air temperature, the Arctic box).
const PORT = 4175

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    // E2E_DIST serves another build folder (e.g. a copy with the mock data) without touching dist/.
    command: `npm run preview -- --port ${PORT} --strictPort${process.env.E2E_DIST ? ` --outDir "${process.env.E2E_DIST}"` : ''}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
