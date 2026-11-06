import { defineConfig, devices } from '@playwright/test';

// PW_BASE points the suite at an already-running server (a dev server in a
// worktree); otherwise it builds nothing and serves dist/ with vite preview.
const external = process.env.PW_BASE;

const ci = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // On CI a test that fails once runs again (a slow shared runner), and is reported as flaky; nothing is focused.
  retries: ci ? 1 : 0,
  forbidOnly: ci,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: external ?? 'http://127.0.0.1:4173',
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 1000 },
    timezoneId: 'America/Chicago',
    // As an installed app (or Fully Kiosk with "Autoplay audio"): the athan plays without a tap.
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: external
    ? undefined
    : {
        command: 'npx vite preview --port 4173 --strictPort --host 127.0.0.1',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: true,
      },
});
