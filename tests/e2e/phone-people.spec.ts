import { expect as baseExpect, test, type Page } from '@playwright/test';
import { FS, OWNER, pairPhone, phone, wall } from './phone-helpers';
import {
  RUN,
  backSettled,
  chip,
  enterPin,
  phoneTab,
  serverDocs,
  serverField,
  setPin,
  wallAndPhone,
  writeDoc,
} from './phone-family';

/*
 * More > People on the phone against a live wall: adding, editing,
 * reordering and deleting people, with the wall's rules (names unique,
 * deletes that say what they archive, edits that keep another device's).
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });

// Every wall and phone a test opened is its own browser context: close them, or a worker holds them all.
test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

async function openPeople(page: Page) {
  await phoneTab(page, 'More');
  await page.locator('.ph-menu button', { hasText: 'People' }).click();
  await expect(page.locator('.ph-head h1')).toHaveText('People');
  // The view drops a tap within the double-tap time of the one that opened it, near that spot.
  await page.waitForTimeout(500);
}

const names = (page: Page) => page.locator('.pp-name');
/** A name as a dialog title or toast sets it: isolated, so an Arabic one keeps its punctuation on its side. */
const iso = (s: string) => `\u2068${s}\u2069`;
const editor = (page: Page, title: 'Add a person' | 'Edit person') => page.getByRole('dialog', { name: title });

/** The wall's Settings > Profiles, open. */
async function wallProfiles(w: Page) {
  await w.locator('.rail button', { hasText: 'Settings' }).click();
  await w.locator('.set-menu button', { hasText: /^Profiles$/ }).click();
}

/** Whether the task titled `title` is archived on the server. */
async function archived(household: string, title: string): Promise<boolean> {
  const res = await fetch(`${FS}/households/demo-${household}/tasks?pageSize=1000`, { headers: OWNER });
  type Doc = { fields: { title: { stringValue: string }; archived?: { booleanValue: boolean } } };
  const docs = ((await res.json()) as { documents: Doc[] }).documents;
  return docs.find((d) => d.fields.title.stringValue === title)?.fields.archived?.booleanValue ?? false;
}

/** The household's people on the server, in their order. */
const serverNames = (household: string) => async () =>
  (await serverDocs(household, 'profiles')).sort((a, b) => Number(a.order) - Number(b.order)).map((p) => p.name);

test('a person added on the phone shows on the wall; edited and moved there too', async ({ browser }) => {
  const { household, w, p, errors } = await wallAndPhone(browser, 'people-add', { tab: 'More' });
  const page = p.page;
  await expect(page.locator('.ph-menu button', { hasText: 'People' })).toContainText('4 people');
  await openPeople(page);
  await expect(names(page)).toHaveText(['Asiyah', 'Mamma', 'Baba', 'Hashim!']);

  await page.getByRole('button', { name: 'Add a person' }).click();
  const add = editor(page, 'Add a person');
  await page.waitForTimeout(500);
  await add.getByRole('textbox', { name: 'Name' }).fill('Zaid');
  await add.getByRole('tab', { name: 'Animals' }).click();
  await add.locator('.emoji-grid button', { hasText: '🦁' }).click();
  await add.getByLabel('Birthday').fill('2019-03-07');
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(add).toHaveCount(0);
  await expect(names(page)).toHaveText(['Asiyah', 'Mamma', 'Baba', 'Hashim!', 'Zaid']);
  await expect(page.locator('.pp-row', { hasText: 'Zaid' })).toContainText('Birthday Mar 7 · 0 stars');

  // On the wall: a profile like one made there, and a column on Tasks.
  await expect.poll(serverNames(household)).toEqual(['Asiyah', 'Mamma', 'Baba', 'Hashim!', 'Zaid']);
  await w.page.locator('.rail button', { hasText: 'Tasks' }).click();
  await expect(w.page.locator('[data-column]', { hasText: 'Zaid' })).toBeVisible();
  await wallProfiles(w.page);
  const wallRow = w.page.locator('.profile-row', { hasText: 'Zaid' });
  await expect(wallRow).toContainText('Birthday Mar 7');
  await expect(wallRow.locator('.avatar')).toHaveText('🦁');

  // Renamed, the birthday and the emoji taken away.
  await page.getByRole('button', { name: 'Edit Zaid' }).click();
  const edit = editor(page, 'Edit person');
  await page.waitForTimeout(500);
  await expect(edit.getByRole('textbox', { name: 'Name' })).toHaveValue('Zaid');
  await edit.getByRole('textbox', { name: 'Name' }).fill('Zayd');
  await edit.getByRole('button', { name: 'No birthday' }).click();
  await edit.getByRole('button', { name: 'No emoji' }).click();
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect(w.page.locator('.profile-row', { hasText: 'Zayd' })).toContainText('No birthday');
  await expect(w.page.locator('.profile-row', { hasText: 'Zayd' }).locator('.avatar')).toHaveText('Z');
  const id = (await serverDocs(household, 'profiles')).find((d) => d.name === 'Zayd')!.id as string;
  expect(await serverField(household, `profiles/${id}`, 'birthday')).toBeNull();
  expect(await serverField(household, `profiles/${id}`, 'emoji')).toBeNull();

  // Moved up past Hashim!, and Mamma to the top: the wall follows.
  await page.getByRole('button', { name: 'Move Zayd up' }).click();
  await expect(names(page)).toHaveText(['Asiyah', 'Mamma', 'Baba', 'Zayd', 'Hashim!']);
  await page.getByRole('button', { name: 'Move Mamma up' }).click();
  await expect(names(page)).toHaveText(['Mamma', 'Asiyah', 'Baba', 'Zayd', 'Hashim!']);
  await expect(page.getByRole('button', { name: 'Move Mamma up' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move Hashim! down' })).toBeDisabled();
  await expect(w.page.locator('.profile-name')).toHaveText(['Mamma', 'Asiyah', 'Baba', 'Zayd', 'Hashim!']);
  await expect.poll(serverNames(household)).toEqual(['Mamma', 'Asiyah', 'Baba', 'Zayd', 'Hashim!']);
  expect(errors()).toEqual([]);
});

test('deleting a person on the phone says what goes with them, asks first, and the Tasks tab moves on', async ({ browser }) => {
  const { household, w, p, errors } = await wallAndPhone(browser, 'people-delete', { tab: 'Tasks' });
  const page = p.page;
  await chip(page, 'hashim').click();
  await expect(chip(page, 'hashim')).toHaveAttribute('aria-pressed', 'true');
  await openPeople(page);
  await page.getByRole('button', { name: 'Edit Hashim!' }).click();
  const edit = editor(page, 'Edit person');
  await page.waitForTimeout(500);
  await edit.getByRole('button', { name: 'Delete', exact: true }).click();
  const ask = page.getByRole('dialog', { name: `Delete ${iso('Hashim!')}?` });
  await expect(ask).toContainText(`only ${iso('Hashim!')} had will be archived`);
  await expect(ask).toContainText('This cannot be undone.');
  await page.waitForTimeout(500);
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toHaveCount(0);
  await expect(edit).toBeVisible();
  await w.page.locator('.rail button', { hasText: 'Tasks' }).click();
  await page.waitForTimeout(1000);
  expect(await serverField(household, 'profiles/hashim', 'name')).toBe('Hashim!');
  await expect(w.page.locator('[data-column="hashim"]')).toBeVisible();

  await edit.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForTimeout(500);
  await ask.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText(`${iso('Hashim!')} was deleted.`);
  await expect(names(page)).toHaveText(['Asiyah', 'Mamma', 'Baba']);
  await expect.poll(() => serverField(household, 'profiles/hashim', 'name')).toBeNull();
  await w.page.locator('.rail button', { hasText: 'Tasks' }).click();
  await expect(w.page.locator('[data-column="hashim"]')).toHaveCount(0);
  await expect(w.page.locator('[data-column="asiyah"]')).toBeVisible();
  // His own chores are archived, not left to no one; a shared routine goes on for Asiyah.
  expect(await archived(household, 'Tidy toys')).toBe(true);
  expect(await archived(household, 'Breakfast')).toBe(false);

  // The Tasks tab showed him: it shows the first person now.
  await phoneTab(page, 'Tasks');
  await expect(chip(page, 'asiyah')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'hashim')).toHaveCount(0);
  expect(errors()).toEqual([]);
});

test('a name already taken is refused, and Back closes the editor with nothing saved', async ({ browser }) => {
  const { household, p, errors } = await wallAndPhone(browser, 'people-taken', { tab: 'More' });
  const page = p.page;
  await openPeople(page);
  await page.getByRole('button', { name: 'Add a person' }).click();
  const add = editor(page, 'Add a person');
  await page.waitForTimeout(500);
  await add.getByRole('textbox', { name: 'Name' }).fill(' mamma ');
  await expect(add.getByRole('alert')).toHaveText('Someone else is already called mamma.');
  await expect(add.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  await add.getByRole('textbox', { name: 'Name' }).fill('');
  await expect(add.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  await add.getByRole('textbox', { name: 'Name' }).fill('Maryam');
  await expect(add.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
  // Back: the editor closes and People stays.
  await backSettled(page, 3);
  await page.goBack();
  await expect(add).toHaveCount(0);
  await expect(page.locator('.ph-head h1')).toHaveText('People');
  await page.waitForTimeout(1000);
  expect((await serverDocs(household, 'profiles')).map((d) => d.name)).not.toContain('Maryam');
  // Renaming one to its own name is fine.
  await page.getByRole('button', { name: 'Edit Mamma' }).click();
  const edit = editor(page, 'Edit person');
  await expect(edit.getByRole('alert')).toHaveCount(0);
  await expect(edit.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  expect(errors()).toEqual([]);
});

test('an edit on the phone keeps what the wall changed meanwhile; a person deleted on the wall closes the editor', async ({
  browser,
}) => {
  const { household, w, p, errors } = await wallAndPhone(browser, 'people-both', { tab: 'More' });
  const page = p.page;
  await openPeople(page);
  await page.getByRole('button', { name: 'Edit Asiyah' }).click();
  const edit = editor(page, 'Edit person');
  await page.waitForTimeout(500);
  // The wall renames her while the phone's editor is open on her color.
  await writeDoc(household, 'profiles/asiyah?updateMask.fieldPaths=name', { name: { stringValue: 'Asiya' } });
  await expect(names(page).first()).toHaveText('Asiya');
  const pick = edit.locator('.swatches button:not(.on)').first();
  const color = (await pick.getAttribute('aria-label'))!;
  await pick.click();
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect.poll(() => serverField(household, 'profiles/asiyah', 'color')).toBe(color);
  expect(await serverField(household, 'profiles/asiyah', 'name')).toBe('Asiya');

  // Baba is deleted on the wall while the phone edits him.
  await page.getByRole('button', { name: 'Edit Baba' }).click();
  await page.waitForTimeout(500);
  await editor(page, 'Edit person').getByRole('textbox', { name: 'Name' }).fill('Baba Z');
  await wallProfiles(w.page);
  await w.page.getByRole('button', { name: 'Edit Baba' }).click();
  await w.page.getByRole('button', { name: 'Delete', exact: true }).click();
  await w.page.getByRole('button', { name: 'Delete profile' }).click();
  await expect(editor(page, 'Edit person')).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText(`${iso('Baba')} was deleted on another device.`);
  await expect(names(page)).toHaveText(['Asiya', 'Mamma', 'Hashim!']);
  await page.waitForTimeout(1000);
  expect(await serverField(household, 'profiles/baba', 'name')).toBeNull();
  expect(errors()).toEqual([]);
});

test('a person added offline shows at once, waits in the status line, and reaches the wall', async ({ browser }) => {
  const { household, w, p, errors } = await wallAndPhone(browser, 'people-offline', { tab: 'More' });
  const page = p.page;
  await openPeople(page);
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Add a person' }).click();
  const add = editor(page, 'Add a person');
  await page.waitForTimeout(500);
  await add.getByRole('textbox', { name: 'Name' }).fill('Nana');
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(names(page).last()).toHaveText('Nana');
  await expect(page.locator('.ph-status')).toContainText('1 change not sent yet');
  await page.context().setOffline(false);
  await expect.poll(serverNames(household), { timeout: 30_000 }).toContain('Nana');
  await expect(page.locator('.ph-status', { hasText: 'not sent yet' })).toHaveCount(0);
  await w.page.locator('.rail button', { hasText: 'Tasks' }).click();
  await expect(w.page.locator('[data-column]', { hasText: 'Nana' })).toBeVisible();
  // Offline, the browser reports each request it could not make.
  expect(errors().filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e))).toEqual([]);
});

test('a double tap on Add a person presses nothing in the editor it opens', async ({ browser }) => {
  const { p, errors } = await wallAndPhone(browser, 'people-double', { tab: 'More' });
  const page = p.page;
  await openPeople(page);
  const button = page.getByRole('button', { name: 'Add a person' });
  const b = (await button.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  const add = editor(page, 'Add a person');
  await expect(add).toBeVisible();
  // What a single tap opens with: the first free color, no emoji.
  const first = await add.locator('.swatches button.on').getAttribute('aria-label');
  await add.getByRole('button', { name: 'Cancel' }).click();
  await expect(add).toHaveCount(0);
  await page.waitForTimeout(600);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(120);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(add).toBeVisible();
  await page.waitForTimeout(300);
  await expect(add.locator('.swatches button.on')).toHaveAttribute('aria-label', first!);
  await expect(add.locator('.profile-preview .avatar')).toHaveText('?');
  await expect(add.getByRole('textbox', { name: 'Name' })).toHaveValue('');
  expect(errors()).toEqual([]);
});

test('a new household: Add a person on Today opens the editor, and the person is everywhere', async ({ browser }) => {
  const household = `phtasks-${RUN}-people-first`;
  const w = await wall(browser, household, '&seed=none');
  await expect(w.page.locator('.rail')).toBeVisible();
  const p = await phone(browser, household, '&seed=none');
  const page = p.page;
  const card = page.getByRole('region', { name: 'Tasks today' });
  await expect(card).toContainText('No people yet.');
  await expect(card).not.toContainText('at the wall');
  await card.getByRole('button', { name: 'Add a person' }).click();
  await expect(page.locator('.ph-head h1')).toHaveText('People');
  const add = editor(page, 'Add a person');
  await page.waitForTimeout(500);
  await add.getByRole('textbox', { name: 'Name' }).fill('Asiyah');
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(names(page)).toHaveText(['Asiyah']);
  // Back: More, then Today, which has her now.
  await backSettled(page, 2);
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('More');
  await backSettled(page, 1);
  await page.goBack();
  await expect(page.getByRole('region', { name: 'Tasks today' })).toContainText('Asiyah');
  await phoneTab(page, 'Tasks');
  await expect(page.locator('.pt')).not.toContainText('No people yet');
  await expect(w.page.locator('.home-tasks .no-profiles')).toHaveCount(0);
  // The editor is the People view's: it does not open again on a later visit.
  await openPeople(page);
  await expect(editor(page, 'Add a person')).toHaveCount(0);
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('with no people, Tasks and Stars offer Add a person, and the task editor says where people are added', async ({
  browser,
}) => {
  const household = `phtasks-${RUN}-people-empty`;
  const w = await wall(browser, household, '&seed=none');
  await expect(w.page.locator('.rail')).toBeVisible();
  const p = await phone(browser, household, '&seed=none');
  const page = p.page;
  await phoneTab(page, 'Tasks');
  await expect(page.locator('.pt')).toContainText('No people yet');
  await page.getByRole('button', { name: 'Add task' }).click();
  const task = page.getByRole('dialog', { name: 'Add task' });
  await expect(task).toContainText('Add your family in More, under People.');
  await page.waitForTimeout(500);
  await task.getByRole('button', { name: 'Cancel' }).click();
  await expect(task).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.locator('.pt').getByRole('button', { name: 'Add a person' }).click();
  await expect(page.locator('.ph-head h1')).toHaveText('People');
  await expect(editor(page, 'Add a person')).toBeVisible();
  await page.waitForTimeout(500);
  await editor(page, 'Add a person').getByRole('button', { name: 'Cancel' }).click();

  // From Stars: People opens in its place, with the editor; Back closes the editor, then People.
  await page.locator('.ph-back').click();
  await page.locator('.ph-menu button', { hasText: 'Stars and rewards' }).click();
  await page.waitForTimeout(500);
  const stars = page.getByRole('region', { name: 'Stars' });
  await expect(stars).toContainText('No people yet.');
  await stars.getByRole('button', { name: 'Add a person' }).click();
  await expect(page.locator('.ph-head h1')).toHaveText('People');
  const add = editor(page, 'Add a person');
  await page.waitForTimeout(500);
  await add.getByRole('textbox', { name: 'Name' }).fill('Asiyah');
  await add.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(names(page)).toHaveText(['Asiyah']);
  await backSettled(page, 2);
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('More');
  await expect(page.locator('.ph-menu button', { hasText: 'People' })).toContainText('1 person');
  await expect.poll(serverNames(household)).toEqual(['Asiyah']);
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('signed in as the wall with a PIN, People asks for it; a paired phone does not', async ({ browser }) => {
  const household = `phtasks-${RUN}-people-pin`;
  const w = await wall(browser, household);
  await w.page.locator('.rail button', { hasText: 'Tasks' }).click();
  await expect(w.page.locator('[data-column="asiyah"]')).toBeVisible({ timeout: 30_000 });
  const paired = await pairPhone(browser, w.page, household);
  await setPin(household);
  const asWall = await phone(browser, household);

  await openPeople(asWall.page);
  await asWall.page.getByRole('button', { name: 'Add a person' }).click();
  await asWall.page.waitForTimeout(500);
  await editor(asWall.page, 'Add a person').getByRole('textbox', { name: 'Name' }).fill('Nana');
  await editor(asWall.page, 'Add a person').getByRole('button', { name: 'Add', exact: true }).click();
  await enterPin(asWall.page);
  await expect(names(asWall.page).last()).toHaveText('Nana');

  const page = paired.page;
  await openPeople(page);
  await expect(names(page).last()).toHaveText('Nana');
  await page.getByRole('button', { name: 'Move Nana up' }).click();
  await expect(names(page)).toHaveText(['Asiyah', 'Mamma', 'Baba', 'Nana', 'Hashim!']);
  await expect(page.getByRole('dialog', { name: 'Parent PIN' })).toHaveCount(0);
  await expect.poll(serverNames(household)).toEqual(['Asiyah', 'Mamma', 'Baba', 'Nana', 'Hashim!']);
  expect([...w.errors, ...asWall.errors, ...paired.errors]).toEqual([]);
});
