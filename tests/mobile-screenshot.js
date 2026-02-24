const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/tmp/chrome-install/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  await page.goto('file:///home/user/battle_sim/index.html');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'tests/screenshots/mobile-375x667.png', fullPage: true });
  console.log('Mobile screenshot saved');

  // Also take desktop screenshot
  const page2 = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await page2.goto('file:///home/user/battle_sim/index.html');
  await page2.waitForTimeout(3000);
  await page2.screenshot({ path: 'tests/screenshots/desktop-1024x768.png', fullPage: true });
  console.log('Desktop screenshot saved');

  await browser.close();
})();
