/**
 * MoltenDB — Playwright multi-tab E2E tests
 *
 * These tests open real Chromium browser tabs against a Vite dev server that
 * serves the compiled dist/ artifacts (index.js + moltendb-worker.js + WASM).
 * They stress the parts that in-process Vitest mocks cannot reach:
 *   • Real Web Locks API (cross-tab leader election)
 *   • Real BroadcastChannel (cross-process message delivery)
 *   • Real OPFS + WASM engine (actual data persistence)
 *   • Real Worker lifecycle (spawn, terminate, promote)
 */

import { expect, test, type Page } from '@playwright/test';

// ─── helpers ─────────────────────────────────────────────────────────────────

const URL = 'http://localhost:5173';

/** Navigate to the fixture page and wait until MoltenDB has finished init(). */
async function openTab(context: import('@playwright/test').BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(URL);
  await page.waitForFunction(() => (window as any).__moltenReady === true, { timeout: 10_000 });
  return page;
}

/** Typed wrappers around the window helpers exposed by the fixture page. */
const db = {
  set:    (page: Page, col: string, key: string, val: unknown) =>
    page.evaluate(([c, k, v]) => (window as any).dbSet(c, k, v), [col, key, val] as const),
  get:    (page: Page, col: string, key: string) =>
    page.evaluate(([c, k]) => (window as any).dbGet(c, k), [col, key] as const),
  getAll: (page: Page, col: string) =>
    page.evaluate((c) => (window as any).dbGetAll(c), col),
  delete: (page: Page, col: string, key: string) =>
    page.evaluate(([c, k]) => (window as any).dbDelete(c, k), [col, key] as const),
  role:   (page: Page) =>
    page.evaluate(() => (window as any).dbRole()),
};

// ─── setup ───────────────────────────────────────────────────────────────────

// Each test gets a fresh browser context so OPFS storage is isolated
test.beforeEach(async ({ browser }, testInfo) => {
  // Attach a fresh context to the test via testInfo so each test is isolated
  (testInfo as any)._ctx = await browser.newContext();
});

test.afterEach(async ({}, testInfo) => {
  await (testInfo as any)._ctx?.close();
});

// Convenience to get the per-test context
function ctx(testInfo: any): import('@playwright/test').BrowserContext {
  return testInfo._ctx;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Leader election
// ═════════════════════════════════════════════════════════════════════════════

test('first tab becomes leader, second becomes follower', async ({}, testInfo) => {
  const context = ctx(testInfo);
  const tab1 = await openTab(context);
  const tab2 = await openTab(context);

  expect(await db.role(tab1)).toBe('leader');
  expect(await db.role(tab2)).toBe('follower');
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Cross-tab data visibility
// ═════════════════════════════════════════════════════════════════════════════

test('leader write is visible to follower', async ({}, testInfo) => {
  const context = ctx(testInfo);
  const tab1 = await openTab(context);
  const tab2 = await openTab(context);

  await db.set(tab1, 'users', 'alice', { name: 'Alice', age: 30 });

  // Give BroadcastChannel a moment to deliver
  await tab2.waitForTimeout(200);

  const result = await db.get(tab2, 'users', 'alice');
  expect(result).toMatchObject({ name: 'Alice', age: 30 });
});

test('follower write is visible to leader', async ({}, testInfo) => {
  const context = ctx(testInfo);
  const tab1 = await openTab(context);
  const tab2 = await openTab(context);

  await db.set(tab2, 'products', 'p1', { price: 9.99 });
  await tab1.waitForTimeout(200);

  const result = await db.get(tab1, 'products', 'p1');
  expect(result).toMatchObject({ price: 9.99 });
});

test('follower delete is reflected on leader', async ({}, testInfo) => {
  const context = ctx(testInfo);
  const tab1 = await openTab(context);
  const tab2 = await openTab(context);

  await db.set(tab1, 'docs', 'd1', { body: 'hello' });
  await tab2.waitForTimeout(100);

  await db.delete(tab2, 'docs', 'd1');
  await tab1.waitForTimeout(200);

  const result = await db.get(tab1, 'docs', 'd1');
  expect(result).toBeNull();
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Three-tab consistency
// ═════════════════════════════════════════════════════════════════════════════

test('write from tab 1 is visible on tabs 2 and 3', async ({}, testInfo) => {
  const context = ctx(testInfo);
  const tab1 = await openTab(context);
  const tab2 = await openTab(context);
  const tab3 = await openTab(context);

  await db.set(tab1, 'shared', 'key', { value: 42 });
  await tab2.waitForTimeout(300);
  await tab3.waitForTimeout(300);

  expect(await db.get(tab2, 'shared', 'key')).toMatchObject({ value: 42 });
  expect(await db.get(tab3, 'shared', 'key')).toMatchObject({ value: 42 });
});

test('each of 3 tabs writes 20 entries — all 60 readable from leader', async ({}, testInfo) => {
  const context = ctx(testInfo);
  const tab1 = await openTab(context);
  const tab2 = await openTab(context);
  const tab3 = await openTab(context);

  // Fire all writes in parallel across tabs
  await Promise.all([
    ...Array.from({ length: 20 }, (_, i) => db.set(tab1, 'bulk', `t1-${i}`, { src: 1, i })),
    ...Array.from({ length: 20 }, (_, i) => db.set(tab2, 'bulk', `t2-${i}`, { src: 2, i })),
    ...Array.from({ length: 20 }, (_, i) => db.set(tab3, 'bulk', `t3-${i}`, { src: 3, i })),
  ]);

  await tab1.waitForTimeout(500);

  // Spot-check from the leader
  for (let i = 0; i < 20; i++) {
    expect(await db.get(tab1, 'bulk', `t1-${i}`)).toMatchObject({ src: 1, i });
    expect(await db.get(tab1, 'bulk', `t2-${i}`)).toMatchObject({ src: 2, i });
    expect(await db.get(tab1, 'bulk', `t3-${i}`)).toMatchObject({ src: 3, i });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Leader promotion (close the leader tab)
// ═════════════════════════════════════════════════════════════════════════════

test('follower is promoted to leader when the leader tab closes', async ({}, testInfo) => {
  const context = ctx(testInfo);
  const tab1 = await openTab(context);
  const tab2 = await openTab(context);

  expect(await db.role(tab1)).toBe('leader');
  expect(await db.role(tab2)).toBe('follower');

  // Close the leader tab — this releases the Web Lock
  await tab1.close();

  // Wait for the follower to acquire the lock and promote itself
  await tab2.waitForFunction(
    () => (window as any).dbRole() === 'leader',
    { timeout: 8_000 },
  );

  expect(await db.role(tab2)).toBe('leader');
});

test('promoted follower can write and read data after promotion', async ({}, testInfo) => {
  const context = ctx(testInfo);
  const tab1 = await openTab(context);
  const tab2 = await openTab(context);

  // Write something before promotion so we can verify continuity
  await db.set(tab1, 'promo', 'before', { written: 'by-leader' });
  await tab2.waitForTimeout(200);

  await tab1.close();

  await tab2.waitForFunction(
    () => (window as any).dbRole() === 'leader',
    { timeout: 8_000 },
  );

  // Write new data as the promoted leader
  await db.set(tab2, 'promo', 'after', { written: 'by-promoted' });
  const after = await db.get(tab2, 'promo', 'after');
  expect(after).toMatchObject({ written: 'by-promoted' });
});

test('third tab becomes follower of the promoted leader', async ({}, testInfo) => {
  const context = ctx(testInfo);
  const tab1 = await openTab(context);
  const tab2 = await openTab(context);
  const tab3 = await openTab(context);

  await tab1.close();

  // tab2 or tab3 should become the new leader
  // INSTEAD of immediate check, wait for the state to stabilize
  await tab2.waitForFunction(() => (window as any).__db.isLeader === true, { timeout: 5000 });
  await tab3.waitForFunction(() => (window as any).__db.isLeader === false, { timeout: 5000 });

// Now the assertion is guaranteed to pass
  const roles = await Promise.all([
    tab2.evaluate(() => (window as any).__db.isLeader ? 'leader' : 'follower'),
    tab3.evaluate(() => (window as any).__db.isLeader ? 'leader' : 'follower'),
  ]);

  const leaders   = roles.filter((r) => r === 'leader');
  const followers = roles.filter((r) => r === 'follower');

  expect(leaders).toHaveLength(1);
  expect(followers).toHaveLength(1);
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Bulk / stress
// ═════════════════════════════════════════════════════════════════════════════

test('100 sequential writes from leader — all readable from follower', async ({}, testInfo) => {
  const context = ctx(testInfo);
  const tab1 = await openTab(context);
  const tab2 = await openTab(context);

  for (let i = 0; i < 100; i++) {
    await db.set(tab1, 'seq', `k${i}`, { index: i });
  }

  await tab2.waitForTimeout(500);

  // Spot-check 20 random keys from the follower
  for (let i = 0; i < 20; i++) {
    const idx = Math.floor(Math.random() * 100);
    const v = await db.get(tab2, 'seq', `k${idx}`) as { index: number } | null;
    expect(v?.index).toBe(idx);
  }
});

test('rapid concurrent writes from 2 followers do not corrupt data', async ({}, testInfo) => {
  const context = ctx(testInfo);
  const tab1 = await openTab(context);
  const tab2 = await openTab(context);
  const tab3 = await openTab(context);

  // tab2 and tab3 are followers — fire 30 writes each simultaneously
  await Promise.all([
    ...Array.from({ length: 30 }, (_, i) => db.set(tab2, 'race', `f2-${i}`, { i, src: 2 })),
    ...Array.from({ length: 30 }, (_, i) => db.set(tab3, 'race', `f3-${i}`, { i, src: 3 })),
  ]);

  await tab1.waitForTimeout(600);

  // Verify all 60 entries on the leader
  for (let i = 0; i < 30; i++) {
    expect(await db.get(tab1, 'race', `f2-${i}`)).toMatchObject({ i, src: 2 });
    expect(await db.get(tab1, 'race', `f3-${i}`)).toMatchObject({ i, src: 3 });
  }
});
