import { test, expect } from '@playwright/test';

test('feed page loads with PWAGram title and FAB button', async ({ page }) => {
  await page.goto('/');
  // Header title
  const title = page.locator('header span', { hasText: 'PWAGram' }).first();
  await expect(title).toContainText('PWAGram');
  // FAB button is visible
  const fab = page.locator('#share-image-button');
  await expect(fab).toBeVisible();
});

test('help page loads with PWAGram header and Need Help? heading', async ({ page }) => {
  await page.goto('/help/');
  // Header title
  const title = page.locator('header span', { hasText: 'PWAGram' }).first();
  await expect(title).toContainText('PWAGram');
  // h3 with "Need Help?"
  const heading = page.locator('h3', { hasText: 'Need Help?' });
  await expect(heading).toBeVisible();
});

test('Feed→Help navigation via header nav link', async ({ page }) => {
  await page.goto('/');
  // On large screens the top-bar nav links are visible; click the Help link
  await page.locator('nav a[href="/help/"]').first().click();
  // Confirm help page content is visible
  const heading = page.locator('h3', { hasText: 'Need Help?' });
  await expect(heading).toBeVisible();
});

test('no console errors on feed page', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      // Ignore known non-fatal network errors from external/backend services
      // that are unavailable in the headless test environment (Firebase data
      // fetch, Cloud Functions, service-worker registration).
      const KNOWN_NON_FATAL_URLS = [
        'firebaseio.com',
        'cloudfunctions.net',
        'sw.js',
      ];
      const sourceUrl = msg.location().url || '';
      if (KNOWN_NON_FATAL_URLS.some((pattern) => sourceUrl.includes(pattern))) return;

      const text = msg.text();
      const KNOWN_NON_FATAL_TEXT = [
        'ServiceWorker',
        'service-worker',
        'Failed to load resource', // generic network 404/error from external URLs
      ];
      if (KNOWN_NON_FATAL_TEXT.some((pattern) => text.includes(pattern))) return;

      errors.push(text);
    }
  });
  await page.goto('/');
  // Wait for the page to settle
  await page.waitForLoadState('networkidle');
  expect(errors).toHaveLength(0);
});
