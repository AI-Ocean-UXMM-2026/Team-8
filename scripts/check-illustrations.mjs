import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.REPORT_TEST_URL || 'http://localhost:3218';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const routes = ['/login', '/demo/warehouse', '/demo/warehouse/inventory', '/demo/warehouse/shipments',
  '/demo/warehouse/exceptions', '/demo/warehouse/tracking', '/demo/warehouse/settings',
  '/demo/warehouse/account', '/demo/sme', '/demo/sme/tracking', '/demo/sme/account',
  '/demo/courier', '/demo/courier/account', '/demo/manager', '/demo/manager/account',
  '/office', '/foundation', '/design-system', '/design-preview/low-fi'];
let current = '';
try {
  for (const width of [1440, 320]) {
    for (const language of ['en', 'my']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(lang => localStorage.setItem('pc-language-v1', lang), language);
      const page = await context.newPage();
      for (const route of routes) {
        current = `${route} ${width}px ${language}`;
        await page.goto(base + route);
        await page.locator('h1:visible').first().waitFor();
        await page.waitForFunction(() => {
          const title = [...document.querySelectorAll('h1')].find(el => el.getBoundingClientRect().width);
          if (!title) return false;
          const heading = title.closest('.pc-illustrated-heading, .pc-login-card');
          return heading ? !!heading.querySelector('img.pc-illustration') : getComputedStyle(title).backgroundImage.includes('/illustrations/');
        });
        const artwork = page.locator('img.pc-illustration');
        for (const img of await artwork.all()) {
          await img.evaluate(el => el.decode());
          assert.equal(await img.getAttribute('alt'), '', current);
          assert.equal(await img.getAttribute('aria-hidden'), 'true', current);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Overflow: ${current}`);
        assert.equal(await page.locator('.pc-illustrated-heading').count() > 1, false, `Repeated page artwork: ${current}`);
      }
      await page.goto(base + '/demo/warehouse/inventory?q=no-such-product-illustration-check');
      await page.locator('.pc-empty-state img').waitFor();
      await page.goto(base + '/demo/warehouse/inventory');
      const product = page.locator('a.inventoryProduct').first();
      await product.waitFor();
      await page.goto(base + await product.getAttribute('href'));
      await page.locator('.pc-illustrated-heading img').waitFor();
      await page.goto(base + '/login');
      await page.locator('input[name=email]').fill('illustration-check@example.com');
      await page.locator('input[name=password]').fill('test-only');
      await page.locator('input[name=password]').press('Tab');
      assert.equal(await page.locator('button[type=submit]').evaluate(el => el === document.activeElement), true);
      await page.screenshot({ path: `test-results/illustrations-login-${width}-${language}.png`, fullPage: true });
      await context.close();
    }
  }
  console.log('PASS illustration coverage, decorative semantics, EN/MM responsive layout, empty state and login keyboard access');
} catch (error) {
  throw new Error(`${current}: ${error.message}`, { cause: error });
} finally {
  await browser.close();
}
