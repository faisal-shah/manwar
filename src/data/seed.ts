import { demoMode } from '../config';
import { metaKey } from '../calendar/engine';
import { currentTime } from '../lib/clock';
import { addDays, toISODate } from '../lib/date';
import { getDocFromServer, getDocsFromServer, limit, query } from 'firebase/firestore';
import { batch, colRef, confirmedByServer, data, householdId, newId, saveSettings, settings, settingsRef } from './store';
import {
  EVERYONE,
  type List,
  type ListItem,
  type MealCategoryId,
  type PartOfDay,
  type Profile,
  type Recipe,
  type Reward,
  type Task,
} from './types';

/** `?seed=none` gives a demo household a real household's first run (the empty state, for tests). */
const demoFamily = demoMode && new URLSearchParams(location.search).get('seed') !== 'none';

/**
 * First-run data, written once in a household's life. A real household gets
 * only the default Grocery List; the demo household gets a family that looks
 * like the one in research/00-user-device.md, so every screen has something
 * to show. The seed sets `settings.seededAt`, so a household whose people
 * and lists were all deleted later is not seeded again.
 */
export async function seedIfEmpty(): Promise<void> {
  const hid = householdId.value;
  for (;;) {
    if (householdId.value !== hid || settings.value.seededAt) return;
    if (data.profiles.value.length || data.lists.value.length) {
      // Set up already (people or lists): mark it, so emptying it later does not seed it.
      void saveSettings({ seededAt: currentTime() });
      return;
    }
    const state = await stateOnServer();
    if (state === 'seeded') return;
    if (state === 'empty') break;
    // The server could not be asked (offline, or Firestore not connected yet): ask again shortly.
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }
  if (householdId.value !== hid) return;
  if (demoFamily) return seedDemo();
  // A fixed id: two tablets on their first run write the same list, not two.
  await batch().put('lists', grocery('grocery', [])).settings({ seededAt: currentTime() }).commit();
}

/**
 * How soon to ask again. An attempt fails at once only while Firestore counts
 * itself offline (no network, or a first connection slower than its 10 s
 * allowance), and the server's later answer raises no snapshot when the
 * empty result is unchanged, so the wait is short: a first run on a slow
 * connection gets its Grocery List seconds after the server answers.
 */
const RETRY_MS = 3_000;

/**
 * The local cache can be empty while the household is not (an offline start
 * with a cold cache); only the server can say this is a first run. Usually
 * the empty snapshots already came from it; otherwise ask. Null when it
 * cannot be reached.
 */
async function stateOnServer(): Promise<'seeded' | 'empty' | null> {
  if (confirmedByServer('profiles') && confirmedByServer('lists') && confirmedByServer('settings')) return 'empty';
  try {
    const one = (name: 'profiles' | 'lists') => getDocsFromServer(query(colRef(name), limit(1)));
    const [s, p, l] = await Promise.all([getDocFromServer(settingsRef()), one('profiles'), one('lists')]);
    return s.get('seededAt') || !p.empty || !l.empty ? 'seeded' : 'empty';
  } catch {
    return null;
  }
}

function grocery(id: string, sections: List['sections']): List {
  return {
    id,
    title: 'Grocery List',
    kind: 'grocery',
    emoji: '🛒',
    sections,
    isDefaultGrocery: true,
    order: 0,
    createdAt: currentTime(),
  };
}

async function seedDemo(): Promise<void> {
  const now = currentTime();
  const today = toISODate(new Date(now));
  const b = batch();

  const profile = (id: string, name: string, color: string, order: number, stars: number, emoji?: string): Profile => ({
    id,
    name,
    color,
    emoji,
    order,
    stars,
    createdAt: now + order,
  });
  const people = [
    profile('asiyah', 'Asiyah', '#2D7F86', 0, 128),
    profile('mamma', 'Mamma', '#7E5BA6', 1, 42),
    profile('baba', 'Baba', '#2177AE', 2, 35),
    profile('hashim', 'Hashim!', '#408157', 3, 96, '🐸'),
  ];
  for (const p of people) {
    b.put('profiles', p);
    b.put('ledger', {
      id: newId(),
      profileId: p.id,
      delta: p.stars,
      reason: 'give',
      label: 'Starting balance',
      at: now - 86_400_000 * 14,
    });
  }

  let order = 0;
  const routine = (
    title: string,
    emoji: string | undefined,
    who: string[],
    parts: PartOfDay[],
    stars = 2,
    weekdays?: number[],
  ): Task => ({
    id: newId(),
    kind: 'routine',
    title,
    emoji,
    assignees: who,
    upForGrabs: false,
    stars,
    date: addDays(today, -21),
    repeat: weekdays ? { every: 1, unit: 'week', weekdays: weekdays as never } : { every: 1, unit: 'day' },
    parts,
    order: order++,
    createdAt: now,
  });
  const chore = (title: string, emoji: string | undefined, who: string[], extra: Partial<Task> = {}): Task => ({
    id: newId(),
    kind: 'chore',
    title,
    emoji,
    assignees: who,
    upForGrabs: who.length === 0,
    stars: 5,
    date: today,
    order: order++,
    createdAt: now,
    ...extra,
  });
  const tasks: Task[] = [
    routine('Breakfast', '🍳', ['asiyah', 'hashim'], ['morning']),
    routine('Dua and Washing face', '🤲', ['asiyah', 'hashim'], ['morning']),
    routine('Get Ready', '☀️', ['asiyah', 'mamma', 'baba'], ['morning']),
    routine('Change Pull Up', '🧻', ['asiyah'], ['morning', 'evening']),
    routine('Get ready', '👕', ['hashim'], ['morning']),
    routine('Bathroom', '🧻', ['hashim'], ['morning', 'afternoon']),
    routine('Reading', '📖', ['asiyah', 'mamma'], ['afternoon'], 3),
    routine('Eat and drink something', '☕', ['mamma'], ['afternoon'], 1),
    routine('Dinner', undefined, ['mamma'], ['afternoon'], 0),
    routine('Dinner', '🍲', ['baba'], ['evening'], 0),
    routine('Brush teeth', '🪥', ['asiyah', 'hashim'], ['morning', 'evening']),
    routine('Pajamas', '🛏️', ['asiyah', 'hashim'], ['evening']),
    routine('Kitchen cleanup', '🧽', ['mamma', 'baba'], ['evening'], 1),
    chore('Dhuhr', '🕌', ['baba', 'mamma'], {
      time: '13:30',
      repeat: { every: 1, unit: 'day' },
      date: addDays(today, -30),
      stars: 0,
    }),
    chore('Tidy toys', '🧸', ['hashim'], { repeat: { every: 1, unit: 'day' }, date: addDays(today, -30) }),
    chore('Feed the fish', '🐟', ['asiyah'], { repeat: { every: 1, unit: 'week', weekdays: [1, 4] }, date: addDays(today, -30) }),
    chore('Water the plants', '🪴', ['asiyah'], { date: addDays(today, -2), stars: 10 }),
    chore('Empty dishwasher', '🍽️', [], { repeat: { every: 1, unit: 'day' }, date: addDays(today, -30), stars: 10 }),
    chore('Take out trash', '🗑️', [], {
      repeat: { every: 1, unit: 'week', weekdays: [0, 3] },
      date: addDays(today, -30),
      stars: 10,
    }),
    chore('Change bed sheets', '🛏️', ['baba'], {
      repeatAfterDone: { every: 2, unit: 'week' },
      date: addDays(today, -1),
      stars: 0,
    }),
  ];
  tasks.forEach((t) => b.put('tasks', t));

  const reward = (title: string, emoji: string, cost: number, renews = true, profiles: string[] = []): Reward => ({
    id: newId(),
    title,
    emoji,
    cost,
    profiles,
    renews,
    redeemedBy: {},
    order: order++,
    createdAt: now,
  });
  [
    reward('Ice cream trip', '🍦', 50),
    reward('Stay up 30 minutes late', '🌙', 30, true, ['asiyah', 'hashim']),
    reward('Movie night pick', '🎬', 100),
    reward('Park playdate', '🛝', 75, true, ['asiyah', 'hashim']),
    reward('New book', '📚', 150, false),
  ].forEach((r) => b.put('rewards', r));

  const sec = (name: string) => ({ id: newId(), name });
  const [produce, dairy, pantry, bakery] = [sec('Produce'), sec('Dairy'), sec('Pantry'), sec('Bakery')];
  const groceryId = newId();
  b.put('lists', grocery(groceryId, [produce, dairy, pantry, bakery]));
  const todoId = newId();
  b.put('lists', { id: todoId, title: 'To Do', kind: 'todo', emoji: '✅', sections: [], order: 1, createdAt: now });
  const packId = newId();
  b.put('lists', { id: packId, title: 'Camping packing', kind: 'other', emoji: '🏕️', sections: [], order: 2, createdAt: now });
  const item = (listId: string, text: string, sectionId?: string, done = false, qty?: string): ListItem => ({
    id: newId(),
    listId,
    sectionId,
    text,
    qty,
    done,
    doneAt: done ? now : undefined,
    order: order++,
    createdAt: now,
  });
  [
    item(groceryId, 'Bananas', produce.id),
    item(groceryId, 'Spinach', produce.id),
    item(groceryId, 'Onions', produce.id, false, '3'),
    item(groceryId, 'Milk', dairy.id, false, '2 gal'),
    item(groceryId, 'Yogurt', dairy.id),
    item(groceryId, 'Basmati rice', pantry.id),
    item(groceryId, 'Olive oil', pantry.id, true),
    item(groceryId, 'Pita bread', bakery.id),
    item(todoId, 'Call the plumber'),
    item(todoId, 'Return library books'),
    item(todoId, 'Order school supplies'),
    item(todoId, 'Renew car registration', undefined, true),
    item(packId, 'Tent'),
    item(packId, 'Sleeping bags', undefined, false, '4'),
    item(packId, 'Flashlights'),
    item(packId, 'Marshmallows'),
  ].forEach((i) => b.put('listItems', i));

  const recipe = (
    name: string,
    category: MealCategoryId,
    emoji: string,
    ingredients: string[],
    instructions: string,
    servings = 4,
  ): Recipe => ({
    id: newId(),
    name,
    category,
    emoji,
    ingredients,
    instructions,
    servings,
    createdAt: now,
  });
  const recipes = [
    recipe(
      'Chicken biryani',
      'dinner',
      '🍛',
      [
        '2 lb chicken thighs',
        '3 cups basmati rice',
        '2 onions',
        '1 cup yogurt',
        '2 tbsp biryani masala',
        'Fresh mint and cilantro',
      ],
      'Marinate the chicken in yogurt and masala for an hour. Fry the onions until golden. Par-boil the rice. Layer chicken, onions, herbs and rice; cover and cook on low for 25 minutes.',
    ),
    recipe(
      'Spaghetti',
      'dinner',
      '🍝',
      ['1 lb spaghetti', '1 lb ground beef', '1 jar marinara', '1 onion', '2 cloves garlic', 'Parmesan'],
      'Brown the beef with onion and garlic. Add marinara and simmer 15 minutes. Cook the pasta, toss with sauce, top with parmesan.',
    ),
    recipe(
      'Grilled cheese',
      'lunch',
      '🥪',
      ['8 slices bread', '8 slices cheddar', 'Butter'],
      'Butter the bread, add cheese, and cook in a pan over medium heat until golden on both sides.',
    ),
    recipe(
      'Pancakes',
      'breakfast',
      '🥞',
      ['2 cups flour', '2 eggs', '1.5 cups milk', '2 tbsp sugar', '2 tsp baking powder', 'Pinch of salt'],
      'Whisk the dry ingredients, then the wet ones, and combine. Cook quarter-cup scoops on a hot griddle until bubbles form, then flip.',
    ),
    recipe(
      'Lentil soup',
      'dinner',
      '🍲',
      ['2 cups red lentils', '1 onion', '2 carrots', '1 tsp cumin', '6 cups stock', 'Lemon'],
      'Saute onion and carrots, add cumin, lentils and stock. Simmer 25 minutes, blend, and finish with lemon.',
    ),
    recipe('Fruit', 'snack', '🍎', ['Apples', 'Grapes', 'Bananas'], 'Wash and slice.'),
    recipe('Chips', 'snack', '🥔', ['1 bag tortilla chips', 'Salsa'], 'Serve with salsa.'),
  ];
  recipes.forEach((r) => b.put('recipes', r));
  const byName = (n: string) => recipes.find((r) => r.name === n)!;
  const meal = (offset: number, category: MealCategoryId, name: string) => {
    const r = byName(name);
    b.put('meals', {
      id: newId(),
      date: addDays(today, offset),
      category,
      recipeId: r.id,
      title: r.name,
      order: 0,
      createdAt: now,
    });
  };
  meal(0, 'dinner', 'Chicken biryani');
  meal(1, 'dinner', 'Spaghetti');
  meal(2, 'dinner', 'Lentil soup');
  meal(3, 'dinner', 'Chicken biryani');
  meal(1, 'breakfast', 'Pancakes');
  meal(0, 'lunch', 'Grilled cheese');
  meal(2, 'snack', 'Chips');
  meal(3, 'snack', 'Fruit');
  b.put('meals', { id: newId(), date: addDays(today, 4), category: 'dinner', title: 'Takeout night', order: 0, createdAt: now });

  // Assignments for the demo calendar; three events on Mamma's calendar stay in triage.
  const assign = (cal: string, id: string, profiles: string[], countdown?: boolean) =>
    b.put('eventMeta', { id: metaKey(cal, id), profiles, countdown, updatedAt: now });
  const fam = 'family@demo';
  for (const id of ['handwriting', 'break1', 'reading', 'math', 'break2', 'science', 'quran-prep', 'dentist'])
    assign(fam, id, ['asiyah']);
  for (const id of ['quran', 'islamic', 'night']) assign(fam, id, ['asiyah', 'hashim']);
  assign(fam, 'nap', ['hashim']);
  assign(fam, 'swim', ['hashim']);
  assign(fam, 'prep-dinner', ['mamma']);
  assign(fam, 'playdate', ['asiyah', 'hashim', 'mamma']);
  for (const id of ['maghrib', 'isha', 'dinner', 'grandma']) assign(fam, id, [EVERYONE]);
  assign(fam, 'birthday', ['hashim'], true);
  assign(fam, 'trip', [EVERYONE], true);

  b.settings({ seededAt: now, weather: { lat: 30.2672, lon: -97.7431, name: 'Austin, Texas' } });
  await b.commit();
}
