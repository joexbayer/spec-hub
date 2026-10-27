import { defineConfig } from 'vitest/config'

// SPECHUB_TEST_DB lets two test runs (e.g. parallel agents) use separate databases; setup.ts
// drops and recreates it on every run.
const testDb = process.env.SPECHUB_TEST_DB ?? 'spechub_test'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/setup.ts'],
    env: {
      DATABASE_URL: `postgres://localhost/${testDb}`,
      SPECHUB_TEST_DB: testDb,
      PUBLIC_URL: 'http://localhost:5173',
      BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwx',
      GITHUB_CLIENT_ID: 'test',
      GITHUB_CLIENT_SECRET: 'test',
      SPEC_HUB_ADMINS: '1001', // HUB_ADMIN_ID in test/helpers.ts
      // never github.com: tests stub fetch for this origin (stubGithub in test/helpers.ts)
      GITHUB_API_URL: 'http://github.test',
    },
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
