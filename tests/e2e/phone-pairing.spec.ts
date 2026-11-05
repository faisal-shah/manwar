import { expect as baseExpect, test } from '@playwright/test';
import { devices, type Browser } from '@playwright/test';
import { FS, NOW, OWNER, pairPhone, pairingCode, phone, redeem, wall } from './phone-helpers';

/** A phone on the pairing screen with nothing filled in (`pair=` empty, as a person typing the code sees it). */
async function redeemLater(browser: Browser, household: string) {
  const page = await (await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'America/Chicago' })).newPage();
  await page.goto(`/?demo=${household}&pair=&${NOW}`);
  return { page };
}

/*
 * Pairing a parent's phone with the wall, and what removing it does. Runs
 * the real pairing Functions on the emulator: the wall makes a code, a
 * phone redeems it once for its own sign-in, the wall removes it again.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });
const RUN = Date.now().toString(36);

test('a phone pairs from the wall, opens its own layout, and stays paired after a reload', async ({ browser }) => {
  const household = `e2e-pair-${RUN}-ok`;
  const w = await wall(browser, household);
  const p = await pairPhone(browser, w.page, household);
  // The wall lists it at once and puts the code away.
  await expect(w.page.locator('.set-row', { hasText: "Mamma's phone" })).toBeVisible();
  await expect(w.page.locator('.pair-card')).toHaveCount(0);
  // The pairing link is used up: the address no longer carries the code.
  expect(new URL(p.page.url()).searchParams.get('pair')).toBeNull();
  await p.page.reload();
  await expect(p.page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  await p.page.getByRole('button', { name: 'More' }).click();
  await p.page.getByRole('button', { name: 'This phone' }).click();
  await expect(p.page.locator('.ph-body')).toContainText("Paired as Mamma's phone");
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('a code works once; a second phone with it is told to make a new one', async ({ browser }) => {
  const household = `e2e-pair-${RUN}-once`;
  const w = await wall(browser, household);
  const code = await pairingCode(w.page);
  const first = await redeem(browser, household, code, 'First');
  await expect(first.page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  const second = await redeem(browser, household, code, 'Second');
  await expect(second.page.locator('.ph-pair .error')).toContainText('expired or was already used');
  await expect(second.page.locator('.ph-nav')).toHaveCount(0);
});

test('a typed code pairs too, and an expired one does not', async ({ browser }) => {
  const household = `e2e-pair-${RUN}-typed`;
  const w = await wall(browser, household);
  const code = await pairingCode(w.page);
  const p = await redeemLater(browser, household);
  // `pair=` empty: the pairing screen, nothing filled in.
  await expect(p.page.getByLabel('Pairing code')).toHaveValue('');
  await p.page.getByLabel('Pairing code').fill(code.toLowerCase());
  await expect(p.page.getByLabel('Pairing code')).toHaveValue(`${code.slice(0, 4)}-${code.slice(4)}`);
  await p.page.getByLabel('Name for this phone').fill('Baba');
  await p.page.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(p.page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });

  // A code past its ten minutes (written straight to the emulator) is refused.
  const stale = 'ZZZZ2222';
  const res = await fetch(`${FS}/pairings/${stale}`, {
    method: 'PATCH',
    headers: { ...OWNER, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        hid: { stringValue: `demo-${household}` },
        account: { stringValue: 'demo@manwar.local' },
        expiresAt: { integerValue: String(Date.now() - 1000) },
      },
    }),
  });
  expect(res.status).toBe(200);
  const late = await redeem(browser, household, stale, 'Late');
  await expect(late.page.locator('.ph-pair .error')).toContainText('expired or was already used');
});

test('the wall removes a phone: it is signed out and told why', async ({ browser }) => {
  const household = `e2e-pair-${RUN}-remove`;
  const w = await wall(browser, household);
  const p = await pairPhone(browser, w.page, household, 'Old phone');
  const row = w.page.locator('.set-row', { hasText: 'Old phone' });
  await row.getByRole('button', { name: 'Remove' }).click();
  await w.page.getByRole('dialog', { name: 'Remove Old phone?' }).getByRole('button', { name: 'Remove' }).click();
  await expect(row).toHaveCount(0);
  await expect(p.page.locator('.ph-pair')).toBeVisible({ timeout: 30_000 });
  await expect(p.page.locator('.ph-pair .error')).toContainText('This phone was removed from the household');
  // A reload does not bring it back.
  await p.page.reload();
  await expect(p.page.locator('.ph-pair')).toBeVisible({ timeout: 30_000 });
  await expect(p.page.locator('.ph-nav')).toHaveCount(0);
});

test('a phone unpairs itself without being told it was removed', async ({ browser }) => {
  const household = `e2e-pair-${RUN}-unpair`;
  const w = await wall(browser, household);
  const p = await pairPhone(browser, w.page, household, 'Spare');
  await p.page.getByRole('button', { name: 'More' }).click();
  await p.page.getByRole('button', { name: 'This phone' }).click();
  await p.page.getByRole('button', { name: 'Unpair this phone' }).click();
  await p.page.getByRole('dialog').getByRole('button', { name: 'Unpair' }).click();
  await expect(p.page.locator('.ph-pair')).toBeVisible({ timeout: 30_000 });
  await expect(p.page.locator('.ph-pair .error')).toHaveCount(0);
  await expect(w.page.locator('.set-row', { hasText: 'Spare' })).toHaveCount(0);
});

test("the phone's Back closes what is open, then returns to Today", async ({ browser }) => {
  const p = await phone(browser, `e2e-pair-${RUN}-back`);
  const page = p.page;
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'This phone' }).click();
  await expect(page.locator('.ph-head h1')).toHaveText('This phone');
  await page.getByRole('button', { name: 'Use the wall layout here' }).waitFor();
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('More');
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('Today');
  // The header's back arrow gives the entry back: Back after it does not undo it.
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'This phone' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.ph-head h1')).toHaveText('More');
  // Playwright's goBack targets an entry, not "one back": let the page's own history.back() land first.
  await expect.poll(() => page.evaluate(() => (history.state as { manwarBack?: number } | null)?.manwarBack)).toBe(1);
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('Today');
  expect(p.errors).toEqual([]);
});
