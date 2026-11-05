import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';
import { NOW, newContext, wall } from './phone-helpers';
import { setPin } from './phone-family';

/*
 * The phone turned sideways: the shell leaves the screen to the tab's
 * content, nothing is under a notch, and the PIN pad fits.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });
const RUN = Date.now().toString(36);
const name = (n: string) => `phland-${RUN}-${n}`;

test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

interface Insets {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/**
 * A phone on its side: `width` x `height` CSS px with touch, `insets` the
 * notch and home bar (as an iPhone reports them with viewport-fit=cover),
 * `text` the phone's text size (1.2: rem is 12 px).
 */
async function sideways(
  browser: Browser,
  household: string,
  { width, height, insets, text = 1 }: { width: number; height: number; insets?: Insets; text?: number },
): Promise<{ page: Page; errors: string[] }> {
  const ctx = await newContext(browser, {
    viewport: { width, height },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    timezoneId: 'America/Chicago',
  });
  // The phone's text size, before the app's first layout.
  await ctx.addInitScript(
    `addEventListener('DOMContentLoaded', () => (document.documentElement.style.fontSize = '${62.5 * text}%'))`,
  );
  const page = await ctx.newPage();
  if (insets) await (await ctx.newCDPSession(page)).send('Emulation.setSafeAreaInsetsOverride', { insets });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?demo=${household}&layout=phone&${NOW}`);
  await expect(page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  return { page, errors };
}

const tab = (p: Page, label: string) => p.locator('.ph-nav').getByRole('button', { name: label });

/** Controls and text in the notch or past the screen's sides (`left`/`right` are the insets), named. */
function underNotch(page: Page, left: number, right: number): Promise<string[]> {
  return page.evaluate(
    ([l, r]) => {
      const w = document.documentElement.clientWidth;
      const out: string[] = [];
      const sel = 'button, input, textarea, select, a, h1, h2, h3, p, .toast span, .li-text, .phc-ev';
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height || getComputedStyle(el).visibility === 'hidden') continue;
        // What shows of it: a row that scrolls sideways shows only what is inside the row.
        let { left, right } = b;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) continue;
          const pb = p.getBoundingClientRect();
          left = Math.max(left, pb.left);
          right = Math.min(right, pb.right);
        }
        if (right <= left) continue;
        if (left < l - 0.5 || right > w - r + 0.5)
          out.push(
            `${el.tagName.toLowerCase()}.${el.className} "${(el.textContent ?? '').trim().slice(0, 20)}" ${Math.round(left)}-${Math.round(right)}`,
          );
      }
      return out;
    },
    [left, right],
  );
}

/** The shell's own height (header, status line, tab bar) and the tab's body height, in CSS px. */
function shellSplit(page: Page): Promise<{ chrome: number; body: number }> {
  return page.evaluate(() => {
    const h = (s: string) => document.querySelector(s)?.getBoundingClientRect().height ?? 0;
    return { chrome: h('.ph-head') + h('.ph-status') + h('.ph-nav'), body: h('.ph-body') };
  });
}

/** Header and tab bar controls smaller than `min` rem either way. */
function smallTargets(page: Page, min: number): Promise<string[]> {
  return page.evaluate((m) => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return [...document.querySelectorAll<HTMLElement>('.ph-head button, .ph-head label, .ph-nav button')]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && (r.width < m * rem - 0.5 || r.height < m * rem - 0.5);
      })
      .map((b) => `${b.textContent?.trim() || b.getAttribute('aria-label')} ${b.getBoundingClientRect().height}`);
  }, min);
}

test('sideways with larger text, the shell leaves room for the list, the tasks and the agenda', async ({ browser }) => {
  const hh = name('shell');
  const w = await wall(browser, hh);
  await expect(w.page.locator('.rail .badge')).toHaveText('3', { timeout: 30_000 });
  const { page, errors } = await sideways(browser, hh, { width: 915, height: 412, text: 1.2 });
  await tab(page, 'Lists').click();
  await page.locator('.phl-row', { hasText: 'Grocery List' }).click();
  await expect(page.locator('.phl-card .li-row').first()).toBeVisible();
  for (const where of ['Lists', 'Tasks', 'Calendar']) {
    if (where !== 'Lists') await tab(page, where).click();
    await page.waitForTimeout(300);
    const { chrome, body } = await shellSplit(page);
    expect(chrome, `${where}: the shell's share`).toBeLessThanOrEqual(412 * 0.32);
    expect(body, where).toBeGreaterThanOrEqual(412 * 0.68 - 1);
    expect(await smallTargets(page, 4.8), where).toEqual([]);
  }
  // Whole rows above the tab bar: the open list's items under its Add item field, a task under the chips.
  const whole = (sel: string) =>
    page.locator(sel).evaluateAll((rows) => {
      const end = document.querySelector('.ph-nav')!.getBoundingClientRect().top;
      return rows.filter((r) => r.getBoundingClientRect().height > 0 && r.getBoundingClientRect().bottom <= end).length;
    });
  await tab(page, 'Tasks').click();
  await expect(page.locator('.pt .tk-card').first()).toBeVisible();
  expect(await whole('.pt .tk-card'), 'Tasks').toBeGreaterThanOrEqual(1);
  await tab(page, 'Lists').click();
  await expect(page.locator('.phl-card .li-row').first()).toBeVisible();
  expect(await whole('.phl-card .li-row'), 'Lists').toBeGreaterThanOrEqual(2);
  expect([...w.errors, ...errors]).toEqual([]);
});

test('sideways on a notched phone, nothing is under the notch', async ({ browser }) => {
  const hh = name('notch');
  const w = await wall(browser, hh);
  await expect(w.page.locator('.rail .badge')).toHaveText('3', { timeout: 30_000 });
  const insets = { top: 0, left: 47, right: 47, bottom: 21 };
  const { page, errors } = await sideways(browser, hh, { width: 844, height: 390, insets });
  const check = async (what: string) => expect(await underNotch(page, insets.left, insets.right), what).toEqual([]);
  await check('Today');
  await tab(page, 'Lists').click();
  await check('Lists');
  await page.locator('.phl-row', { hasText: 'Grocery List' }).click();
  await expect(page.locator('.ph-back')).toBeVisible();
  await check('a list');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Grocery List menu' }).click();
  await expect(page.locator('.popover .menu')).toBeVisible();
  await check('the list menu');
  await page.locator('.popover .menu').getByRole('button', { name: 'Edit list' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit list' })).toBeVisible();
  await check('the list editor');
  await page.getByRole('dialog', { name: 'Edit list' }).getByRole('button', { name: 'Close' }).click();
  await tab(page, 'Tasks').click();
  await expect(page.locator('.pt .tk-card').first()).toBeVisible();
  await check('Tasks');
  await page.locator('.pt .tk-card[data-task="Breakfast"] .tk-check').click();
  await expect(page.locator('.toast', { hasText: 'Breakfast completed' })).toBeVisible();
  await check('a toast');
  await tab(page, 'Calendar').click();
  await expect(page.locator('.phc-day').first()).toBeVisible();
  await check('Calendar');
  await page.locator('.phc-ev').first().click();
  await expect(page.locator('.ev-detail')).toBeVisible();
  await check('event details');
  expect([...w.errors, ...errors]).toEqual([]);
});

test('sideways, the PIN pad fits with its keys a finger wide', async ({ browser }) => {
  const hh = name('pin');
  const w = await wall(browser, hh);
  await w.page.locator('.rail button', { hasText: 'Tasks' }).click();
  await expect(w.page.locator('[data-column="asiyah"] .star-pill')).toHaveText('128', { timeout: 30_000 });
  await setPin(hh);
  for (const screen of [
    { width: 740, height: 360, text: 1.2 },
    { width: 915, height: 412, text: 1 },
    { width: 844, height: 390, text: 1.2, insets: { top: 0, left: 47, right: 47, bottom: 21 } },
  ]) {
    const { page, errors } = await sideways(browser, hh, screen);
    await tab(page, 'Tasks').click();
    await page.getByRole('button', { name: 'Add task' }).click();
    const pad = page.getByRole('dialog', { name: 'Parent PIN' });
    await expect(pad).toBeVisible();
    await page.waitForTimeout(300);
    const box = (await pad.boundingBox())!;
    const what = `${screen.width}x${screen.height}`;
    expect(box.y, what).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, what).toBeLessThanOrEqual(screen.height);
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    for (const key of ['1', '3', '0', 'Cancel', 'Delete']) {
      const k = (await pad.getByRole('button', { name: key, exact: true }).boundingBox())!;
      expect(k.x, `${what} ${key}`).toBeGreaterThanOrEqual(box.x);
      expect(k.x + k.width, `${what} ${key}`).toBeLessThanOrEqual(box.x + box.width);
      expect(k.y, `${what} ${key}`).toBeGreaterThanOrEqual(box.y);
      expect(k.y + k.height, `${what} ${key}`).toBeLessThanOrEqual(box.y + box.height);
      expect(Math.min(k.width, k.height), `${what} ${key}`).toBeGreaterThanOrEqual(4.8 * rem - 0.5);
    }
    // The words on Cancel and Delete stay inside their keys.
    for (const key of ['Cancel', 'Delete']) {
      const b = pad.getByRole('button', { name: key, exact: true });
      expect(await b.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${what} ${key}`).toBe(true);
    }
    if (screen.insets) expect(await underNotch(page, screen.insets.left, screen.insets.right), what).toEqual([]);
    await pad.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(errors).toEqual([]);
    await page.context().close();
  }
  expect(w.errors).toEqual([]);
});
