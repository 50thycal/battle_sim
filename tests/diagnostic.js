const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/tmp/chrome-install/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    headless: true,
  });
  const page = await browser.newPage();

  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('file:///home/user/battle_sim/index.html');
  await page.waitForTimeout(3000);

  const result = await page.evaluate(() => {
    return {
      hasG: typeof G !== 'undefined',
      hasCanvas: !!document.getElementById('canvas'),
      frameCount: typeof G !== 'undefined' ? G.frameCount : 'N/A',
    };
  }).catch(e => ({ evalError: e.message }));

  console.log('RESULT:', JSON.stringify(result, null, 2));
  await browser.close();
})();
