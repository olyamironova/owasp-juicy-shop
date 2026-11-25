const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:3001',
    browserName: 'chromium',
    locale: 'en-US',
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
