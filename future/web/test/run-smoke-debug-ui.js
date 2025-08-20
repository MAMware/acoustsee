const playwright = require('playwright');

(async () => {
  const browser = await playwright.chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['camera'] });
  const page = await context.newPage();

  // Stub ingest endpoint
  await page.route('https://acoustsee-analytics.mamware.workers.dev/**', route => route.fulfill({ status: 204, body: '' }));

  await page.goto('http://localhost:3000/?debug=true', { waitUntil: 'domcontentloaded', timeout: 30000 });

  const panel = await page.$('#acoustsee-debug-panel');
  if (!panel) { console.error('Panel not found'); process.exit(2); }

  // Ensure log view visible
  const logView = await page.$('#debug-log-view');
  const logViewBox = await logView.boundingBox();
  console.log('logView bounding box:', logViewBox);
  if (!logViewBox || logViewBox.height < 20) {
    console.error('log view too small or not visible');
    process.exit(2);
  }

  // Click resume and run diags
  const resumeBtn = await page.$x("//button[contains(., 'Resume Audio')]");
  if (resumeBtn.length) await resumeBtn[0].click();
  const diagsBtn = await page.$x("//button[contains(., 'Run Device Diags')]");
  if (diagsBtn.length) await diagsBtn[0].click();

  // Wait for log content
  try {
    await page.waitForFunction(() => {
      const el = document.getElementById('debug-log-view');
      return el && el.innerText.includes('Device Diags');
    }, { timeout: 8000 });
    console.log('Smoke test passed: Device Diags found in logs');
  } catch (e) {
    console.error('Smoke test failed: Device Diags not found');
    process.exit(2);
  }

  await browser.close();
  process.exit(0);
})();
