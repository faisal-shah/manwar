import { expect as baseExpect, test, type Page } from '@playwright/test';
import { phone, wall } from './phone-helpers';

/*
 * Moving around the phone: a tab keeps its open list or More view while
 * another tab shows and Back closes that view before the tab; the tab bar's
 * own tab goes to its top; the Calendar comes back on the agenda; a reload
 * (an update applied after two idle minutes) comes back where it was.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });
const RUN = Date.now().toString(36);
const name = (n: string) => `phnav-${RUN}-${n}`;

test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

const tab = (p: Page, label: string) => p.locator('.ph-nav').getByRole('button', { name: label });
const title = (p: Page) => p.locator('.ph-head h1');
/** The back stack holds `depth` entries: Playwright's goBack targets an entry, so the page's own pushes land first. */
const depth = (p: Page, n: number) =>
  expect.poll(() => p.evaluate(() => Number((history.state as { manwarBack?: number } | null)?.manwarBack ?? 0))).toBe(n);
async function back(p: Page, n: number) {
  await depth(p, n);
  await p.goBack();
}
/** A view drops the rest of the double tap that opened it (useOpeningTapGuard): wait it out, as a person does. */
const settle = (p: Page) => p.waitForTimeout(500);

async function openList(p: Page, list: string) {
  await tab(p, 'Lists').click();
  await p.locator('.phl-row', { hasText: list }).click();
  await expect(title(p)).toContainText(list);
  await settle(p);
}
async function openMore(p: Page, row: string) {
  await tab(p, 'More').click();
  await p.locator('.ph-menu button', { hasText: row }).click();
  await expect(title(p)).toHaveText(row);
  await settle(p);
}
async function openToAssign(p: Page) {
  await tab(p, 'Calendar').click();
  await p.locator('.phc-waiting').click();
  await expect(title(p)).toHaveText('To assign');
  await settle(p);
}

test('Back on a tab come back to with its view open closes the view, then the tab', async ({ browser }) => {
  const hh = name('return');
  await wall(browser, hh);
  const { page: p, errors } = await phone(browser, hh);
  await openList(p, 'Grocery List');
  await tab(p, 'Today').click();
  await expect(title(p)).toHaveText('Today');
  await tab(p, 'Lists').click();
  await expect(title(p)).toContainText('Grocery List');
  await expect(p.locator('.ph-back')).toBeVisible();
  await back(p, 2);
  await expect(title(p)).toHaveText('Lists');
  await expect(p.locator('.ph-back')).toHaveCount(0);
  await back(p, 1);
  await expect(title(p)).toHaveText('Today');

  // The same for a More row's view.
  await openMore(p, 'Wall screen');
  await tab(p, 'Today').click();
  await tab(p, 'More').click();
  await expect(title(p)).toHaveText('Wall screen');
  await back(p, 2);
  await expect(title(p)).toHaveText('More');
  await back(p, 1);
  await expect(title(p)).toHaveText('Today');
  expect(errors).toEqual([]);
});

test('the tab bar’s own tab goes to the top of the tab', async ({ browser }) => {
  const hh = name('reselect');
  await wall(browser, hh);
  const { page: p, errors } = await phone(browser, hh);
  await openList(p, 'Grocery List');
  await tab(p, 'Lists').click();
  await expect(title(p)).toHaveText('Lists');
  await expect(p.locator('.phl-row', { hasText: 'Grocery List' })).toBeVisible();
  await openMore(p, 'Wall timer');
  await tab(p, 'More').click();
  await expect(title(p)).toHaveText('More');
  await openToAssign(p);
  await tab(p, 'Calendar').click();
  await expect(title(p)).toHaveText('November');
  // Each closed view gave its entry back: one Back leaves the tab.
  await back(p, 1);
  await expect(title(p)).toHaveText('Today');
  expect(errors).toEqual([]);
});

test('Today’s See all and its events open the agenda, though To assign was open when Calendar was left', async ({ browser }) => {
  const hh = name('seeall');
  const w = await wall(browser, hh);
  await expect(w.page.locator('.rail .badge')).toHaveText('3', { timeout: 30_000 });
  const { page: p, errors } = await phone(browser, hh);
  await openToAssign(p);
  await tab(p, 'Today').click();
  await p.locator('.pd-head-link', { hasText: 'See all' }).click();
  await expect(title(p)).toHaveText('November');
  await expect(p.locator('.phc-assign')).toHaveCount(0);
  await expect(p.locator('.phc-day').first()).toBeVisible();

  await openToAssign(p);
  await tab(p, 'Today').click();
  await p.locator('.pd-ev').first().click();
  await expect(title(p)).toHaveText('November');
  await expect(p.locator('.phc-assign')).toHaveCount(0);
  expect([...w.errors, ...errors]).toEqual([]);
});

test('a reload comes back on the tab and the view it showed, and Back still walks out', async ({ browser }) => {
  const hh = name('reload');
  const w = await wall(browser, hh);
  await expect(w.page.locator('.rail .badge')).toHaveText('3', { timeout: 30_000 });
  const { page: p, errors } = await phone(browser, hh);
  const reload = async () => {
    await p.reload();
    await expect(p.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  };

  await openList(p, 'Grocery List');
  await reload();
  await expect(title(p)).toContainText('Grocery List');
  await expect(p.locator('.phl-card .li-row', { hasText: 'Milk' })).toBeVisible();
  await expect(tab(p, 'Lists')).toHaveAttribute('aria-current', 'page');
  await back(p, 2);
  await expect(title(p)).toHaveText('Lists');
  await back(p, 1);
  await expect(title(p)).toHaveText('Today');

  await openMore(p, 'Wall timer');
  await reload();
  await expect(title(p)).toHaveText('Wall timer');
  await back(p, 2);
  await expect(title(p)).toHaveText('More');

  await openToAssign(p);
  await reload();
  await expect(title(p)).toHaveText('To assign');
  await back(p, 2);
  await expect(title(p)).toHaveText('November');

  await tab(p, 'Tasks').click();
  await reload();
  await expect(title(p)).toHaveText('Tasks');
  await back(p, 1);
  await expect(title(p)).toHaveText('Today');
  // Today, the start, is where a reload from it stays.
  await reload();
  await expect(title(p)).toHaveText('Today');
  await depth(p, 0);
  expect([...w.errors, ...errors]).toEqual([]);
});

test('a list deleted on the wall while the phone was away is closed, with one word of why, when it comes back', async ({
  browser,
}) => {
  const hh = name('away');
  const w = await wall(browser, hh);
  const { page: p, errors } = await phone(browser, hh);
  await openList(p, 'To Do');
  const url = p.url();
  await p.goto('about:blank');
  await w.page.locator('.rail button', { hasText: 'Lists' }).click();
  await w.page.getByRole('button', { name: 'To Do menu' }).click();
  await w.page.locator('.popover .menu').getByRole('button', { name: 'Delete list' }).click();
  await w.page.getByRole('dialog', { name: 'Delete To Do?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(w.page.locator('.lc-title', { hasText: 'To Do' })).toHaveCount(0);
  await p.goto(url);
  await expect(title(p)).toHaveText('Lists');
  await expect(p.locator('.ph-back')).toHaveCount(0);
  // Only the open list's id is kept on the phone, so the word names no title.
  await expect(p.locator('.toast', { hasText: 'The list you had open was deleted on another device.' })).toBeVisible();
  await back(p, 1);
  await expect(title(p)).toHaveText('Today');
  expect([...w.errors, ...errors]).toEqual([]);
});
