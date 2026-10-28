const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    locale: 'en-US',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1
  }
});
