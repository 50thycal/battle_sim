const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    launchOptions: {
      executablePath: '/tmp/chrome-install/chrome-linux64/chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    },
    browserName: 'chromium',
    headless: true,
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'mobile',
      use: { viewport: { width: 375, height: 667 } },
    },
  ],
});
