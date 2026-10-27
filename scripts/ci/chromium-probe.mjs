// Use the seed's Playwright in CI; local Mac runs can select the current safe browser.
const { chromium } = await import(process.env.PURSE_PLAYWRIGHT_MODULE || '@playwright/test');

const browser = await chromium.launch({
  headless: true,
  ...(process.platform === 'darwin' ? {
    args: ['--use-mock-keychain', '--password-store=basic'],
  } : {}),
});
await browser.close();
