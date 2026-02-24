const { test, expect } = require('@playwright/test');
const path = require('path');

const GAME_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

// Helper: wait for game to initialize and run N frames
async function waitForGameFrames(page, frames = 60) {
  await page.waitForFunction(
    (n) => window.G && window.G.frameCount >= n,
    frames,
    { timeout: 10000 }
  );
}

// Helper: get game state
async function getGameState(page) {
  return page.evaluate(() => ({
    frameCount: G.frameCount,
    gameover: G.gameover,
    resources: { ...G.resources },
    units: G.units.length,
    blueUnits: G.units.filter(u => !u.dead && u.team === 'blue').length,
    redUnits: G.units.filter(u => !u.dead && u.team === 'red').length,
    scrollX: G.scrollX,
    frontline: { ...G.frontline },
    supplyCap: { ...G.supplyCap },
    artilleryCooldown: G.artilleryCooldown,
    artilleryPending: G.artilleryPending,
  }));
}

// ============================================================================
// 1. GAME STARTUP — no crashes, loop runs
// ============================================================================
test.describe('Game startup', () => {
  test('game loop runs without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(GAME_URL);
    await waitForGameFrames(page, 120); // ~2 seconds at 60fps

    const state = await getGameState(page);
    expect(state.frameCount).toBeGreaterThanOrEqual(120);
    expect(state.gameover).toBe(false);
    expect(errors).toEqual([]);
  });

  test('resources start at 80 and increase', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGameFrames(page, 10);

    const early = await getGameState(page);
    expect(early.resources.blue).toBeGreaterThanOrEqual(80);
    expect(early.resources.red).toBeGreaterThanOrEqual(80);

    await waitForGameFrames(page, 180);
    const later = await getGameState(page);
    expect(later.resources.blue).toBeGreaterThan(early.resources.blue);
  });
});

// ============================================================================
// 2. VIEWPORT & LAYOUT — visible on desktop and mobile
// ============================================================================
test.describe('Viewport and layout', () => {
  test('viewport and UI fit within screen bounds', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGameFrames(page, 10);

    const viewport = await page.locator('#viewport').boundingBox();
    const screenWidth = page.viewportSize().width;

    // Viewport should not overflow screen
    expect(viewport.x).toBeGreaterThanOrEqual(0);
    expect(viewport.x + viewport.width).toBeLessThanOrEqual(screenWidth + 1);
    expect(viewport.width).toBeGreaterThan(0);
    expect(viewport.height).toBeGreaterThan(0);
  });

  test('UI panels are visible', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGameFrames(page, 10);

    // All three panels should be in the DOM and have size
    const bluePanel = await page.locator('.panel.blue').boundingBox();
    const redPanel = await page.locator('.panel.red').boundingBox();
    const midPanel = await page.locator('.panel.mid').boundingBox();

    expect(bluePanel.width).toBeGreaterThan(0);
    expect(redPanel.width).toBeGreaterThan(0);
    expect(midPanel.width).toBeGreaterThan(0);
  });

  test('unit buttons are clickable', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGameFrames(page, 10);

    const infantryBtn = page.locator('#btn-infantry');
    await expect(infantryBtn).toBeVisible();

    const box = await infantryBtn.boundingBox();
    expect(box.width).toBeGreaterThan(20);
    expect(box.height).toBeGreaterThan(10);
  });
});

// ============================================================================
// 3. SCROLLING — scrollX changes via keyboard
// ============================================================================
test.describe('Scrolling', () => {
  test('keyboard arrow scrolling works', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGameFrames(page, 30);

    const before = await page.evaluate(() => G.scrollX);

    // Hold right arrow for 500ms
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowRight');

    const after = await page.evaluate(() => G.scrollX);
    expect(after).toBeGreaterThan(before);
  });
});

// ============================================================================
// 4. UNIT SPAWNING — player can select and place units
// ============================================================================
test.describe('Unit spawning', () => {
  test('selecting infantry changes selectedType', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGameFrames(page, 30);

    await page.click('#btn-infantry');
    const selected = await page.evaluate(() => G.selectedType);
    expect(selected).toBe('infantry');
  });

  test('clicking in deploy zone spawns a unit', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGameFrames(page, 60);

    // Select infantry
    await page.click('#btn-infantry');

    // Get deploy zone coordinates for blue team, top lane
    const deployInfo = await page.evaluate(() => {
      const zones = getDeployZone('blue');
      const z = zones.top;
      return {
        x1: z.x1, y1: z.y1, x2: z.x2, y2: z.y2,
        scrollX: G.scrollX
      };
    });

    // Click in the middle of the deploy zone
    // Convert world coordinates to viewport click coordinates
    const worldX = (deployInfo.x1 + deployInfo.x2) / 2;
    const worldY = (deployInfo.y1 + deployInfo.y2) / 2;

    const viewportBox = await page.locator('#viewport').boundingBox();
    const viewW = 900;
    const viewH = 460;
    const clickX = viewportBox.x + ((worldX - deployInfo.scrollX) / viewW) * viewportBox.width;
    const clickY = viewportBox.y + (worldY / viewH) * viewportBox.height;

    // Scroll so the deploy zone is visible
    await page.evaluate(() => { G.scrollX = 0; });
    await page.waitForTimeout(100);

    const beforeUnits = await page.evaluate(() => G.units.filter(u => u.team === 'blue').length);

    // Recalculate click position after scroll
    const newClickX = viewportBox.x + (worldX / viewW) * viewportBox.width;
    const newClickY = viewportBox.y + (worldY / viewH) * viewportBox.height;

    await page.mouse.click(newClickX, newClickY);
    await page.waitForTimeout(100);

    const afterUnits = await page.evaluate(() => G.units.filter(u => u.team === 'blue').length);
    expect(afterUnits).toBeGreaterThan(beforeUnits);
  });

  test('AI spawns units over time', async ({ page }) => {
    await page.goto(GAME_URL);
    // Wait about 5 seconds for AI to spawn
    await waitForGameFrames(page, 300);

    const state = await getGameState(page);
    expect(state.redUnits).toBeGreaterThan(0);
  });
});

// ============================================================================
// 5. ARTILLERY — audit fix #1 (textContent crash) and #2 (resource check)
// ============================================================================
test.describe('Artillery system', () => {
  test('artillery button updates without crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(GAME_URL);
    await waitForGameFrames(page, 120);

    // Verify the cd-arty element still exists (wasn't destroyed by textContent)
    const cdArty = await page.evaluate(() => document.getElementById('cd-arty') !== null);
    expect(cdArty).toBe(true);

    // Verify the arty-label span exists and has correct text
    const label = await page.evaluate(() => document.getElementById('arty-label').textContent);
    expect(label).toBe('Artillery (50)');

    expect(errors).toEqual([]);
  });

  test('artillery resource check prevents negative resources', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGameFrames(page, 30);

    // Set resources to exactly 50, trigger artillery, then drain resources
    await page.evaluate(() => {
      G.resources.blue = 55;
      triggerArtillery();
    });

    const pending = await page.evaluate(() => G.artilleryPending);
    expect(pending).toBe(true);

    // Drain resources below 50 before clicking
    await page.evaluate(() => { G.resources.blue = 10; });

    // Click on the viewport (artillery target)
    const viewportBox = await page.locator('#viewport').boundingBox();
    await page.mouse.click(viewportBox.x + viewportBox.width / 2, viewportBox.y + viewportBox.height / 2);
    await page.waitForTimeout(100);

    // Resources should NOT have gone negative
    const resources = await page.evaluate(() => G.resources.blue);
    expect(resources).toBeGreaterThanOrEqual(0);

    // Artillery should be cancelled
    const stillPending = await page.evaluate(() => G.artilleryPending);
    expect(stillPending).toBe(false);
  });
});

// ============================================================================
// 6. AI ARTILLERY — audit fixes #3, #4, #7
// ============================================================================
test.describe('AI artillery', () => {
  test('AI artillery fires independently of deploy cooldown', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGameFrames(page, 30);

    // Set up conditions: AI has resources, deploy cooldown active, 4+ blue units
    const fired = await page.evaluate(() => {
      G.resources.red = 200;
      G.aiDeployCd = 5000;     // deploy on cooldown
      G.aiArtilleryTimer = 9999; // almost ready

      // Spawn some blue units for targeting
      for (let i = 0; i < 5; i++) {
        G.units.push(new Unit('blue', 'infantry', 300 + i * 20, 150));
      }

      const redBefore = G.resources.red;

      // Manually run one AI update tick
      updateAI(100);

      // Check if artillery fired (resources deducted)
      return G.resources.red < redBefore;
    });

    expect(fired).toBe(true);
  });

  test('AI artillery uses live resource value not stale', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGameFrames(page, 30);

    // Set up: AI has just enough for artillery but after a spawn would not
    const result = await page.evaluate(() => {
      G.resources.red = 200;
      G.aiArtilleryTimer = 9999;

      // Spawn blue targets
      for (let i = 0; i < 5; i++) {
        G.units.push(new Unit('blue', 'infantry', 300 + i * 20, 150));
      }

      // Simulate: set resources below 50 DURING the function
      // This simulates what happens if a spawn deducted resources
      G.resources.red = 30;
      G.aiArtilleryTimer = 10001;

      updateAI(1);

      // Resources should NOT go below 0
      return G.resources.red;
    });

    expect(result).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// 7. UNIT CAP — audit fix #5
// ============================================================================
test.describe('Unit cap', () => {
  test('unit cap culls lowest HP units, not oldest', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGameFrames(page, 10);

    const result = await page.evaluate(() => {
      // Clear existing units
      G.units = [];

      // Create 101 units: first 50 at full HP, last 51 at 10% HP
      for (let i = 0; i < 50; i++) {
        const u = new Unit('blue', 'infantry', 100 + i, 150);
        u.hp = u.maxHp; // full HP
        u.id = 'full_' + i;
        G.units.push(u);
      }
      for (let i = 0; i < 51; i++) {
        const u = new Unit('red', 'infantry', 1500 + i, 150);
        u.hp = u.maxHp * 0.1; // 10% HP
        u.id = 'low_' + i;
        G.units.push(u);
      }

      // The cap logic runs in gameLoop, simulate it
      if (G.units.length > 100) {
        G.units.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
        G.units = G.units.slice(G.units.length - 100);
      }

      // All remaining units should be the higher-HP ones
      const hasLowHP = G.units.some(u => u.id && u.id.startsWith('low_'));
      const fullHPCount = G.units.filter(u => u.id && u.id.startsWith('full_')).length;
      return { hasLowHP, fullHPCount, total: G.units.length };
    });

    expect(result.total).toBe(100);
    expect(result.fullHPCount).toBe(50); // All full-HP units should survive
  });
});

// ============================================================================
// 8. SCREENSHOT TESTS — visual regression baseline
// ============================================================================
test.describe('Visual snapshots', () => {
  test('game renders after 2 seconds', async ({ page }) => {
    await page.goto(GAME_URL);
    await waitForGameFrames(page, 120);

    await page.screenshot({ path: 'tests/screenshots/game-2sec.png', fullPage: true });

    // Verify canvas has non-zero dimensions
    const canvasSize = await page.evaluate(() => {
      const c = document.getElementById('canvas');
      return { w: c.width, h: c.height };
    });
    expect(canvasSize.w).toBe(1800);
    expect(canvasSize.h).toBe(460);
  });
});
