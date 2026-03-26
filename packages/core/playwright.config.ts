import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  fullyParallel: false, // multi-tab tests must run serially
  retries: 0,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    launchOptions: {
      executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    },
  },

  projects: [
    {
      name: 'edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
  ],

  // Start the Vite fixture server before the tests run
  webServer: {
    command: 'npx vite --config e2e/vite.config.ts',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
