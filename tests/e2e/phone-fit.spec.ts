import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';
import { NOW, wall } from './phone-helpers';
import { RUN, setPin, writeDoc } from './phone-family';

/*
 * The phone's Today, Tasks and Stars screens and the wall's overlays they
 * open fit a small Android phone (360x780) with the phone's text made
 * larger: nothing reaches past the screen's edges (rows that scroll sideways
 * excepted), and no control is squeezed.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });

async function smallPhone(browser: Browser, household: string): Promise<{ page: Page; errors: string[] }> {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    timezoneId: 'America/Chicago',
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?demo=${household}&layout=phone&${NOW}`);
  await expect(page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  // The phone's text size made larger (rem = 12px instead of 10px).
  await page.evaluate(() => (document.documentElement.style.fontSize = '75%'));
  return { page, errors };
}

/** Elements that reach past the screen's sides, outside any sideways scroller. */
function outside(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || (r.right <= w + 0.5 && r.left >= -0.5)) continue;
      let p = el.parentElement;
      let clipped = false;
      for (; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && p.getBoundingClientRect().right <= w + 0.5) {
          clipped = true;
          break;
        }
      }
      // A decoration (the redeemed dialog's glow) that takes no taps may overhang.
      if (!clipped && getComputedStyle(el).pointerEvents !== 'none' && !el.closest('[aria-hidden="true"]'))
        out.push(`${el.tagName.toLowerCase()}.${el.className}`);
    }
    return out;
  });
}

/** Buttons in `scope` that are narrower or shorter than a finger (squeezed by a row too full). */
function squeezed(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return [...document.querySelectorAll<HTMLElement>(`${sel} button`)]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && (r.width < 4.4 * rem || r.height > 9 * rem);
      })
      .map((b) => b.textContent ?? b.className);
  }, scope);
}

test('every screen and overlay fits 360 px with large text', async ({ browser }) => {
  const household = `phtasks-${RUN}-fit`;
  const w = await wall(browser, household);
  await w.page.locator('.rail button', { hasText: 'Tasks' }).click();
  await expect(w.page.locator('[data-column="asiyah"] .star-pill')).toHaveText('128', { timeout: 30_000 });
  // Long and Arabic names.
  await writeDoc(household, 'profiles/p5', {
    id: { stringValue: 'p5' },
    name: { stringValue: 'Abdurrahman Abdullah-Khan' },
    color: { stringValue: '#B5532F' },
    order: { integerValue: '10' },
    stars: { integerValue: '1234' },
    createdAt: { integerValue: '1' },
  });
  await writeDoc(household, 'profiles/p6', {
    id: { stringValue: 'p6' },
    name: { stringValue: 'عائشة بنت محمد' },
    color: { stringValue: '#8E4C9E' },
    order: { integerValue: '11' },
    stars: { integerValue: '12' },
    createdAt: { integerValue: '2' },
  });
  const { page, errors } = await smallPhone(browser, household);
  const check = async (what: string) => expect(await outside(page), what).toEqual([]);

  await expect(page.locator('.pd-person[data-person="p6"]')).toBeVisible();
  await check('Today');
  await page.locator('.ph-nav button', { hasText: 'Tasks' }).click();
  await expect(page.locator('.pt .tk-card').first()).toBeVisible();
  await check('Tasks');
  // A name cut with an ellipsis takes its own direction, so an Arabic one keeps its start.
  await page.locator('.pt-chip[data-person="p6"]').click();
  const name = page.locator('.pt .pcol-name');
  await expect(name).toHaveText('عائشة بنت محمد');
  expect(await name.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  await page.locator('.pt-chip[data-person="asiyah"]').click();

  await page.locator('.pt .tk-card[data-task="Feed the fish"] .tk-body').click();
  await expect(page.getByTestId('task-details')).toBeVisible();
  await check('task details');
  await page.getByRole('button', { name: 'Edit task' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task' });
  await editor.getByLabel('Title', { exact: true }).fill('');
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor.getByRole('alert')).toHaveText('Give the task a title.');
  await check('task editor with an error');
  expect(await squeezed(page, '.sheet-foot'), 'editor footer').toEqual([]);
  await editor.getByRole('button', { name: 'Close' }).click();

  await page.locator('.pt-chip[data-person="*"]').click();
  await page.locator('.pt .tk-card[data-task="Empty dishwasher"] .tk-check').click();
  await expect(page.getByRole('dialog', { name: 'Who did it?' })).toBeVisible();
  await check('who did it');
  await page.getByRole('dialog', { name: 'Who did it?' }).getByRole('button', { name: 'Cancel' }).click();

  await page.locator('.ph-nav button', { hasText: 'More' }).click();
  await page.getByRole('button', { name: /Stars and rewards/ }).click();
  await check('Stars and rewards');
  await page.locator('.psv-person[data-person="p6"]').click();
  const stars = page.getByRole('dialog', { name: /'s stars/ });
  await stars.getByRole('button', { name: 'Give', exact: true }).click();
  await check("a person's stars, giving");
  await page.goBack();
  await expect(stars).toHaveCount(0);
  await page.locator('.psv-person[data-person="p5"]').click();
  await page.locator('.ps-reward[data-reward="Ice cream trip"] .ps-redeem').click();
  await expect(page.getByRole('dialog', { name: 'Reward redeemed' })).toBeVisible();
  await check('redeemed');
  expect([...w.errors, ...errors]).toEqual([]);
});

test('the PIN pad fits 360 px with large text', async ({ browser }) => {
  const household = `phtasks-${RUN}-fit-pin`;
  const w = await wall(browser, household);
  await w.page.locator('.rail button', { hasText: 'Tasks' }).click();
  await expect(w.page.locator('[data-column="asiyah"] .star-pill')).toHaveText('128', { timeout: 30_000 });
  await setPin(household);
  const { page, errors } = await smallPhone(browser, household);
  await page.locator('.ph-nav button', { hasText: 'Tasks' }).click();
  await page.getByRole('button', { name: 'Add task' }).click();
  const pad = page.getByRole('dialog', { name: 'Parent PIN' });
  await expect(pad).toBeVisible();
  expect(await outside(page)).toEqual([]);
  const box = (await pad.boundingBox())!;
  for (const key of ['1', '3', 'Cancel', 'Delete']) {
    const k = (await pad.getByRole('button', { name: key, exact: true }).boundingBox())!;
    expect(k.x, key).toBeGreaterThanOrEqual(box.x);
    expect(k.x + k.width, key).toBeLessThanOrEqual(box.x + box.width);
  }
  expect([...w.errors, ...errors]).toEqual([]);
});
