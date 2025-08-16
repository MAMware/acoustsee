const { test, expect } = require('@playwright/test');

// Basic smoke E2E that opens the local index.html file and checks a title
test('open local index and check title', async ({ page }) => {
  const filePath = 'file://' + process.cwd() + '/future/web/index.html';
  await page.goto(filePath);
  const title = await page.title();
  expect(title.length).toBeGreaterThan(0);
});
