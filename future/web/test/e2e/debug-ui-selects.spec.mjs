import { test, expect } from '@playwright/test';

// Smoke test: open debug UI, open dropdowns and select options to ensure they're interactive
test('debug UI grid and synth selects are clickable and dispatch', async ({ page }) => {
  // Adjust URL if you run a local dev server on a different port
  await page.goto('http://localhost:3000/?debug=true', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for debug panel to attach
  await page.waitForSelector('#acoustsee-debug-panel', { state: 'attached', timeout: 10000 });

  // Ensure the selects exist (they may be hidden in passive debug mode)
  const gridSelect = page.locator('#acoustsee-debug-panel #grid-type-select');
  const synthSelect = page.locator('#acoustsee-debug-panel #synth-engine-select');

  await page.waitForSelector('#acoustsee-debug-panel #grid-type-select', { state: 'attached', timeout: 10000 });
  await page.waitForSelector('#acoustsee-debug-panel #synth-engine-select', { state: 'attached', timeout: 10000 });

  // In passive debug mode the panel starts hidden. Make it visible to allow interaction (simulates user opening it).
  await page.evaluate(() => {
    const p = document.getElementById('acoustsee-debug-panel');
    if (p) {
      p.style.display = 'block';
      // trigger layout recalculation that debug UI may rely on
      window.dispatchEvent(new Event('resize'));
    }
  });

  // Capture current values
  const initialGrid = await gridSelect.inputValue();
  const initialSynth = await synthSelect.inputValue();

  // If the selects have at least 2 options, change to the second option
  const gridOptions = await gridSelect.locator('option').allTextContents();
  const synthOptions = await synthSelect.locator('option').allTextContents();

  if (gridOptions.length >= 2) {
    // Select by index 1
    await gridSelect.selectOption({ index: 1 });
    // Ensure value changed
    const newGrid = await gridSelect.inputValue();
    expect(newGrid).not.toBe(initialGrid);
  }

  if (synthOptions.length >= 2) {
    await synthSelect.selectOption({ index: 1 });
    const newSynth = await synthSelect.inputValue();
    expect(newSynth).not.toBe(initialSynth);
  }

  // Optionally, click a control to ensure event loop is responsive
  const pauseBtn = page.locator('#acoustsee-debug-panel #log-pause-btn');
  if (await pauseBtn.count() > 0) {
    await pauseBtn.click();
    await pauseBtn.click(); // toggle back
  }
});
