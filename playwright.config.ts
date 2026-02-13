import * as path from 'node:path'

import { defineConfig, devices } from '@playwright/test'

const port = 4173
const baseURL = `http://127.0.0.1:${port}`
const fixtureLogRoot = path.join(process.cwd(), '.tmp', 'playwright', 'logs')
const testDbPath = path.join(
  process.cwd(),
  '.tmp',
  'playwright',
  'index.sqlite'
)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 120000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `rm -rf .next-playwright && node scripts/setup-e2e-fixtures.mjs && LMS_LOG_ROOT=${fixtureLogRoot} LMS_INDEX_DB_PATH=${testDbPath} NEXT_DIST_DIR=.next-playwright pnpm build && LMS_LOG_ROOT=${fixtureLogRoot} LMS_INDEX_DB_PATH=${testDbPath} NEXT_DIST_DIR=.next-playwright pnpm start --port ${port}`,
    url: baseURL,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
})
