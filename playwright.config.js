const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    browserName: 'chromium',
    headless: true,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
