import { expect as baseExpect, test, type Page } from '@playwright/test';
import { phone, wall } from './phone-helpers';
import { RUN, writeDoc } from './phone-family';

/*
 * The wall's sheets, dialogs and popovers as the phone shows them: modal
 * for focus, and family text in its own direction.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });
const name = (n: string) => `phover-${RUN}-${n}`;

test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

const tab = (p: Page, label: string) => p.locator('.ph-nav').getByRole('button', { name: label });
const depth = (p: Page, n: number) =>
  expect.poll(() => p.evaluate(() => Number((history.state as { manwarBack?: number } | null)?.manwarBack ?? 0))).toBe(n);
/** What has focus: inside a dialog (its label), or the element's own description. */
const focused = (p: Page) =>
  p.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body) return 'body';
    const d = a.closest('[role="dialog"]');
    return d
      ? `in dialog ${d.getAttribute('aria-label')}`
      : `${a.tagName.toLowerCase()}.${a.className} ${a.getAttribute('aria-label') ?? ''}`.trim();
  });

test('on the phone an overlay takes focus, leaves a field that focuses itself alone, and gives focus back', async ({
  browser,
}) => {
  const hh = name('focus');
  const w = await wall(browser, hh);
  await expect(w.page.locator('.rail .badge')).toHaveText('3', { timeout: 30_000 });
  const { page: p, errors } = await phone(browser, hh);

  // Task details: modal, named by the task, focused; Back gives focus to the card that opened it.
  await tab(p, 'Tasks').click();
  const opener = p.locator('.pt .tk-card[data-task="Breakfast"] .tk-body');
  await opener.click();
  const details = p.getByRole('dialog', { name: 'Breakfast' });
  await expect(details).toHaveAttribute('aria-modal', 'true');
  await expect.poll(() => focused(p)).toBe('in dialog Breakfast');
  await depth(p, 2);
  await p.goBack();
  await expect(details).toHaveCount(0);
  await expect(opener).toBeFocused();

  // A new event: its title field focuses itself and keeps focus (the keyboard stays up); Close gives it back.
  await tab(p, 'Calendar').click();
  await expect(p.locator('.phc-day').first()).toBeVisible();
  const add = p.getByRole('button', { name: 'Add event' });
  await add.click();
  const title = p.locator('.sheet input[name="title"]');
  await expect(title).toBeFocused();
  // Past the double-tap time too: the editor's X is where the header's + was.
  await p.waitForTimeout(600);
  await expect(title).toBeFocused();
  await expect(p.locator('.sheet')).toHaveAttribute('aria-modal', 'true');
  await p.locator('.sheet').getByRole('button', { name: 'Close' }).click();
  await expect(p.locator('.sheet')).toHaveCount(0);
  await expect(add).toBeFocused();

  // Event details, named by the event; Back gives focus to its row.
  const row = p.locator('.phc-ev').first();
  const event = (await row.locator('.phc-ev-title, .phc-ev-text').first().textContent())!.trim();
  await row.click();
  await expect(p.getByRole('dialog', { name: event })).toBeVisible();
  await expect.poll(() => focused(p)).toBe(`in dialog ${event}`);
  await depth(p, 2);
  await p.goBack();
  await expect(p.locator('.ev-detail')).toHaveCount(0);
  await expect(row).toBeFocused();
  expect([...w.errors, ...errors]).toEqual([]);
});

test("the wall's overlays leave focus where it is and are not marked modal", async ({ browser }) => {
  const hh = name('wallfocus');
  const { page: w, errors } = await wall(browser, hh);
  await w.locator('.rail button', { hasText: 'Tasks' }).click();
  const opener = w.locator('[data-column="asiyah"] .tk-card[data-task="Breakfast"] .tk-body');
  await opener.click();
  const details = w.getByTestId('task-details');
  await expect(details).toBeVisible();
  await w.waitForTimeout(300);
  await expect(w.locator('.popover')).not.toHaveAttribute('aria-modal', /.*/);
  await expect(opener).toBeFocused();
  expect(errors).toEqual([]);
});

test('Arabic in a meal’s card and the redeemed dialog keeps its direction', async ({ browser }) => {
  const hh = name('arabic');
  const w = await wall(browser, hh);
  await w.page.locator('.rail button', { hasText: 'Tasks' }).click();
  await expect(w.page.locator('[data-column="asiyah"] .star-pill')).toHaveText('128', { timeout: 30_000 });
  const meal = '٢ كوب شاي!';
  const reward = 'رحلة إلى الحديقة!';
  const person = 'عائشة';
  await writeDoc(hh, 'meals/m-ar', {
    id: { stringValue: 'm-ar' },
    date: { stringValue: '2026-11-05' },
    category: { stringValue: 'dinner' },
    title: { stringValue: meal },
    order: { integerValue: '9' },
    createdAt: { integerValue: '1' },
  });
  await writeDoc(hh, 'profiles/p6', {
    id: { stringValue: 'p6' },
    name: { stringValue: person },
    color: { stringValue: '#8E4C9E' },
    order: { integerValue: '11' },
    stars: { integerValue: '12' },
    createdAt: { integerValue: '2' },
  });
  await writeDoc(hh, 'rewards/r-ar', {
    id: { stringValue: 'r-ar' },
    title: { stringValue: reward },
    cost: { integerValue: '1' },
    profiles: { arrayValue: {} },
    renews: { booleanValue: true },
    redeemedBy: { mapValue: { fields: {} } },
    order: { integerValue: '9' },
    createdAt: { integerValue: '1' },
  });
  const { page: p, errors } = await phone(browser, hh);
  await tab(p, 'More').click();
  await p.locator('.ph-menu button', { hasText: 'Meals' }).click();
  await p.waitForTimeout(500);
  await p.locator('.pm-meal', { hasText: meal }).click();
  const card = p.locator('.popover:has(.meal-pop)');
  await expect(card.locator('.mp-title bdi')).toHaveText(meal);
  await depth(p, 3);
  await p.goBack();
  await expect(card).toHaveCount(0);
  await depth(p, 2);
  await p.goBack();
  await p.locator('.ph-menu button', { hasText: 'Stars and rewards' }).click();
  await p.waitForTimeout(500);
  await p.locator('.psv-person[data-person="p6"]').click();
  await p.waitForTimeout(500);
  await p.locator(`.ps-reward[data-reward="${reward}"] .ps-redeem`).click();
  const done = p.getByRole('dialog', { name: 'Reward redeemed' });
  await expect(done.locator('h2 bdi')).toHaveText(reward);
  await expect(done.locator('p bdi')).toHaveText(person);
  expect([...w.errors, ...errors]).toEqual([]);
});
