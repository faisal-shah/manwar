import { expect, test, type Locator, type Page } from '@playwright/test';

/*
 * Layout, contrast and touch on the wall: geometry measured in the page.
 * Each test gets its own demo household.
 */

const NOW = 'now=2026-11-04T11:44';
const RUN = Date.now().toString(36);
let seq = 0;

const rail = (page: Page, label: string) => page.locator('.rail button', { hasText: label });
const box = async (l: Locator) => (await l.boundingBox())!;
const rem = (page: Page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

test.describe.configure({ timeout: 90_000 });

/** A fresh demo household, once its family has been seeded (the Calendar tab shows their progress pills). */
async function open(page: Page, extra = ''): Promise<string> {
  const name = `e2e-fit-${RUN}-${++seq}`;
  await page.goto(`/?demo=${name}&${NOW}${extra}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.cal-prog')).toHaveCount(4, { timeout: 45_000 });
  return name;
}

async function pickView(page: Page, label: string) {
  await page.locator('.cal-view-btn').first().click();
  await page.getByRole('menuitemradio', { name: label }).click();
}

async function textSize(page: Page, label: 'Small' | 'Medium' | 'Large') {
  await rail(page, 'Settings').click();
  await page.locator('.set-menu button', { hasText: 'Display' }).click();
  await page.locator('.set-page .seg button', { hasText: label }).click();
  await expect(page.locator('html')).toHaveAttribute('data-text', label.toLowerCase());
  await page.getByRole('button', { name: 'Close' }).click();
}

const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-manwar/databases/(default)/documents';
type Plain = string | number | boolean | Plain[] | { [k: string]: Plain };
const enc = (v: Plain): object =>
  typeof v === 'string'
    ? { stringValue: v }
    : typeof v === 'boolean'
      ? { booleanValue: v }
      : typeof v === 'number'
        ? { integerValue: String(v) }
        : Array.isArray(v)
          ? { arrayValue: { values: v.map(enc) } }
          : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
/** A document written straight into the emulator (the owner token bypasses the rules). */
async function seedDoc(name: string, collection: string, doc: { id: string } & Record<string, Plain>) {
  const res = await fetch(`${FIRESTORE}/households/demo-${name}/${collection}/${doc.id}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(doc).map(([k, x]) => [k, enc(x)])) }),
  });
  expect(res.ok).toBe(true);
}

/**
 * WCAG contrast of each element's text against what it is drawn on (its
 * ancestors' backgrounds composited, opacity included; a gradient counts as
 * its first color), so use it on solid fills.
 */
function contrasts(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true })!;
    const parse = (s: string) => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = '#000';
      cx.fillStyle = s;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const over = (t: number[], b: number[]) => [0, 1, 2].map((i) => t[i] * t[3] + b[i] * (1 - t[3])).concat(1);
    const lum = (c: number[]) =>
      c
        .slice(0, 3)
        .map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => {
        const chain: HTMLElement[] = [];
        for (let e: HTMLElement | null = el; e; e = e.parentElement) chain.unshift(e);
        let bg = [255, 255, 255, 1];
        let op = 1;
        for (const e of chain) {
          const cs = getComputedStyle(e);
          // A gradient fill (the page background) counts as its first color.
          const stop = cs.backgroundImage.match(/rgba?\([^)]*\)|color\([^)]*\)/);
          if (stop) bg = over(parse(stop[0]), bg);
          bg = over(parse(cs.backgroundColor), bg);
          op *= parseFloat(cs.opacity);
        }
        const c = parse(getComputedStyle(el).color);
        const fg = over([c[0], c[1], c[2], c[3] * op], bg);
        const [a, b] = [lum(fg), lum(bg)];
        return { text: el.textContent!.trim(), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
      });
  }, selector);
}

test('the on-screen keyboard keeps the scale, and the sheet ends above it', async ({ page }) => {
  await page.setViewportSize({ width: 1340, height: 800 });
  await open(page);
  expect(await page.locator('meta[name=viewport]').getAttribute('content')).toContain('interactive-widget=resizes-content');
  const full = await rem(page);
  await page.locator('.fab').click();
  const sheet = page.locator('.sheet');
  const notes = sheet.locator('textarea');
  await notes.focus();
  // The keyboard opens over the lower half: the layout viewport shrinks to the space above it.
  await page.setViewportSize({ width: 1340, height: 420 });
  await expect.poll(() => rem(page)).toBe(full);
  // The focused field is scrolled up into the sheet, and the sheet's buttons stay above the keyboard.
  await expect.poll(async () => (await box(notes)).y + (await box(notes)).height).toBeLessThanOrEqual(420);
  const add = await box(sheet.locator('.sheet-foot .btn-primary'));
  expect(add.y + add.height).toBeLessThanOrEqual(420);
  // The keyboard closes.
  await page.setViewportSize({ width: 1340, height: 800 });
  await expect.poll(() => rem(page)).toBe(full);
  // A real window change with nothing to type into still rescales the wall.
  await notes.blur();
  await page.setViewportSize({ width: 1340, height: 600 });
  await expect.poll(() => rem(page)).toBeLessThan(full);
});

test("with large text, Home's week cells show whole titles and times", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await textSize(page, 'Large');
  await rail(page, 'Home').click();
  const pane = page.locator('.home-pane').first();
  await expect(pane.locator('.weekv')).toBeVisible();
  await expect(pane.locator('.cal-week-cell .ev-card').first()).toBeVisible();
  const cut = await pane
    .locator('.cal-week-cell')
    .evaluateAll((cells) =>
      cells.flatMap((c) =>
        [...c.querySelectorAll<HTMLElement>('.ev-title, .ev-time, .cal-week-count')]
          .filter((el) => el.getBoundingClientRect().width > 0 && el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.textContent),
      ),
    );
  expect(cut).toEqual([]);
  // The time line still says when, and each card still shows whose it is.
  const card = pane.locator('.cal-week-cell[data-day="2026-11-04"] .ev-card', { hasText: 'Handwriting' });
  await expect(card.locator('.ev-time')).toHaveText('10:45 AM', { useInnerText: true });
  await expect(card.locator('.avatar')).toBeVisible();
});

test('with the keyboard up, a list field low on the screen scrolls the list, not the page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await rail(page, 'Lists').click();
  // A section's + opens Add item at the end of that section, near the bottom of the screen.
  await page
    .getByRole('button', { name: /^Add to / })
    .last()
    .click();
  const field = page.locator('.li-add-input:focus');
  await expect(field).toBeVisible();
  // The keyboard opens: the viewport shrinks to the space above it, shorter than the nav rail.
  await page.setViewportSize({ width: 1280, height: 430 });
  await expect.poll(async () => (await box(field)).y + (await box(field)).height).toBeLessThanOrEqual(430);
  await page.waitForTimeout(300);
  expect((await box(page.locator('.topbar'))).y).toBe(0);
  expect(await page.evaluate(() => [document.documentElement.scrollTop, document.body.scrollTop])).toEqual([0, 0]);
  // The field scrolled into view inside its list.
  expect(await field.evaluate((el) => el.closest('.lc-body')!.scrollTop)).toBeGreaterThan(0);
});

test('a PIN pad that opens while someone types closes the keyboard, so all its keys show', async ({ page }) => {
  await page.clock.install();
  await open(page);
  await rail(page, 'Settings').click();
  await page.locator('.set-menu button', { hasText: /^Parental lock$/ }).click();
  await page.getByRole('button', { name: /Set a PIN/ }).click();
  const key = (d: string) => page.locator('.pin-setup .pin-keys button', { hasText: new RegExp(`^${d}$`) });
  for (const d of '1357') await key(d).click();
  await expect(page.locator('.pin-setup')).toContainText('Enter the PIN again');
  for (const d of '1357') await key(d).click();
  await expect(page.getByText('The lock is on')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  // A parent starts an item, walks away past the relock, comes back and taps the keyboard's Done.
  await rail(page, 'Lists').click();
  const field = page.getByRole('textbox', { name: 'Add item to Grocery List' }).first();
  await field.click();
  await page.keyboard.type('milk');
  await page.clock.fastForward('02:10');
  await page.setViewportSize({ width: 1600, height: 520 });
  await field.press('Enter');
  const pad = page.locator('.modal', { hasText: 'Parent PIN' });
  await expect(pad).toBeVisible();
  // The field lets go (on the tablet the keyboard closes), and the wall is drawn for the whole screen again.
  await expect(field).not.toBeFocused();
  await page.setViewportSize({ width: 1600, height: 1000 });
  const zero = await box(pad.locator('.pin-keys button', { hasText: /^0$/ }));
  expect(zero.y + zero.height).toBeLessThanOrEqual(1000);
  expect(await rem(page)).toBe(10);
});

for (const tab of ['Home', 'Calendar', 'Lists', 'Tasks', 'Rewards', 'Recipes']) {
  test(`${tab}: a list under the + button scrolls its last row clear of it`, async ({ page }) => {
    await open(page);
    await rail(page, tab).click();
    await page.waitForTimeout(800);
    const fab = await box(page.locator('.fab'));
    const covered = await page.evaluate((f) => {
      const out: string[] = [];
      const hit = (r: DOMRect) => r.right > f.x && r.left < f.x + f.width && r.bottom > f.y && r.top < f.y + f.height;
      for (const el of document.querySelectorAll<HTMLElement>('.tab-body .scroll')) {
        const r = el.getBoundingClientRect();
        if (!hit(r)) continue;
        el.scrollTop = el.scrollHeight;
        for (const c of el.querySelectorAll<HTMLElement>('button, input, textarea, [role=button]')) {
          const b = c.getBoundingClientRect();
          if (b.width && b.bottom > r.top && b.top < r.bottom && hit(b))
            out.push(c.getAttribute('aria-label') || c.textContent!.trim());
        }
      }
      return out;
    }, fab);
    expect(covered).toEqual([]);
  });
}

test('Month fills its rows and never cuts "more" off (large text, a six-week month)', async ({ page }) => {
  await open(page);
  await rail(page, 'Calendar').click();
  await pickView(page, 'Month');
  // A tall row holds more than three lines: a busy day shows three items and its "more".
  await expect(page.locator('.month-more').first()).toBeVisible();
  const lines = await page
    .locator('.month-item, .month-more')
    .evaluateAll((els) => Math.max(...els.map((e) => parseInt((e as HTMLElement).style.gridRow))));
  expect(lines).toBeGreaterThanOrEqual(5);

  await page.setViewportSize({ width: 1024, height: 600 });
  await textSize(page, 'Large');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.month-week')).toHaveCount(6);
  await expect(page.locator('.month-more').first()).toBeVisible();
  const fab = await box(page.locator('.fab'));
  const bad = await page.locator('.month-week').evaluateAll(
    (weeks, f) =>
      weeks.flatMap((w) => {
        const wb = w.getBoundingClientRect();
        return [...w.querySelectorAll<HTMLElement>('.month-item, .month-more')].flatMap((el) => {
          const b = el.getBoundingClientRect();
          const out: string[] = [];
          if (b.bottom > wb.bottom + 1) out.push(`cut: ${el.textContent}`);
          if (b.right > f.x && b.left < f.x + f.width && b.bottom > f.y && b.top < f.y + f.height)
            out.push(`under +: ${el.textContent}`);
          return out;
        });
      }),
    fab,
  );
  expect(bad).toEqual([]);
});

test('a narrow Month (the Home pane) shows titles, not "10:45 AM Hanc"', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await open(page);
  await rail(page, 'Home').click();
  await pickView(page, 'Month');
  const pills = page.locator('.month-item .ev-pill', { hasText: 'Handwriting' });
  await expect(pills.first().locator('.ev-prefix')).toBeHidden();
  await page.evaluate(() => document.fonts.ready);
  const cut = await pills
    .locator('.ev-title')
    .evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(cut).toBe(0);
});

test('all-day events come before meals in the Schedule strip', async ({ page }) => {
  const name = `e2e-fit-${RUN}-${++seq}`;
  for (const [i, title] of ['Soup', 'Salad', 'Stew'].entries())
    await seedDoc(name, 'meals', { id: `m${i}`, date: '2026-11-11', category: 'dinner', title, order: i, createdAt: 1 });
  await page.goto(`/?demo=${name}&${NOW}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.cal-prog')).toHaveCount(4, { timeout: 45_000 });
  await rail(page, 'Calendar').click();
  await pickView(page, 'Schedule');
  await page.getByRole('button', { name: 'Next' }).click();
  const strip = await box(page.locator('.sched-allday'));
  const holiday = page.locator('.allday-item .ev-pill', { hasText: 'Veterans Day' });
  await expect(page.locator('.allday-item .cal-meal', { hasText: 'Stew' })).toHaveCount(1);
  const b = await box(holiday);
  expect(b.y).toBeGreaterThanOrEqual(strip.y);
  expect(b.y + b.height).toBeLessThanOrEqual(strip.y + strip.height);
});

test('the Day view mini month keeps round day circles in the Home pane', async ({ page }) => {
  await open(page);
  await rail(page, 'Home').click();
  await pickView(page, 'Day');
  const r = await rem(page);
  const today = await box(page.locator('.cal-mini-day.today span'));
  expect(today.width).toBeCloseTo(today.height, 0);
  const widths = await page.locator('.cal-mini-day').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  for (const w of widths) expect(w / r).toBeGreaterThanOrEqual(4.4);
});

test('text on a light profile or category color is dark enough to read', async ({ page }) => {
  const name = await open(page);
  await seedDoc(name, 'profiles', { id: 'yasmin', name: 'Yasmin', color: '#FBD97F', order: 9, stars: 500, createdAt: 9 });
  await expect(page.locator('.cal-prog', { hasText: 'Yasmin' })).toBeVisible();
  for (const [tab, sel] of [
    ['Calendar', '.cal-prog .avatar:not(.emoji)'],
    ['Rewards', '.pcol[data-column="yasmin"] .rw-redeem, .pcol-id .avatar:not(.emoji)'],
    ['Meals', '.cat-badge'],
    ['Recipes', '.cat-badge, .rc-n'],
  ] as const) {
    await rail(page, tab).click();
    await page.waitForTimeout(500);
    const all = await contrasts(page, sel);
    expect(all.length, tab).toBeGreaterThan(0);
    expect(
      all.filter((c) => c.ratio < 4.5),
      tab,
    ).toEqual([]);
  }
  await rail(page, 'Calendar').click();
  await pickView(page, 'Week');
  const badges = (await contrasts(page, '.cal-meal-badge')).filter((c) => c.ratio < 4.5);
  expect(badges).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
  test(`today's date, late chores and dim text meet AA (${theme})`, async ({ page }) => {
    await open(page, `&theme=${theme}`);
    await rail(page, 'Calendar').click();
    await pickView(page, 'Day');
    const day = await contrasts(page, '.cal-mini-day.today span, .cal-mini-day.other span, .rail .badge');
    expect(day.length).toBeGreaterThan(3);
    expect(day.filter((c) => c.ratio < 4.5)).toEqual([]);
    await rail(page, 'Tasks').click();
    await expect(page.locator('.tk-late').first()).toBeVisible();
    const late = await contrasts(page, '.tk-late');
    expect(late.length).toBeGreaterThan(0);
    expect(late.filter((c) => c.ratio < 4.5)).toEqual([]);
  });
}

/** Hit area of every visible control in `scope`: probes 2.7rem out from its center must land on it. */
function smallTargets(page: Page, scope: string) {
  return page.evaluate(async (sel) => {
    // Sheets slide and popovers pop in: measure where they come to rest.
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished),
    );
    // A popover places itself again once its content has its size.
    await new Promise((r) => setTimeout(r, 300));
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const d = 2.7 * rem;
    const out: string[] = [];
    for (const root of document.querySelectorAll(sel))
      for (const el of root.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, [role=switch]')) {
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const on = (px: number, py: number) => {
          const t = document.elementFromPoint(px, py);
          return !!t && el.contains(t);
        };
        if (!on(x, y)) continue;
        const ok =
          (r.width >= 5.55 * rem || (on(x - d, y) && on(x + d, y))) && (r.height >= 5.55 * rem || (on(x, y - d) && on(x, y + d)));
        if (!ok)
          out.push(
            `${el.getAttribute('aria-label') || el.textContent!.trim()} ${(r.width / rem).toFixed(1)}x${(r.height / rem).toFixed(1)}`,
          );
      }
    return out;
  }, scope);
}

test('controls take a 5.6rem finger, however small they draw', async ({ page }) => {
  await open(page);
  await rail(page, 'Calendar').click();
  expect(await smallTargets(page, '.topbar, .cal-strip')).toEqual([]);
  await page.locator('.fab').click();
  expect(await smallTargets(page, '.sheet')).toEqual([]);
  await page.getByRole('button', { name: 'Close' }).click();
  await rail(page, 'Tasks').click();
  await page.locator('.topbar .seg button', { hasText: 'Week' }).click();
  expect(await smallTargets(page, '.topbar, .wk')).toEqual([]);
  await page.locator('.topbar .ctl', { hasText: 'Filter' }).click();
  expect(await smallTargets(page, '.popover')).toEqual([]);
  await page.mouse.click(5, 995);
  await rail(page, 'Settings').click();
  await page.locator('.set-menu button', { hasText: 'Display' }).click();
  expect(await smallTargets(page, '.sheet')).toEqual([]);
});

/**
 * Points of a visible control in `selector` (every pixel of its edge rows, a 2px grid inside, within what
 * its scrollers show) where a tap lands on a control in `thief` above it: a neighbour's grown hit area.
 */
function stolen(page: Page, selector: string, thief: string) {
  return page.evaluate(
    ([sel, by]) => {
      const control = (el: Element | null) => el?.closest(by);
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        let { left, top, right, bottom } = el.getBoundingClientRect();
        for (let a = el.parentElement; a; a = a.parentElement) {
          if (getComputedStyle(a).overflow === 'visible') continue;
          const r = a.getBoundingClientRect();
          [left, top, right, bottom] = [
            Math.max(left, r.left),
            Math.max(top, r.top),
            Math.min(right, r.right),
            Math.min(bottom, r.bottom),
          ];
        }
        if (right - left < 2 || bottom - top < 2) continue;
        const ys = new Set<number>();
        // Pixel rows and columns whose centres (+0.5) fall inside: the first and last are the edges.
        const [y0, y1, x0] = [Math.ceil(top - 0.5), Math.ceil(bottom - 0.5) - 1, Math.ceil(left - 0.5)];
        for (let y = y0; y <= y1; y += 2) ys.add(y);
        ys.add(y0).add(y1);
        // Pixel centres, plus the top and left edges themselves: a touch can land exactly on a boundary.
        const points: [number, number][] = [];
        for (const y of ys) for (let x = x0; x + 0.5 < right; x += y === y0 || y === y1 ? 1 : 2) points.push([x + 0.5, y + 0.5]);
        for (let x = x0; x + 0.5 < right; x++) points.push([x + 0.5, top]);
        for (let y = y0; y + 0.5 < bottom; y++) points.push([left, y + 0.5]);
        let n = 0;
        let to = '';
        for (const [x, y] of points) {
          const hit = document.elementFromPoint(x, y);
          if (!hit || el.contains(hit) || !control(hit)) continue;
          // Under another control, not outside its own shape (a rounded corner).
          if (!document.elementsFromPoint(x, y).includes(el)) continue;
          n++;
          to = control(hit)!.className;
        }
        if (n) out.push(`${el.getAttribute('aria-label') || el.textContent!.trim().slice(0, 30)}: ${n} points to ${to}`);
      }
      return out;
    },
    [selector, thief],
  );
}

test("a tap on a control's edge is never a neighbour's", async ({ page }) => {
  const name = await open(page);
  // A crowded lunch: its list scrolls, and the + sits right under the last meal showing.
  for (const [i, title] of ['Lentil soup', 'Pita wraps', 'Fried rice', 'Tomato salad'].entries())
    await seedDoc(name, 'meals', { id: `crowd${i}`, date: '2026-11-04', category: 'lunch', title, order: 10 + i, createdAt: 1 });
  await rail(page, 'Meals').click();
  const cell = page.locator('[data-cell="2026-11-04|lunch"]');
  await expect(cell.locator('.mg-entry', { hasText: 'Tomato salad' })).toBeAttached();
  expect(await stolen(page, '[data-cell="2026-11-04|lunch"] .mg-entry', '.mg-add')).toEqual([]);

  // Column heads: the star pill over the section buttons and over a scrolled column's cards.
  await rail(page, 'Tasks').click();
  await expect(page.locator('[data-column="asiyah"] .tk-sec').first()).toBeVisible();
  expect(await stolen(page, '.pcol .tk-sec, .pcol .tk-card button', '.pill')).toEqual([]);
  await rail(page, 'Rewards').click();
  const body = page.locator('[data-column="asiyah"] .pcol-body');
  await expect(body.locator('.rw-card').first()).toBeVisible();
  for (const by of [7, 23, 41]) {
    await body.evaluate((el, y) => (el.scrollTop = y), by);
    expect(await stolen(page, '[data-column="asiyah"] .rw-card button', '.pill')).toEqual([]);
  }
});

test('no text on the wall is under 1.3rem, and the glance text is bigger', async ({ page }) => {
  await open(page);
  const tiny = () =>
    page.evaluate(() => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('#app *')) {
        if (el.closest('.avatar, svg')) continue;
        const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim());
        if (!own.length || !el.getBoundingClientRect().width) continue;
        const text = own
          .map((n) => n.textContent)
          .join('')
          .trim();
        if (/^[\p{Extended_Pictographic}\u200d\ufe0f\s]+$/u.test(text)) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px / rem < 1.29) out.push(`${text} ${(px / rem).toFixed(2)}rem`);
      }
      return [...new Set(out)];
    });
  const size = (sel: string) =>
    page
      .locator(sel)
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const r = await rem(page);
  await rail(page, 'Calendar').click();
  for (const view of ['Schedule', 'Week', 'Month']) {
    await pickView(page, view);
    expect(await tiny(), view).toEqual([]);
  }
  expect((await size('.topbar .when .time')) / r).toBeGreaterThanOrEqual(4.2);
  expect((await size('.cal-prog-name')) / r).toBeGreaterThanOrEqual(2);
  await rail(page, 'Tasks').click();
  expect(await tiny()).toEqual([]);
  expect((await size('.tk-title')) / r).toBeGreaterThanOrEqual(2);
  await rail(page, 'Home').click();
  expect(await tiny()).toEqual([]);
});

test('with large text the running timer readout stays clear of the pie', async ({ page }) => {
  await open(page);
  await textSize(page, 'Large');
  await rail(page, 'Home').click();
  await page.locator('.topbar').getByRole('button', { name: 'Timer' }).click();
  for (const d of '15') await page.locator('.modal .pin-keys button', { hasText: new RegExp(`^${d}$`) }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  const layer = page.locator('.timer-layer');
  await expect(layer.locator('.timer-clock')).toBeVisible();
  const pie = await box(layer.locator('.timer-pie'));
  const r = pie.width / 2;
  for (const part of ['.timer-clock', '.timer-total']) {
    const b = await box(layer.locator(part));
    // The point of the readout nearest the pie's center is outside its circle.
    const nx = Math.max(b.x, Math.min(pie.x + r, b.x + b.width));
    const ny = Math.max(b.y, Math.min(pie.y + r, b.y + b.height));
    expect(Math.hypot(nx - pie.x - r, ny - pie.y - r), part).toBeGreaterThan(r);
  }
  expect(pie.x + pie.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('Meals: a sideways swipe that starts on a planned meal pages the week', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    hasTouch: true,
    timezoneId: 'America/Chicago',
  });
  const page = await ctx.newPage();
  await open(page);
  await rail(page, 'Meals').click();
  const first = page.locator('.mg-day .num').first();
  await expect(first).toHaveText('1');
  const list = await box(page.locator('.mg-cell.planned .mg-list').first());
  const x = list.x + list.width - 10;
  const y = list.y + 10;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= 10; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 40 * i, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(first).toHaveText('8');
  await expect(page.locator('.popover, .sheet')).toHaveCount(0);
  await ctx.close();
});

test('eight people in the progress strip: each pill shows a whole name or none', async ({ page }) => {
  const name = await open(page);
  for (const [i, n] of ['Zaynab Khadijah', 'Ibrahim', 'Aisha Siddiqa', 'Grandma Noor'].entries())
    await seedDoc(name, 'profiles', { id: `p${i}`, name: n, color: '#2177AE', order: 10 + i, stars: 0, createdAt: 10 + i });
  await expect(page.locator('.cal-prog')).toHaveCount(8);
  const cut = await page
    .locator('.cal-prog-name')
    .evaluateAll((els) =>
      els.filter((el) => el.getBoundingClientRect().width > 0 && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent),
    );
  expect(cut).toEqual([]);
  // Avatar and count stay whole in every pill.
  const counts = await page.locator('.cal-prog-count').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  for (const w of counts) expect(w).toBeGreaterThan(0);
});

test('Arabic typed into a field runs right to left; an empty field keeps its placeholder on the left', async ({ page }) => {
  await open(page);
  const dir = (l: Locator) => l.evaluate((el) => getComputedStyle(el).direction);
  await rail(page, 'Lists').click();
  const add = page.getByRole('textbox', { name: 'Add item to Grocery List' }).first();
  expect(await dir(add)).toBe('ltr');
  await add.fill('خبز');
  expect(await dir(add)).toBe('rtl');
  await add.fill('2 بيض');
  expect(await dir(add)).toBe('rtl');
  await add.fill('Milk');
  expect(await dir(add)).toBe('ltr');
  await add.fill('');

  await rail(page, 'Recipes').click();
  const search = page.getByRole('textbox', { name: 'Search recipes' });
  await search.fill('عدس');
  expect(await dir(search)).toBe('rtl');
  await search.fill('');

  await rail(page, 'Tasks').click();
  await page.locator('.fab').click();
  const sheet = page.locator('.sheet');
  const title = sheet.getByRole('textbox', { name: 'Title' });
  await title.fill('ترتيب الغرفة');
  expect(await dir(title)).toBe('rtl');
  const notes = sheet.locator('textarea');
  await notes.fill('اجمع الألعاب');
  expect(await dir(notes)).toBe('rtl');
  // The row around the field keeps its own direction: the emoji button stays on the left (one read, as the sheet slides in).
  const order = await title.evaluate((el) => {
    const btn = el.parentElement!.querySelector('.tk-ed-emoji')!;
    return btn.getBoundingClientRect().right <= el.getBoundingClientRect().left;
  });
  expect(order).toBe(true);
});
